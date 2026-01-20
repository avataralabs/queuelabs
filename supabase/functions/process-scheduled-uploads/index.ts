import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface AssignedContentWithDetails {
  id: string
  file_name: string
  caption: string | null
  description: string | null
  file_url: string | null
  status: string
  is_locked: boolean
  user_id: string
  assigned_profile_id: string
  scheduled_slot_id: string
  scheduled_at: string
  profile: {
    id: string
    name: string
    platform: string
    uploadpost_username: string | null
    connected_accounts: any[]
  }
  slot: {
    id: string
    platform: string
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const webhookUrl = Deno.env.get('WEBHOOK_URL')

    if (!webhookUrl) {
      console.error('WEBHOOK_URL not configured')
      return new Response(
        JSON.stringify({ error: 'WEBHOOK_URL not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const now = new Date()
    
    console.log(`[${now.toISOString()}] Processing scheduled uploads...`)

    // Auto-release stuck locks (locks older than 5 minutes past scheduled time)
    const stuckLockThreshold = new Date(now.getTime() - 5 * 60 * 1000).toISOString()
    
    const { count: releasedCount } = await supabase
      .from('contents')
      .update({ is_locked: false }, { count: 'exact' })
      .eq('status', 'assigned')
      .eq('is_locked', true)
      .lt('scheduled_at', stuckLockThreshold)
    
    if (releasedCount && releasedCount > 0) {
      console.log(`🔓 Auto-released ${releasedCount} stuck locks`)
    }

    // Get all assigned contents where scheduled_at <= now and not locked
    // Exclude contents that were attempted within the last 5 minutes (retry cooldown)
    const fiveMinutesAgo = stuckLockThreshold
    
    const { data: assignedContents, error: fetchError } = await supabase
      .from('contents')
      .select(`
        *,
        profile:profiles!assigned_profile_id(*)
      `)
      .eq('status', 'assigned')
      .eq('is_locked', false)
      .not('scheduled_at', 'is', null)
      .lte('scheduled_at', now.toISOString())
      .or(`upload_attempted_at.is.null,upload_attempted_at.lt.${fiveMinutesAgo}`)

    if (fetchError) {
      console.error('Error fetching assigned contents:', fetchError)
      throw fetchError
    }

    if (!assignedContents || assignedContents.length === 0) {
      console.log('No assigned contents to process')
      return new Response(
        JSON.stringify({ message: 'No assigned contents to process', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Found ${assignedContents.length} assigned contents to process`)

    const results = []

    for (const content of assignedContents as any[]) {
      const profile = content.profile

      // Double-check: skip if already locked or uploaded
      if (content.is_locked || content.status === 'uploaded') {
        console.log(`Skipping content ${content.id} - already locked or uploaded`)
        continue
      }

      // OPTIMISTIC LOCKING: Lock content BEFORE processing to prevent race condition
      const { error: lockError, count: lockCount } = await supabase
        .from('contents')
        .update({ is_locked: true }, { count: 'exact' })
        .eq('id', content.id)
        .eq('is_locked', false) // Only update if not already locked
        .eq('status', 'assigned') // Only update if still assigned

      if (lockError) {
        console.log(`Failed to lock content ${content.id}: ${lockError.message}`)
        continue
      }

      // CHECK COUNT - If 0, content was already locked by another instance
      if (!lockCount || lockCount === 0) {
        console.log(`⚠️ Content ${content.id} already locked by another instance (count: ${lockCount}), skipping to prevent double upload`)
        continue
      }

      console.log(`🔒 Successfully locked content ${content.id} (count: ${lockCount})`)

      // Skip if profile not found
      if (!profile) {
        // Release lock since we can't process
        await supabase.from('contents').update({ is_locked: false }).eq('id', content.id)
        console.log(`Skipping content ${content.id} - missing profile, lock released`)
        continue
      }

      // Get platform: prioritize content.platform (manual mode), then slot, then profile
      let uploadPlatform = content.platform || profile.platform
      if (!content.platform && content.scheduled_slot_id) {
        const { data: slot } = await supabase
          .from('schedule_slots')
          .select('platform')
          .eq('id', content.scheduled_slot_id)
          .single()
        if (slot) {
          uploadPlatform = slot.platform
        }
      }

      console.log(`Processing content: ${content.id} for profile: ${profile.name}`)

      try {
        // Prepare data for webhook
        const webhookData = new FormData()
        webhookData.append('data', 'upload')
        webhookData.append('platform', uploadPlatform || '')
        webhookData.append('title', content.caption || content.file_name || '')
        webhookData.append('description', content.description || '')
        webhookData.append('user', profile.uploadpost_username || profile.name)

        // If there's a file path, download from private storage bucket
        if (content.file_url) {
          try {
            console.log(`Downloading file from storage: ${content.file_url}`)
            
            // Use Supabase Storage API to download from private bucket
            const { data: fileData, error: downloadError } = await supabase.storage
              .from('content-files')
              .download(content.file_url)
            
            if (downloadError) {
              console.error('Error downloading file from storage:', downloadError)
            } else if (fileData) {
              const fileName = content.file_name || 'content_file'
              webhookData.append('video', fileData, fileName)
              console.log(`File attached: ${fileName}, size: ${fileData.size} bytes`)
            }
          } catch (fileError) {
            console.error('Error fetching file:', fileError)
          }
        }

        console.log(`Sending to webhook: ${webhookUrl}`)
        
        // Send to webhook
        const webhookResponse = await fetch(webhookUrl, {
          method: 'POST',
          body: webhookData,
        })

        const responseText = await webhookResponse.text()
        let responseJson = null
        try {
          responseJson = JSON.parse(responseText)
        } catch {
          responseJson = { raw: responseText }
        }

        console.log(`Webhook response status: ${webhookResponse.status}`)
        console.log(`Webhook response body:`, responseJson)

        if (webhookResponse.ok) {
          // Check if this is an async/background upload response
          const isAsyncUpload = Array.isArray(responseJson) 
            ? responseJson[0]?.request_id && responseJson[0]?.message?.includes('background')
            : responseJson?.request_id && responseJson?.message?.includes('background')
          
          const asyncRequestId = Array.isArray(responseJson)
            ? responseJson[0]?.request_id
            : responseJson?.request_id

          if (isAsyncUpload && asyncRequestId) {
            // Async upload - mark as processing, store request_id for later polling
            console.log(`🔄 Async upload detected for content ${content.id}, request_id: ${asyncRequestId}`)
            
            const { error: updateError } = await supabase
              .from('contents')
              .update({
                status: 'processing',
                is_locked: false,
                upload_attempted_at: now.toISOString(),
                webhook_response: responseJson,
                uploadpost_request_id: asyncRequestId
              })
              .eq('id', content.id)

            if (updateError) {
              console.error(`Error updating content ${content.id} to processing:`, updateError)
              throw updateError
            }

            results.push({
              content_id: content.id,
              status: 'processing',
              message: `Upload processing in background, request_id: ${asyncRequestId}`
            })

            console.log(`🔄 Content ${content.id} marked as processing, will be polled for status`)

          } else {
            // Synchronous success - move content to trash
            const { error: updateError } = await supabase
              .from('contents')
              .update({
                status: 'removed',
                removed_at: now.toISOString(),
                removed_from_profile_id: profile.id,
                scheduled_slot_id: null,
                scheduled_at: null,
                is_locked: false,
                upload_attempted_at: now.toISOString(),
                webhook_response: responseJson
              })
              .eq('id', content.id)

            if (updateError) {
              console.error(`Error updating content ${content.id}:`, updateError)
              throw updateError
            }

            // Check for duplicate history entry before inserting
            const { data: recentSuccessHistory } = await supabase
              .from('upload_history')
              .select('id')
              .eq('content_id', content.id)
              .gte('uploaded_at', fiveMinutesAgo)
              .limit(1)

            if (recentSuccessHistory && recentSuccessHistory.length > 0) {
              console.log(`Skipping history insert - recent entry exists for ${content.id}`)
            } else {
              // Add to upload_history
              const { error: historyError } = await supabase
                .from('upload_history')
                .insert({
                  content_id: content.id,
                  profile_id: profile.id,
                  user_id: content.user_id,
                  status: 'success',
                  uploaded_at: now.toISOString()
                })

              if (historyError) {
                console.error(`Error adding to upload history:`, historyError)
              }
            }

            results.push({
              content_id: content.id,
              status: 'success',
              message: 'Upload successful'
            })

            console.log(`✅ Content ${content.id} uploaded successfully and moved to trash`)
          }

        } else {
          // Failed - release lock and log error
          const errorMessage = `Webhook returned ${webhookResponse.status}: ${responseText}`
          
          const { error: updateError } = await supabase
            .from('contents')
            .update({
              status: 'failed',
              is_locked: false, // Release lock on failure
              upload_attempted_at: now.toISOString(),
              webhook_response: responseJson
            })
            .eq('id', content.id)

          if (updateError) {
            console.error(`Error updating failed content ${content.id}:`, updateError)
          }

          // Check for duplicate history entry before inserting
          const { data: recentHistory } = await supabase
            .from('upload_history')
            .select('id')
            .eq('content_id', content.id)
            .gte('uploaded_at', fiveMinutesAgo)
            .limit(1)

          if (recentHistory && recentHistory.length > 0) {
            console.log(`Skipping history insert - recent entry exists for ${content.id}`)
          } else {
            // Add to upload_history with error
            const { error: historyError } = await supabase
              .from('upload_history')
              .insert({
                content_id: content.id,
                profile_id: profile.id,
                user_id: content.user_id,
                status: 'failed',
                error_message: errorMessage,
                uploaded_at: now.toISOString()
              })

            if (historyError) {
              console.error(`Error adding to upload history:`, historyError)
            }
          }

          results.push({
            content_id: content.id,
            status: 'failed',
            message: errorMessage
          })

          console.log(`🔓❌ Content ${content.id} upload failed, lock released: ${errorMessage}`)
        }

      } catch (processingError) {
        const errorMessage = processingError instanceof Error ? processingError.message : 'Unknown error'
        console.error(`Error processing content ${content.id}:`, processingError)
        
        // Release lock on error so content can be retried
        await supabase
          .from('contents')
          .update({ is_locked: false })
          .eq('id', content.id)
        
        console.log(`🔓 Released lock on content ${content.id} due to error`)
        
        results.push({
          content_id: content.id,
          status: 'error',
          message: errorMessage
        })
      }
    }

    console.log(`Processing complete. Results:`, results)

    return new Response(
      JSON.stringify({
        message: 'Processing complete',
        processed: results.length,
        results
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('Error in process-scheduled-uploads:', error)
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
