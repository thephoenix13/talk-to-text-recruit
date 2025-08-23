
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const callId = url.searchParams.get('callId')
    const type = url.searchParams.get('type')

    if (!callId) {
      throw new Error('Missing callId parameter')
    }

    // Parse form data from Twilio
    const formData = await req.formData()
    const data: Record<string, string> = {}
    for (const [key, value] of formData.entries()) {
      data[key] = value.toString()
    }

    console.log('Twilio webhook data:', data)
    console.log('Call ID:', callId, 'Type:', type)

    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    if (type === 'recording') {
      // Handle recording callback
      const recordingUrl = data.RecordingUrl
      const recordingSid = data.RecordingSid
      
      if (recordingUrl) {
        console.log('Recording available:', recordingUrl)
        // Update call with recording URL
        await supabase
          .from('calls')
          .update({ 
            recording_url: recordingUrl,
            status: 'completed'
          })
          .eq('id', callId)

        // Trigger transcription
        await supabase.functions.invoke('transcribe-call', {
          body: { callId, recordingUrl }
        })
      }
    } else {
      // Handle call status updates
      const callStatus = data.CallStatus
      const callDuration = data.CallDuration ? parseInt(data.CallDuration) : null

      console.log('Call status update:', callStatus, 'for call:', callId)

      const updateData: any = {}
      
      // Map Twilio statuses to our statuses more accurately
      if (callStatus === 'ringing') {
        updateData.status = 'ringing'
      } else if (callStatus === 'in-progress' || callStatus === 'answered') {
        updateData.status = 'in-progress'
        console.log('Call is now in-progress, starting real-time transcription')
      } else if (callStatus === 'completed') {
        updateData.status = 'completed'
        if (callDuration) {
          updateData.duration_seconds = callDuration
          updateData.ended_at = new Date().toISOString()
        }
      } else if (callStatus === 'busy') {
        updateData.status = 'busy'
      } else if (callStatus === 'no-answer') {
        updateData.status = 'no-answer'
      } else if (callStatus === 'failed') {
        updateData.status = 'failed'
      }

      if (Object.keys(updateData).length > 0) {
        console.log('Updating call with:', updateData)
        const { error } = await supabase
          .from('calls')
          .update(updateData)
          .eq('id', callId)

        if (error) {
          console.error('Error updating call:', error)
        } else {
          console.log('Call updated successfully')
        }

        // If call is now in-progress, start real-time transcription
        if (updateData.status === 'in-progress') {
          console.log('Starting real-time transcription for in-progress call')
          try {
            await supabase.functions.invoke('transcribe-call', {
              body: { 
                callId, 
                isRealtime: true,
                audioData: 'start_realtime'
              }
            })
          } catch (transcribeError) {
            console.error('Error starting real-time transcription:', transcribeError)
          }
        }
      }
    }

    return new Response('OK', { headers: corsHeaders })

  } catch (error) {
    console.error('Webhook error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
