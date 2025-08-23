
import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileText, Mic, MicOff } from 'lucide-react';

interface RealtimeTranscriptProps {
  callId: string;
  isActive: boolean;
}

const RealtimeTranscript: React.FC<RealtimeTranscriptProps> = ({ callId, isActive }) => {
  const [transcript, setTranscript] = useState<string>('');
  const [isListening, setIsListening] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<string>('disconnected');

  useEffect(() => {
    console.log('🔄 RealtimeTranscript effect triggered:', { callId, isActive });
    
    if (!isActive || !callId) {
      console.log('❌ RealtimeTranscript not active or no callId:', { isActive, callId });
      return;
    }

    console.log('✅ Setting up realtime subscription for call:', callId);

    // Subscribe to real-time updates for the call
    const channel = supabase
      .channel(`call-transcript-${callId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'calls',
          filter: `id=eq.${callId}`
        },
        (payload) => {
          console.log('📡 Realtime transcript update received:', payload);
          if (payload.new && payload.new.transcript) {
            console.log('📝 Setting transcript:', payload.new.transcript);
            setTranscript(payload.new.transcript);
          }
          if (payload.new && payload.new.status) {
            console.log('📊 Call status updated:', payload.new.status);
          }
        }
      )
      .subscribe((status) => {
        console.log('🔗 Realtime subscription status:', status);
        setConnectionStatus(status);
        if (status === 'SUBSCRIBED') {
          setIsListening(true);
        }
      });

    // Fetch initial transcript
    const fetchInitialTranscript = async () => {
      console.log('🔍 Fetching initial transcript for call:', callId);
      try {
        const { data, error } = await supabase
          .from('calls')
          .select('transcript, status')
          .eq('id', callId)
          .single();
        
        console.log('📋 Initial transcript fetch result:', { data, error });
        
        if (error) {
          console.error('❌ Error fetching initial transcript:', error);
          return;
        }
        
        if (data?.transcript) {
          console.log('✅ Initial transcript found:', data.transcript);
          setTranscript(data.transcript);
        } else {
          console.log('ℹ️ No initial transcript found');
        }
      } catch (err) {
        console.error('❌ Exception fetching initial transcript:', err);
      }
    };

    fetchInitialTranscript();

    return () => {
      console.log('🧹 Cleaning up realtime subscription for call:', callId);
      supabase.removeChannel(channel);
      setIsListening(false);
      setConnectionStatus('disconnected');
    };
  }, [callId, isActive]);

  // Always render the component when isActive is true, even without transcript
  if (!isActive) {
    console.log('🚫 RealtimeTranscript not rendering - not active');
    return null;
  }

  console.log('🎨 RealtimeTranscript rendering:', { 
    callId, 
    isActive, 
    transcript: transcript?.substring(0, 50) + '...', 
    isListening,
    connectionStatus 
  });

  return (
    <Card className="w-full border-2 border-blue-200 bg-blue-50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-lg">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-600" />
            Live Transcript
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={isListening ? "default" : "secondary"} className="flex items-center gap-1">
              {isListening ? <Mic className="h-3 w-3" /> : <MicOff className="h-3 w-3" />}
              {isListening ? 'Listening' : 'Inactive'}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {connectionStatus}
            </Badge>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-40 w-full rounded border p-4 bg-white">
          {transcript ? (
            <div className="text-sm leading-relaxed whitespace-pre-wrap">
              {transcript}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground italic">
              {isListening ? 'Waiting for conversation to begin...' : 'Transcript will appear here during the call'}
            </div>
          )}
        </ScrollArea>
        <div className="mt-2 text-xs text-gray-500 flex justify-between">
          <span>Call ID: {callId}</span>
          <span>Status: {isListening ? 'Active' : 'Inactive'}</span>
          <span>Connection: {connectionStatus}</span>
        </div>
      </CardContent>
    </Card>
  );
};

export default RealtimeTranscript;
