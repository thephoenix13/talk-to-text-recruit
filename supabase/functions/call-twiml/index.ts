
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

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
    const conference = url.searchParams.get('conference')
    const participant = url.searchParams.get('participant')

    if (!callId || !conference) {
      throw new Error('Missing required parameters')
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const mediaStreamUrl = `wss://${new URL(supabaseUrl!).hostname.replace('https://', '')}/functions/v1/media-stream?callId=${callId}`

    let twiml = ''

    if (participant === 'candidate') {
      // TwiML for candidate - join conference and start media streaming
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="alice">Hello! Please hold while we connect you with the recruiter.</Say>
    <Start>
        <Stream url="${mediaStreamUrl}" />
    </Start>
    <Dial>
        <Conference 
            startConferenceOnEnter="false"
            endConferenceOnExit="false"
            waitUrl="http://twimlets.com/holdmusic?Bucket=com.twilio.music.ambient"
            record="record-from-start"
            recordingStatusCallback="${Deno.env.get('SUPABASE_URL')}/functions/v1/twilio-webhook?callId=${callId}&amp;type=recording"
        >${conference}</Conference>
    </Dial>
</Response>`
    } else {
      // TwiML for recruiter - join conference as moderator with media streaming
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="alice">Connecting you to the candidate now.</Say>
    <Start>
        <Stream url="${mediaStreamUrl}" />
    </Start>
    <Dial>
        <Conference 
            startConferenceOnEnter="true"
            endConferenceOnExit="true"
            record="record-from-start"
            recordingStatusCallback="${Deno.env.get('SUPABASE_URL')}/functions/v1/twilio-webhook?callId=${callId}&amp;type=recording"
        >${conference}</Conference>
    </Dial>
</Response>`
    }

    return new Response(twiml, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/xml',
      },
    })

  } catch (error) {
    console.error('TwiML error:', error)
    const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="alice">Sorry, there was an error connecting your call. Please try again later.</Say>
    <Hangup/>
</Response>`
    
    return new Response(errorTwiml, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/xml',
      },
    })
  }
})
