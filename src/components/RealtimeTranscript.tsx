
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

  useEffect(() => {
    console.log('RealtimeTranscript mounted:', { callId, isActive });
    
    if (!isActive || !callId) {
      console.log('RealtimeTranscript not active or no callId');
      return;
    }

    // Subscribe to real-time updates for the call
    const channel = supabase
      .channel(`call-${callId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'calls',
          filter: `id=eq.${callId}`
        },
        (payload) => {
          console.log('Realtime transcript update received:', payload);
          if (payload.new.transcript) {
            console.log('Setting transcript:', payload.new.transcript);
            setTranscript(payload.new.transcript);
          }
        }
      )
      .subscribe((status) => {
        console.log('Realtime subscription status:', status);
      });

    // Fetch initial transcript
    const fetchInitialTranscript = async () => {
      console.log('Fetching initial transcript for call:', callId);
      const { data, error } = await supabase
        .from('calls')
        .select('transcript, status')
        .eq('id', callId)
        .single();
      
      console.log('Initial transcript fetch result:', { data, error });
      
      if (data?.transcript) {
        setTranscript(data.transcript);
      }
    };

    fetchInitialTranscript();
    setIsListening(true);

    return () => {
      console.log('Cleaning up realtime subscription for call:', callId);
      supabase.removeChannel(channel);
      setIsListening(false);
    };
  }, [callId, isActive]);

  // Always render the component when isActive is true, even without transcript
  if (!isActive) {
    return null;
  }

  return (
    <Card className="w-full border-2 border-blue-200 bg-blue-50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-lg">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-600" />
            Live Transcript
          </div>
          <Badge variant={isListening ? "default" : "secondary"} className="flex items-center gap-1">
            {isListening ? <Mic className="h-3 w-3" /> : <MicOff className="h-3 w-3" />}
            {isListening ? 'Listening' : 'Inactive'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-40 w-full rounded border p-4 bg-white">
          {transcript ? (
            <div className="text-sm leading-relaxed">
              {transcript}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground italic">
              {isListening ? 'Waiting for conversation to begin...' : 'Transcript will appear here during the call'}
            </div>
          )}
        </ScrollArea>
        <div className="mt-2 text-xs text-gray-500">
          Call ID: {callId} | Status: {isListening ? 'Active' : 'Inactive'}
        </div>
      </CardContent>
    </Card>
  );
};

export default RealtimeTranscript;
