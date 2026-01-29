import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://queuelabs.avatara.id',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Generate unique call ID for this invocation to prevent double uploads
function generateCallId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`
}

// Retry configuration
const MAX_RETRIES = 3
const RETRY_DELAYS = [30000, 60000, 120000] // 30s, 60s, 120s

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

    // Auto-release stuck locks (locks older than 10 minutes past scheduled time)
    const stuckLockThreshold = new Date(now.getTime() - 10 * 60 * 1000).toISOString()
    
    const { count: releasedCount } = await supabase
      .from('contents')
      .update({ is_locked: false, upload_attempted_at: null }, { count: 'exact' })
      .eq('status', 'assigned')
      .eq('is_locked', true)
      .lt('scheduled_at', stuckLockThreshold)
    
    if (releasedCount && releasedCount > 0) {
      console.log(`🔓 Auto-released ${releasedCount} stuck locks`)
    }

    // Get all assigned contents where scheduled_at <= now and not locked
    // Also include retry_pending contents where next_retry_at <= now
    const tenMinutesAgo = stuckLockThreshold
    
    const { data: assignedContents, error: fetchError } = await supabase
      .from('contents')
      .select(`
        *,
        profile:profiles!assigned_profile_id(*)
      `)
      .eq('is_locked', false)
      .not('scheduled_at', 'is', null)
      .lte('scheduled_at', now.toISOString())
      .or(`status.eq.assigned,and(status.eq.retry_pending,next_retry_at.lte.${now.toISOString()})`)
      .or(`upload_attempted_at.is.null,upload_attempted_at.lt.${tenMinutesAgo}`)

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
      if (content.is_locked || content.status === 'uploaded' || content.status === 'removed') {
        console.log(`Skipping content ${content.id} - already locked/uploaded/removed`)
        continue
      }

      // CRITICAL: Check if this content was already successfully uploaded
      const { data: existingSuccess } = await supabase
        .from('upload_history')
        .select('id')
        .eq('content_id', content.id)
        .eq('status', 'success')
        .limit(1)

      if (existingSuccess && existingSuccess.length > 0) {
        console.log(`⚠️ Content ${content.id} already has successful upload history, marking as removed`)
        
        // Update content status to removed since it was already uploaded
        await supabase.from('contents').update({
          status: 'removed',
          removed_at: now.toISOString(),
          removed_from_profile_id: content.assigned_profile_id,
          is_locked: false
        }).eq('id', content.id)
        
        results.push({
          content_id: content.id,
          status: 'skipped',
          message: 'Already successfully uploaded previously'
        })
        continue
      }

      // OPTIMISTIC LOCKING: Lock content and set upload_attempted_at atomically
      // Use unique call_id to track which invocation has the lock
      const callId = generateCallId()
      const { error: lockError, count: lockCount } = await supabase
        .from('contents')
        .update({
          is_locked: true,
          upload_attempted_at: now.toISOString(),
          webhook_call_id: callId
        }, { count: 'exact' })
        .eq('id', content.id)
        .eq('is_locked', false)
        .in('status', ['assigned', 'retry_pending'])

      if (lockError) {
        console.log(`Failed to lock content ${content.id}: ${lockError.message}`)
        continue
      }

      // CHECK COUNT - If 0, content was already locked by another instance
      if (!lockCount || lockCount === 0) {
        console.log(`⚠️ Content ${content.id} already locked by another instance (count: ${lockCount}), skipping to prevent double upload`)
        continue
      }

      console.log(`🔒 Successfully locked content ${content.id} with callId: ${callId} (count: ${lockCount})`)

      // DOUBLE-CHECK: Verify we still own the lock before proceeding
      const { data: lockVerify } = await supabase
        .from('contents')
        .select('webhook_call_id, is_locked')
        .eq('id', content.id)
        .single()

      if (!lockVerify || lockVerify.webhook_call_id !== callId || !lockVerify.is_locked) {
        console.log(`⚠️ Lock verification failed for content ${content.id} - another instance took over`)
        continue
      }

      // Skip if profile not found
      if (!profile) {
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

      const retryCount = content.retry_count || 0
      console.log(`Processing content: ${content.id} for profile: ${profile.name}, platform: ${uploadPlatform}, retry: ${retryCount}`)

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
        
        // Send to webhook with extended timeout (120s for large videos)
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 120000)
        
        let webhookResponse: Response
        try {
          webhookResponse = await fetch(webhookUrl, {
            method: 'POST',
            body: webhookData,
            signal: controller.signal
          })
        } finally {
          clearTimeout(timeoutId)
        }

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
            // Async upload - mark as processing
            console.log(`🔄 Async upload detected for content ${content.id}, request_id: ${asyncRequestId}`)
            
            await supabase
              .from('contents')
              .update({
                status: 'processing',
                is_locked: false,
                webhook_response: responseJson,
                uploadpost_request_id: asyncRequestId,
                retry_count: 0,
                next_retry_at: null
              })
              .eq('id', content.id)

            results.push({
              content_id: content.id,
              status: 'processing',
              message: `Upload processing in background, request_id: ${asyncRequestId}`
            })

          } else {
            // Synchronous success - move to removed
            await supabase
              .from('contents')
              .update({
                status: 'removed',
                removed_at: now.toISOString(),
                removed_from_profile_id: profile.id,
                scheduled_slot_id: null,
                scheduled_at: null,
                is_locked: false,
                webhook_response: responseJson,
                retry_count: 0,
                next_retry_at: null
              })
              .eq('id', content.id)

            // Add to upload_history (with duplicate protection via unique index)
            const { error: historyError } = await supabase
              .from('upload_history')
              .insert({
                content_id: content.id,
                profile_id: profile.id,
                user_id: content.user_id,
                status: 'success',
                uploaded_at: now.toISOString()
              })

            if (historyError && !historyError.message?.includes('duplicate')) {
              console.error(`Error adding to upload history:`, historyError)
            }

            results.push({
              content_id: content.id,
              status: 'success',
              message: 'Upload successful'
            })

            console.log(`✅ Content ${content.id} uploaded successfully and moved to removed`)
          }

        } else {
          // Failed - check if we should retry (especially for 504 timeouts)
          const is504Timeout = webhookResponse.status === 504
          const canRetry = retryCount < MAX_RETRIES

          if (is504Timeout && canRetry) {
            // Schedule for retry with exponential backoff
            const nextRetryDelay = RETRY_DELAYS[retryCount] || RETRY_DELAYS[RETRY_DELAYS.length - 1]
            const nextRetryAt = new Date(now.getTime() + nextRetryDelay)

            console.log(`⏰ Scheduling retry ${retryCount + 1}/${MAX_RETRIES} for content ${content.id} at ${nextRetryAt.toISOString()}`)

            await supabase
              .from('contents')
              .update({
                status: 'retry_pending',
                is_locked: false,
                webhook_response: responseJson,
                retry_count: retryCount + 1,
                next_retry_at: nextRetryAt.toISOString()
              })
              .eq('id', content.id)

            results.push({
              content_id: content.id,
              status: 'retry_scheduled',
              message: `504 timeout, retry ${retryCount + 1}/${MAX_RETRIES} scheduled for ${nextRetryAt.toISOString()}`
            })

          } else {
            // Final failure - mark as failed
            const errorMessage = `Webhook returned ${webhookResponse.status}: ${responseText}`
            
            await supabase
              .from('contents')
              .update({
                status: 'failed',
                is_locked: false,
                webhook_response: responseJson,
                retry_count: retryCount,
                next_retry_at: null
              })
              .eq('id', content.id)

            // Add to upload_history with error
            await supabase
              .from('upload_history')
              .insert({
                content_id: content.id,
                profile_id: profile.id,
                user_id: content.user_id,
                status: 'failed',
                error_message: errorMessage,
                uploaded_at: now.toISOString()
              })

            results.push({
              content_id: content.id,
              status: 'failed',
              message: errorMessage
            })

            console.log(`🔓❌ Content ${content.id} upload failed after ${retryCount} retries: ${errorMessage}`)
          }
        }

      } catch (processingError) {
        const errorMessage = processingError instanceof Error ? processingError.message : 'Unknown error'
        console.error(`Error processing content ${content.id}:`, processingError)
        
        // Check if it's a timeout/network error that should be retried
        const isTimeoutError = errorMessage.includes('aborted') || errorMessage.includes('timeout')
        const canRetry = retryCount < MAX_RETRIES

        if (isTimeoutError && canRetry) {
          const nextRetryDelay = RETRY_DELAYS[retryCount] || RETRY_DELAYS[RETRY_DELAYS.length - 1]
          const nextRetryAt = new Date(now.getTime() + nextRetryDelay)

          console.log(`⏰ Scheduling retry ${retryCount + 1}/${MAX_RETRIES} for content ${content.id} due to timeout`)

          await supabase
            .from('contents')
            .update({
              status: 'retry_pending',
              is_locked: false,
              retry_count: retryCount + 1,
              next_retry_at: nextRetryAt.toISOString()
            })
            .eq('id', content.id)

          results.push({
            content_id: content.id,
            status: 'retry_scheduled',
            message: `Timeout error, retry ${retryCount + 1}/${MAX_RETRIES} scheduled`
          })
        } else {
          // Release lock on non-retryable error
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
