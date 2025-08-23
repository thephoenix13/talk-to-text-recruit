
import { supabase } from '@/integrations/supabase/client';

export class RealtimeAudioCapture {
  private callId: string;
  private isCapturing: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;

  constructor(callId: string) {
    this.callId = callId;
  }

  async startCapture() {
    if (this.isCapturing) return;

    try {
      this.isCapturing = true;
      console.log(`🎙️ Starting realtime audio capture for call ${this.callId}`);
      
      // Start periodic transcription requests every 10 seconds during active calls
      this.intervalId = setInterval(async () => {
        if (this.isCapturing) {
          console.log(`📡 Sending realtime transcription request for call ${this.callId}`);
          await this.requestRealtimeTranscription();
        }
      }, 10000); // Every 10 seconds
      
      // Send initial request immediately
      await this.requestRealtimeTranscription();
    } catch (error) {
      console.error('❌ Error starting realtime audio capture:', error);
    }
  }

  private async requestRealtimeTranscription() {
    try {
      console.log(`📞 Requesting realtime transcription for call ${this.callId}`);
      
      // Check if call is still active before requesting transcription
      const { data: callData, error: callError } = await supabase
        .from('calls')
        .select('status, twilio_call_sid')
        .eq('id', this.callId)
        .single();

      if (callError) {
        console.error('❌ Error checking call status:', callError);
        return;
      }

      if (callData?.status !== 'in-progress') {
        console.log(`⏹️ Call ${this.callId} is no longer in-progress (${callData?.status}), stopping transcription`);
        this.stopCapture();
        return;
      }

      // Send request to transcribe-call function for realtime processing
      const { data, error } = await supabase.functions.invoke('transcribe-call', {
        body: {
          callId: this.callId,
          isRealtime: true,
          // In a real implementation, this would be actual audio data from Twilio
          // For now, we'll trigger the function to check for any available audio
          audioData: 'realtime_request'
        }
      });

      if (error) {
        console.error('❌ Error requesting realtime transcription:', error);
      } else {
        console.log('✅ Realtime transcription request sent successfully:', data);
      }
    } catch (error) {
      console.error('❌ Error in requestRealtimeTranscription:', error);
    }
  }

  stopCapture() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isCapturing = false;
    console.log(`🛑 Stopped realtime audio capture for call ${this.callId}`);
  }
}

export const startRealtimeTranscription = (callId: string): RealtimeAudioCapture => {
  const audioCapture = new RealtimeAudioCapture(callId);
  audioCapture.startCapture();
  return audioCapture;
};
