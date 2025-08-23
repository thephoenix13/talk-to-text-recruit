
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

    // Get recruiter's phone number from profiles
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('phone')
      .eq('id', user.id)
      .single()

    if (profileError || !profile?.phone) {
      throw new Error('Please set your phone number in your profile before making calls')
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

    console.log('📋 Call record created:', callData.id)

    // Get Twilio credentials
    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID')
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN')
    const twilioPhoneNumber = Deno.env.get('TWILIO_PHONE_NUMBER')

    if (!twilioAccountSid || !twilioAuthToken || !twilioPhoneNumber) {
      throw new Error('Twilio credentials not configured')
    }

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Calls.json`

    // 1. Call the candidate first
    const candidateTwimlUrl = `${supabaseUrl}/functions/v1/call-twiml?callId=${callData.id}&conference=${conferenceName}&participant=candidate`

    const candidateFormData = new URLSearchParams()
    candidateFormData.append('To', candidatePhone)
    candidateFormData.append('From', twilioPhoneNumber)
    candidateFormData.append('Url', candidateTwimlUrl)
    // Enhanced status callback events to capture all status changes
    candidateFormData.append('StatusCallback', `${supabaseUrl}/functions/v1/twilio-webhook?callId=${callData.id}`)
    candidateFormData.append('StatusCallbackEvent', 'initiated,ringing,answered,in-progress,completed,busy,no-answer,failed,canceled')
    candidateFormData.append('StatusCallbackMethod', 'POST')

    console.log('📞 Calling candidate:', candidatePhone, 'with callback events:', 'initiated,ringing,answered,in-progress,completed,busy,no-answer,failed,canceled')

    const candidateResponse = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(`${twilioAccountSid}:${twilioAuthToken}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: candidateFormData
    })

    if (!candidateResponse.ok) {
      const errorText = await candidateResponse.text()
      throw new Error(`Failed to call candidate: ${errorText}`)
    }

    const candidateData = await candidateResponse.json()
    console.log('✅ Candidate call initiated:', candidateData.sid)

    // 2. Wait a moment, then call the recruiter
    setTimeout(async () => {
      try {
        const recruiterTwimlUrl = `${supabaseUrl}/functions/v1/call-twiml?callId=${callData.id}&conference=${conferenceName}&participant=recruiter`

        const recruiterFormData = new URLSearchParams()
        recruiterFormData.append('To', profile.phone)
        recruiterFormData.append('From', twilioPhoneNumber)
        recruiterFormData.append('Url', recruiterTwimlUrl)
        recruiterFormData.append('StatusCallback', `${supabaseUrl}/functions/v1/twilio-webhook?callId=${callData.id}&type=recruiter`)
        recruiterFormData.append('StatusCallbackEvent', 'initiated,ringing,answered,in-progress,completed,busy,no-answer,failed,canceled')
        recruiterFormData.append('StatusCallbackMethod', 'POST')

        console.log('📞 Calling recruiter:', profile.phone)

        const recruiterResponse = await fetch(twilioUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${btoa(`${twilioAccountSid}:${twilioAuthToken}`)}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: recruiterFormData
        })

        if (!recruiterResponse.ok) {
          console.error('❌ Failed to call recruiter:', await recruiterResponse.text())
        } else {
          const recruiterData = await recruiterResponse.json()
          console.log('✅ Recruiter call initiated:', recruiterData.sid)
        }
      } catch (error) {
        console.error('❌ Error calling recruiter:', error)
      }
    }, 3000) // Wait 3 seconds before calling recruiter

    // Update call record with Twilio SID and set status to ringing
    await supabase
      .from('calls')
      .update({
        twilio_call_sid: candidateData.sid,
        status: 'ringing'
      })
      .eq('id', callData.id)

    console.log('📞 Call updated to ringing status')

    return new Response(
      JSON.stringify({ 
        success: true, 
        callId: callData.id,
        twilioSid: candidateData.sid,
        conferenceName,
        message: `Calling ${candidateName}... You will receive a call on ${profile.phone} shortly to connect you.`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('❌ Error initiating call:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
