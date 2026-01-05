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

    // Get all assigned contents where scheduled_at <= now and not locked
    // Note: We fetch contents first, then fetch profile separately (no FK between contents and schedule_slots)
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

      // Skip if profile not found
      if (!profile) {
        console.log(`Skipping content ${content.id} - missing profile`)
        continue
      }

      // Fetch slot info separately if needed (for platform info)
      let slotPlatform = profile.platform // Default to profile platform
      if (content.scheduled_slot_id) {
        const { data: slot } = await supabase
          .from('schedule_slots')
          .select('platform')
          .eq('id', content.scheduled_slot_id)
          .single()
        if (slot) {
          slotPlatform = slot.platform
        }
      }

      console.log(`Processing content: ${content.id} for profile: ${profile.name}`)

      try {
        // Prepare data for webhook
        const webhookData = new FormData()
        webhookData.append('data', 'upload')
        webhookData.append('platform', slotPlatform || '')
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
          // Success - move content to trash
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

          results.push({
            content_id: content.id,
            status: 'success',
            message: 'Upload successful'
          })

          console.log(`✅ Content ${content.id} uploaded successfully and moved to trash`)

        } else {
          // Failed - log error but don't lock
          const errorMessage = `Webhook returned ${webhookResponse.status}: ${responseText}`
          
          const { error: updateError } = await supabase
            .from('contents')
            .update({
              status: 'failed',
              upload_attempted_at: now.toISOString(),
              webhook_response: responseJson
            })
            .eq('id', content.id)

          if (updateError) {
            console.error(`Error updating failed content ${content.id}:`, updateError)
          }

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

          results.push({
            content_id: content.id,
            status: 'failed',
            message: errorMessage
          })

          console.log(`❌ Content ${content.id} upload failed: ${errorMessage}`)
        }

      } catch (processingError) {
        const errorMessage = processingError instanceof Error ? processingError.message : 'Unknown error'
        console.error(`Error processing content ${content.id}:`, processingError)
        
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
