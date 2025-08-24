
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

serve(async (req) => {
  try {
    const url = new URL(req.url)
    const callId = url.searchParams.get('callId')
    const conference = url.searchParams.get('conference')
    const participant = url.searchParams.get('participant')

    if (!callId || !conference || !participant) {
      throw new Error('Missing required parameters')
    }

    console.log(`📞 Generating TwiML for ${participant} in conference ${conference}, call ${callId}`)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    if (!supabaseUrl) {
      throw new Error('SUPABASE_URL not configured')
    }

    // Construct the media stream URL
    const mediaStreamUrl = `wss://${supabaseUrl.replace('https://', '')}/functions/v1/media-stream?callId=${callId}`

    let twiml = `<?xml version="1.0" encoding="UTF-8"?><Response>`

    if (participant === 'candidate') {
      // For candidates, start media streaming and join conference
      twiml += `
        <Start>
          <Stream url="${mediaStreamUrl}" />
        </Start>
        <Say voice="alice">Hello, please hold while we connect you with your interviewer.</Say>
        <Dial>
          <Conference 
            startConferenceOnEnter="true" 
            endConferenceOnExit="false"
            record="record-from-start"
            recordingStatusCallback="${supabaseUrl}/functions/v1/twilio-webhook?callId=${callId}&amp;type=recording"
            recordingStatusCallbackMethod="POST"
          >${conference}</Conference>
        </Dial>`
    } else {
      // For recruiters, just join the conference (media streaming already active from candidate side)
      twiml += `
        <Say voice="alice">Connecting you to the candidate now.</Say>
        <Dial>
          <Conference 
            startConferenceOnEnter="false" 
            endConferenceOnExit="true"
          >${conference}</Conference>
        </Dial>`
    }

    twiml += `</Response>`

    console.log(`✅ TwiML generated for ${participant}:`, twiml)

    return new Response(twiml, {
      headers: {
        'Content-Type': 'text/xml',
        'Access-Control-Allow-Origin': '*',
      },
    })

  } catch (error) {
    console.error('❌ TwiML generation error:', error)
    
    const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
    <Response>
      <Say voice="alice">Sorry, there was an error connecting your call. Please try again.</Say>
      <Hangup/>
    </Response>`
    
    return new Response(errorTwiml, {
      status: 500,
      headers: {
        'Content-Type': 'text/xml',
        'Access-Control-Allow-Origin': '*',
      },
    })
  }
})
