
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
    const { callId, recordingUrl, isRealtime = false, audioData } = await req.json()

    if (!callId) {
      throw new Error('Missing callId parameter')
    }

    console.log(`📋 Transcribe request: callId=${callId}, isRealtime=${isRealtime}`)

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    if (isRealtime) {
      console.log(`🔄 Processing realtime transcription request for call ${callId}`)
      
      // For realtime requests, check if there's a recording available for this active call
      const { data: callData, error: callError } = await supabase
        .from('calls')
        .select('*')
        .eq('id', callId)
        .single()

      if (callError) {
        console.error('❌ Error fetching call data:', callError)
        throw callError
      }

      if (callData.status !== 'in-progress') {
        console.log(`⏹️ Call ${callId} is not in progress (${callData.status}), skipping transcription`)
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: 'Call not in progress',
            transcript: callData.transcript || ''
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // For realtime transcription during active calls
      // Generate progressive simulated transcript for testing
      let currentTranscript = callData.transcript || ''
      
      // Simulate progressive transcription with realistic content
      const realtimeSegments = [
        '[Call connected - Real-time transcription starting...]',
        '[Call connected - Real-time transcription starting...] Hello, this is a test call.',
        '[Call connected - Real-time transcription starting...] Hello, this is a test call. We are now speaking...',
        '[Call connected - Real-time transcription starting...] Hello, this is a test call. We are now speaking and the system should be capturing our conversation in real-time.',
        '[Call connected - Real-time transcription starting...] Hello, this is a test call. We are now speaking and the system should be capturing our conversation in real-time. This is a simulated transcript for testing purposes.',
        '[Call connected - Real-time transcription starting...] Hello, this is a test call. We are now speaking and the system should be capturing our conversation in real-time. This is a simulated transcript for testing purposes. The conversation continues...',
      ]
      
      // Determine which segment to show based on call duration
      const callStartTime = new Date(callData.started_at).getTime()
      const currentTime = Date.now()
      const callDurationSeconds = Math.floor((currentTime - callStartTime) / 1000)
      
      console.log(`⏰ Call duration: ${callDurationSeconds} seconds`)
      
      // Progress through segments based on call duration
      const segmentIndex = Math.min(Math.floor(callDurationSeconds / 10), realtimeSegments.length - 1)
      const newTranscript = realtimeSegments[segmentIndex]
      
      // Only update if transcript has changed
      if (newTranscript !== currentTranscript) {
        console.log(`📝 Updating transcript (segment ${segmentIndex}):`)
        console.log(`   Previous: "${currentTranscript.substring(0, 100)}..."`)
        console.log(`   New: "${newTranscript.substring(0, 100)}..."`)
        
        // Update the call with progressive transcript
        await supabase
          .from('calls')
          .update({ transcript: newTranscript })
          .eq('id', callId)

        console.log(`✅ Realtime transcript updated for call ${callId}`)
        
        return new Response(
          JSON.stringify({ 
            success: true, 
            transcript: newTranscript,
            isRealtime: true,
            segmentIndex,
            callDurationSeconds
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Return current transcript if no update needed
      console.log(`ℹ️ No transcript update needed for call ${callId} (segment ${segmentIndex})`)
      return new Response(
        JSON.stringify({ 
          success: true, 
          transcript: currentTranscript,
          isRealtime: true,
          segmentIndex,
          callDurationSeconds
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Handle post-call recording transcription
    let audioBlob: Blob

    if (recordingUrl) {
      console.log(`📥 Downloading recording from: ${recordingUrl}`)
      
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
      audioBlob = new Blob([audioBuffer], { type: 'audio/wav' })
    } else {
      throw new Error('Missing recording URL for post-call transcription')
    }

    // Send to OpenAI Whisper for transcription
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiApiKey) {
      throw new Error('OpenAI API key not configured')
    }

    console.log('🤖 Sending audio to OpenAI Whisper for transcription')

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
      const errorText = await transcriptionResponse.text()
      console.error('❌ OpenAI transcription error:', errorText)
      throw new Error('Failed to transcribe audio')
    }

    const transcriptionData = await transcriptionResponse.json()
    const transcript = transcriptionData.text

    console.log(`✅ Transcription completed, length: ${transcript.length} characters`)

    // Generate summary using GPT for final transcript
    let summary = null
    if (transcript && transcript.length > 50) {
      console.log('📝 Generating summary with GPT')
      
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
        console.log('✅ Summary generated successfully')
      } else {
        console.error('❌ Failed to generate summary')
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

    console.log(`✅ Final transcription completed for call ${callId}`)

    return new Response(
      JSON.stringify({ 
        success: true, 
        transcript,
        summary 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('❌ Transcription error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
