
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
    const { candidateId, candidateName, candidatePhone } = await req.json()

    if (!candidateId || !candidatePhone) {
      throw new Error('Missing required fields')
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get the user from the auth header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('No authorization header')
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      throw new Error('Invalid authentication')
    }

    // Create a unique conference name for this call
    const conferenceName = `call-${candidateId}-${Date.now()}`

    // Create a call record
    const { data: callData, error: callError } = await supabase
      .from('calls')
      .insert({
        recruiter_id: user.id,
        candidate_id: candidateId,
        status: 'initiated'
      })
      .select()
      .single()

    if (callError) throw callError

    // Get Twilio credentials
    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID')
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN')
    const twilioPhoneNumber = Deno.env.get('TWILIO_PHONE_NUMBER')

    if (!twilioAccountSid || !twilioAuthToken || !twilioPhoneNumber) {
      throw new Error('Twilio credentials not configured')
    }

    // Create Twilio call to candidate
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Calls.json`
    const twimlUrl = `${supabaseUrl}/functions/v1/call-twiml?callId=${callData.id}&conference=${conferenceName}&participant=candidate`

    const formData = new URLSearchParams()
    formData.append('To', candidatePhone)
    formData.append('From', twilioPhoneNumber)
    formData.append('Url', twimlUrl)
    formData.append('StatusCallback', `${supabaseUrl}/functions/v1/twilio-webhook?callId=${callData.id}`)
    formData.append('StatusCallbackEvent', 'initiated,ringing,answered,completed')
    formData.append('Record', 'true')
    formData.append('RecordingStatusCallback', `${supabaseUrl}/functions/v1/twilio-webhook?callId=${callData.id}&type=recording`)

    const twilioResponse = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(`${twilioAccountSid}:${twilioAuthToken}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData
    })

    if (!twilioResponse.ok) {
      const errorText = await twilioResponse.text()
      throw new Error(`Twilio API error: ${errorText}`)
    }

    const twilioData = await twilioResponse.json()

    // Update call record with Twilio SID and conference name
    await supabase
      .from('calls')
      .update({
        twilio_call_sid: twilioData.sid,
        status: 'ringing'
      })
      .eq('id', callData.id)

    return new Response(
      JSON.stringify({ 
        success: true, 
        callId: callData.id,
        twilioSid: twilioData.sid,
        conferenceName,
        message: 'Call initiated to candidate. You will receive a call shortly to connect you.'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error initiating call:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
