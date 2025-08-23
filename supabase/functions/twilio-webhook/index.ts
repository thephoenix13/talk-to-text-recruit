
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

    console.log('🔔 Twilio webhook received:', {
      callId,
      type,
      callStatus: data.CallStatus,
      event: data.CallStatusCallbackEvent || data.CallStatus || 'unknown',
      callSid: data.CallSid,
      from: data.From,
      to: data.To
    })

    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    if (type === 'recording') {
      // Handle recording callback
      const recordingUrl = data.RecordingUrl
      const recordingSid = data.RecordingSid
      
      if (recordingUrl) {
        console.log('🎥 Recording available:', recordingUrl)
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
      const callStatus = (data.CallStatus || '').toLowerCase()
      const callDuration = data.CallDuration ? parseInt(data.CallDuration) : null

      console.log('📞 Processing call status update:', {
        callId,
        twilioStatus: callStatus,
        duration: callDuration,
        timestamp: new Date().toISOString()
      })

      const updateData: any = {}
      
      // Enhanced status mapping
      if (callStatus === 'queued' || callStatus === 'initiated') {
        updateData.status = 'initiated'
        console.log('📱 Call initiated (queued/initiated)')
      } else if (callStatus === 'ringing') {
        updateData.status = 'ringing'
        console.log('📞 Call is ringing')
      } else if (callStatus === 'answered' || callStatus === 'in-progress') {
        updateData.status = 'in-progress'
        console.log('✅ Call answered - setting status to in-progress')
      } else if (callStatus === 'completed') {
        updateData.status = 'completed'
        if (callDuration) {
          updateData.duration_seconds = callDuration
          updateData.ended_at = new Date().toISOString()
        }
        console.log('🏁 Call completed')
      } else if (callStatus === 'busy') {
        updateData.status = 'busy'
        console.log('📵 Call was busy')
      } else if (callStatus === 'no-answer') {
        updateData.status = 'no-answer'
        console.log('📵 No answer')
      } else if (callStatus === 'failed') {
        updateData.status = 'failed'
        console.log('❌ Call failed')
      } else if (callStatus === 'canceled') {
        updateData.status = 'failed'
        console.log('🚫 Call canceled')
      }

      if (Object.keys(updateData).length > 0) {
        console.log('💾 Updating call in database:', {
          callId,
          updateData,
          timestamp: new Date().toISOString()
        })
        
        const { error } = await supabase
          .from('calls')
          .update(updateData)
          .eq('id', callId)

        if (error) {
          console.error('❌ Database update error:', error)
        } else {
          console.log('✅ Call status updated successfully:', updateData.status)
          
          // Verify the update worked
          const { data: updatedCall, error: fetchError } = await supabase
            .from('calls')
            .select('status')
            .eq('id', callId)
            .single()
          
          if (!fetchError && updatedCall) {
            console.log('🔍 Verified call status in database:', updatedCall.status)
          }
        }

        // If call is now in-progress, start real-time transcription
        if (updateData.status === 'in-progress') {
          console.log('🎙️ Call is in-progress, starting real-time transcription')
          try {
            const transcribeResult = await supabase.functions.invoke('transcribe-call', {
              body: { 
                callId, 
                isRealtime: true,
                audioData: 'start_realtime'
              }
            })
            console.log('📡 Real-time transcription started:', transcribeResult)
          } catch (transcribeError) {
            console.error('❌ Error starting real-time transcription:', transcribeError)
          }
        }
      } else {
        console.log('⚠️ No status update needed for Twilio status:', callStatus)
      }
    }

    return new Response('OK', { headers: corsHeaders })

  } catch (error) {
    console.error('💥 Webhook error:', error)
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
