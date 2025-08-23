
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

    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    if (type === 'recording') {
      // Handle recording callback
      const recordingUrl = data.RecordingUrl
      const recordingSid = data.RecordingSid
      
      if (recordingUrl) {
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

      const updateData: any = { status: callStatus }
      
      if (callStatus === 'completed' && callDuration) {
        updateData.duration_seconds = callDuration
        updateData.ended_at = new Date().toISOString()
      }

      await supabase
        .from('calls')
        .update(updateData)
        .eq('id', callId)
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
