
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
    if (!isActive || !callId) return;

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
          console.log('Realtime transcript update:', payload);
          if (payload.new.transcript) {
            setTranscript(payload.new.transcript);
          }
        }
      )
      .subscribe();

    // Fetch initial transcript
    const fetchInitialTranscript = async () => {
      const { data } = await supabase
        .from('calls')
        .select('transcript')
        .eq('id', callId)
        .single();
      
      if (data?.transcript) {
        setTranscript(data.transcript);
      }
    };

    fetchInitialTranscript();
    setIsListening(true);

    return () => {
      supabase.removeChannel(channel);
      setIsListening(false);
    };
  }, [callId, isActive]);

  if (!isActive) {
    return null;
  }

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-lg">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Live Transcript
          </div>
          <Badge variant={isListening ? "default" : "secondary"} className="flex items-center gap-1">
            {isListening ? <Mic className="h-3 w-3" /> : <MicOff className="h-3 w-3" />}
            {isListening ? 'Listening' : 'Inactive'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-40 w-full rounded border p-4">
          {transcript ? (
            <div className="text-sm leading-relaxed">
              {transcript}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground italic">
              Waiting for conversation to begin...
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default RealtimeTranscript;
