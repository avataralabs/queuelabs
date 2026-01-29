import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://queuelabs.avatara.id',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const UPLOADPOST_API_BASE = 'https://api.upload-post.com'
const MAX_PROCESSING_TIME_MS = 30 * 60 * 1000 // 30 minutes max processing time

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const uploadpostApiKey = Deno.env.get('UPLOADPOST_API_KEY')

    if (!uploadpostApiKey) {
      console.error('UPLOADPOST_API_KEY not configured')
      return new Response(
        JSON.stringify({ error: 'UPLOADPOST_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const now = new Date()
    
    console.log(`[${now.toISOString()}] Checking upload statuses for processing contents...`)

    // Get all contents with status 'processing' that have a request_id
    const { data: processingContents, error: fetchError } = await supabase
      .from('contents')
      .select(`
        *,
        profile:profiles!assigned_profile_id(id, name, platform)
      `)
      .eq('status', 'processing')
      .not('uploadpost_request_id', 'is', null)

    if (fetchError) {
      console.error('Error fetching processing contents:', fetchError)
      throw fetchError
    }

    if (!processingContents || processingContents.length === 0) {
      console.log('No processing contents to check')
      return new Response(
        JSON.stringify({ message: 'No processing contents to check', checked: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Found ${processingContents.length} processing contents to check`)

    const results = []

    for (const content of processingContents as any[]) {
      const requestId = content.uploadpost_request_id
      const profile = content.profile

      console.log(`Checking status for content ${content.id}, request_id: ${requestId}`)

      try {
        // Check if processing has timed out (more than 30 minutes)
        const uploadAttemptedAt = new Date(content.upload_attempted_at)
        const processingDuration = now.getTime() - uploadAttemptedAt.getTime()
        
        if (processingDuration > MAX_PROCESSING_TIME_MS) {
          console.log(`⏰ Content ${content.id} processing timed out after ${Math.round(processingDuration / 60000)} minutes`)
          
          // Mark as failed due to timeout
          await supabase
            .from('contents')
            .update({
              status: 'failed',
              webhook_response: { 
                ...content.webhook_response, 
                timeout_error: `Processing timed out after ${Math.round(processingDuration / 60000)} minutes` 
              }
            })
            .eq('id', content.id)

          // Add to upload_history
          await supabase
            .from('upload_history')
            .insert({
              content_id: content.id,
              profile_id: profile?.id,
              user_id: content.user_id,
              status: 'failed',
              error_message: `Processing timed out after ${Math.round(processingDuration / 60000)} minutes`,
              uploaded_at: now.toISOString()
            })

          results.push({
            content_id: content.id,
            status: 'timeout',
            message: 'Processing timed out'
          })
          continue
        }

        // Poll Upload-Post API for status
        const statusUrl = `${UPLOADPOST_API_BASE}/api/uploadposts/status?request_id=${requestId}`
        console.log(`Polling status URL: ${statusUrl}`)
        
        const statusResponse = await fetch(statusUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${uploadpostApiKey}`,
            'Content-Type': 'application/json'
          }
        })

        const statusText = await statusResponse.text()
        let statusJson = null
        try {
          statusJson = JSON.parse(statusText)
        } catch {
          statusJson = { raw: statusText }
        }

        console.log(`Status response for ${content.id}:`, statusJson)

        // Determine the actual status
        const uploadStatus = statusJson?.status?.toLowerCase() || statusJson?.state?.toLowerCase()
        
        if (uploadStatus === 'completed' || uploadStatus === 'success' || statusJson?.success === true) {
          // Upload completed successfully
          console.log(`✅ Content ${content.id} upload confirmed successful`)
          
          await supabase
            .from('contents')
            .update({
              status: 'removed',
              removed_at: now.toISOString(),
              removed_from_profile_id: profile?.id,
              scheduled_slot_id: null,
              scheduled_at: null,
              webhook_response: statusJson,
              uploadpost_request_id: null // Clear request_id
            })
            .eq('id', content.id)

          // Add success to upload_history
          await supabase
            .from('upload_history')
            .insert({
              content_id: content.id,
              profile_id: profile?.id,
              user_id: content.user_id,
              status: 'success',
              uploaded_at: now.toISOString()
            })

          results.push({
            content_id: content.id,
            status: 'success',
            message: 'Upload confirmed successful'
          })

        } else if (uploadStatus === 'failed' || uploadStatus === 'error' || statusJson?.success === false) {
          // Upload failed
          const errorMessage = statusJson?.error || statusJson?.message || 'Upload failed'
          console.log(`❌ Content ${content.id} upload confirmed failed: ${errorMessage}`)
          
          await supabase
            .from('contents')
            .update({
              status: 'failed',
              webhook_response: statusJson,
              uploadpost_request_id: null // Clear request_id
            })
            .eq('id', content.id)

          // Add failure to upload_history
          await supabase
            .from('upload_history')
            .insert({
              content_id: content.id,
              profile_id: profile?.id,
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

        } else if (uploadStatus === 'processing' || uploadStatus === 'pending' || uploadStatus === 'queued') {
          // Still processing - just log and continue
          console.log(`🔄 Content ${content.id} still processing (status: ${uploadStatus})`)
          
          results.push({
            content_id: content.id,
            status: 'still_processing',
            message: `Still processing (${uploadStatus})`
          })

        } else {
          // Unknown status - log for debugging
          console.log(`❓ Content ${content.id} unknown status:`, statusJson)
          
          results.push({
            content_id: content.id,
            status: 'unknown',
            message: `Unknown status response: ${JSON.stringify(statusJson)}`
          })
        }

      } catch (pollError) {
        const errorMessage = pollError instanceof Error ? pollError.message : 'Unknown error'
        console.error(`Error polling status for content ${content.id}:`, pollError)
        
        results.push({
          content_id: content.id,
          status: 'error',
          message: errorMessage
        })
      }
    }

    console.log(`Status check complete. Results:`, results)

    return new Response(
      JSON.stringify({
        message: 'Status check complete',
        checked: results.length,
        results
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('Error in check-upload-status:', error)
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
