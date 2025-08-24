import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface MediaStreamEvent {
  event: string
  sequenceNumber?: string
  media?: {
    track: string
    chunk: string
    timestamp: string
    payload: string
  }
  streamSid?: string
  callSid?: string
}

// Store active streams and their audio buffers
const activeStreams = new Map<string, {
  callId: string
  audioBuffer: number[]
  lastTranscription: number
  partialTranscript: string
}>()

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const callId = url.searchParams.get('callId')

    if (!callId) {
      throw new Error('Missing callId parameter')
    }

    // Handle WebSocket upgrade for media streaming
    if (req.headers.get('upgrade') === 'websocket') {
      const { socket, response } = Deno.upgradeWebSocket(req)
      
      console.log(`🎙️ WebSocket connection established for call: ${callId}`)

      socket.onopen = () => {
        console.log(`📡 Media stream opened for call: ${callId}`)
      }

      socket.onmessage = async (event) => {
        try {
          const data: MediaStreamEvent = JSON.parse(event.data)
          
          if (data.event === 'connected') {
            console.log(`🔗 Media stream connected for call: ${callId}`)
          } else if (data.event === 'start') {
            console.log(`▶️ Media stream started for call: ${callId}, streamSid: ${data.streamSid}`)
            // Initialize stream buffer
            activeStreams.set(data.streamSid!, {
              callId,
              audioBuffer: [],
              lastTranscription: Date.now(),
              partialTranscript: ''
            })
          } else if (data.event === 'media' && data.media) {
            await handleMediaChunk(data, callId)
          } else if (data.event === 'stop') {
            console.log(`⏹️ Media stream stopped for call: ${callId}`)
            if (data.streamSid) {
              activeStreams.delete(data.streamSid)
            }
          }
        } catch (error) {
          console.error('❌ Error processing media stream message:', error)
        }
      }

      socket.onclose = () => {
        console.log(`🔌 Media stream closed for call: ${callId}`)
      }

      socket.onerror = (error) => {
        console.error('❌ Media stream error:', error)
      }

      return response
    }

    // Handle HTTP requests (media stream webhook setup)
    return new Response('Media Stream endpoint ready', { headers: corsHeaders })

  } catch (error) {
    console.error('❌ Media stream error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})

async function handleMediaChunk(data: MediaStreamEvent, callId: string) {
  const { media, streamSid } = data
  if (!media || !streamSid) return

  const streamInfo = activeStreams.get(streamSid)
  if (!streamInfo) return

  try {
    // Decode base64 audio payload (mulaw format from Twilio)
    const audioPayload = atob(media.payload)
    const audioBytes = new Uint8Array(audioPayload.length)
    
    for (let i = 0; i < audioPayload.length; i++) {
      audioBytes[i] = audioPayload.charCodeAt(i)
    }

    // Convert mulaw to PCM (simplified conversion for demo)
    const pcmSamples = mulawToPcm(audioBytes)
    streamInfo.audioBuffer.push(...pcmSamples)

    // Process audio buffer every 3 seconds for real-time transcription
    const now = Date.now()
    if (now - streamInfo.lastTranscription > 3000 && streamInfo.audioBuffer.length > 24000) {
      await processAudioBuffer(streamInfo, callId)
      streamInfo.lastTranscription = now
    }
  } catch (error) {
    console.error('❌ Error processing media chunk:', error)
  }
}

function mulawToPcm(mulawData: Uint8Array): number[] {
  const pcmData: number[] = []
  
  for (const mulaw of mulawData) {
    // Simplified mulaw to PCM conversion
    const sign = (mulaw & 0x80) ? -1 : 1
    const exponent = (mulaw & 0x70) >> 4
    const mantissa = mulaw & 0x0F
    
    let sample = (33 + (2 * mantissa)) << exponent
    if (exponent === 0) sample = 33 + (2 * mantissa)
    
    pcmData.push(sign * sample * 4) // Scale for 16-bit range
  }
  
  return pcmData
}

async function processAudioBuffer(streamInfo: any, callId: string) {
  try {
    console.log(`🎤 Processing audio buffer for call: ${callId}, samples: ${streamInfo.audioBuffer.length}`)

    // Convert PCM samples to WAV format for Whisper
    const wavBuffer = createWavBuffer(streamInfo.audioBuffer, 8000) // Twilio uses 8kHz
    
    // Send to OpenAI Whisper for transcription
    const transcription = await transcribeAudio(wavBuffer)
    
    if (transcription && transcription.trim()) {
      console.log(`📝 Real-time transcription: "${transcription}"`)
      
      // Update the partial transcript
      streamInfo.partialTranscript += ' ' + transcription.trim()
      
      // Update database with real-time transcript
      await updateCallTranscript(callId, streamInfo.partialTranscript)
    }

    // Clear processed audio buffer (keep last 1 second for continuity)
    streamInfo.audioBuffer = streamInfo.audioBuffer.slice(-8000)
    
  } catch (error) {
    console.error('❌ Error processing audio buffer:', error)
  }
}

function createWavBuffer(samples: number[], sampleRate: number): ArrayBuffer {
  const length = samples.length
  const buffer = new ArrayBuffer(44 + length * 2)
  const view = new DataView(buffer)
  
  // WAV header
  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i))
    }
  }
  
  writeString(0, 'RIFF')
  view.setUint32(4, 36 + length * 2, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeString(36, 'data')
  view.setUint32(40, length * 2, true)
  
  // Convert samples to 16-bit PCM
  for (let i = 0; i < length; i++) {
    const sample = Math.max(-32768, Math.min(32767, samples[i]))
    view.setInt16(44 + i * 2, sample, true)
  }
  
  return buffer
}

async function transcribeAudio(audioBuffer: ArrayBuffer): Promise<string> {
  try {
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiApiKey) {
      throw new Error('OpenAI API key not configured')
    }

    const formData = new FormData()
    formData.append('file', new Blob([audioBuffer], { type: 'audio/wav' }), 'audio.wav')
    formData.append('model', 'whisper-1')
    formData.append('response_format', 'text')
    formData.append('language', 'en')

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
      },
      body: formData
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ OpenAI transcription error:', errorText)
      return ''
    }

    const transcription = await response.text()
    return transcription.trim()

  } catch (error) {
    console.error('❌ Error in transcribeAudio:', error)
    return ''
  }
}

async function updateCallTranscript(callId: string, transcript: string) {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const { error } = await supabase
      .from('calls')
      .update({ 
        transcript: `[LIVE] ${transcript}`,
        updated_at: new Date().toISOString()
      })
      .eq('id', callId)

    if (error) {
      console.error('❌ Error updating call transcript:', error)
    } else {
      console.log(`✅ Updated real-time transcript for call: ${callId}`)
    }
  } catch (error) {
    console.error('❌ Error in updateCallTranscript:', error)
  }
}
