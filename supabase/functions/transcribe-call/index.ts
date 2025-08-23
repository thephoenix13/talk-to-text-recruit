
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
    const { callId, recordingUrl } = await req.json()

    if (!callId || !recordingUrl) {
      throw new Error('Missing required parameters')
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Download the recording from Twilio
    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID')
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN')

    const recordingResponse = await fetch(recordingUrl, {
      headers: {
        'Authorization': `Basic ${btoa(`${twilioAccountSid}:${twilioAuthToken}`)}`
      }
    })

    if (!recordingResponse.ok) {
      throw new Error('Failed to download recording')
    }

    const audioBuffer = await recordingResponse.arrayBuffer()
    const audioBlob = new Blob([audioBuffer], { type: 'audio/wav' })

    // Send to OpenAI Whisper for transcription
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiApiKey) {
      throw new Error('OpenAI API key not configured')
    }

    const formData = new FormData()
    formData.append('file', audioBlob, 'recording.wav')
    formData.append('model', 'whisper-1')

    const transcriptionResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
      },
      body: formData
    })

    if (!transcriptionResponse.ok) {
      throw new Error('Failed to transcribe audio')
    }

    const transcriptionData = await transcriptionResponse.json()
    const transcript = transcriptionData.text

    // Generate summary using GPT
    let summary = null
    if (transcript && transcript.length > 50) {
      const summaryResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'You are an AI assistant helping recruiters analyze candidate phone interviews. Provide a concise summary highlighting key skills, experience, availability, and overall impression.'
            },
            {
              role: 'user',
              content: `Please summarize this recruitment call transcript:\n\n${transcript}`
            }
          ],
          max_tokens: 300
        })
      })

      if (summaryResponse.ok) {
        const summaryData = await summaryResponse.json()
        summary = summaryData.choices[0]?.message?.content
      }
    }

    // Update the call record with transcript and summary
    await supabase
      .from('calls')
      .update({
        transcript,
        summary,
        status: 'completed'
      })
      .eq('id', callId)

    console.log(`Transcribed call ${callId}`)

    return new Response(
      JSON.stringify({ 
        success: true, 
        transcript,
        summary 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Transcription error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
