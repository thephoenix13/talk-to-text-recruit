import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { Phone, Search, History, User, MapPin, Mail, Calendar, Clock } from 'lucide-react';
import AddCandidateDialog from './AddCandidateDialog';
import CallHistoryDialog from './CallHistoryDialog';
import RealtimeTranscript from './RealtimeTranscript';
import { startRealtimeTranscription, RealtimeAudioCapture } from '@/utils/realtimeAudio';

interface Candidate {
  id: string;
  full_name: string;
  email: string | null;
  phone: string;
  notes: string | null;
  created_at: string;
}

interface Call {
  id: string;
  candidate_id: string;
  status: string;
  started_at: string;
}

const CandidateList = () => {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [addCandidateOpen, setAddCandidateOpen] = useState(false);
  const [callHistoryOpen, setCallHistoryOpen] = useState(false);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [activeCalls, setActiveCalls] = useState<Record<string, Call>>({});
  const [realtimeCaptures, setRealtimeCaptures] = useState<Record<string, RealtimeAudioCapture>>({});
  const { toast } = useToast();

  useEffect(() => {
    fetchCandidates();
  }, []);

  const fetchCandidates = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('candidates')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCandidates(data || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to fetch candidates",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredCandidates = candidates.filter((candidate) =>
    candidate.full_name.toLowerCase().includes(search.toLowerCase()) ||
    candidate.email?.toLowerCase().includes(search.toLowerCase()) ||
    candidate.phone.includes(search)
  );

  const handleOpenCallHistory = (candidateId: string) => {
    setSelectedCandidateId(candidateId);
    setCallHistoryOpen(true);
  };

  const makeCall = async (candidateId: string) => {
    try {
      // 1. Create a new call record in Supabase
      const { data: call, error: callError } = await supabase
        .from('calls')
        .insert({
          candidate_id: candidateId,
          recruiter_id: supabase.auth.user()?.id || 'unknown',
          status: 'pending',
          started_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (callError) {
        throw callError;
      }

      // 2. Start the call using Twilio (or your preferred provider)
      // const twilioResponse = await fetch('/api/twilio/start-call', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({
      //     candidatePhone: candidates.find(c => c.id === candidateId)?.phone,
      //     callId: call.id,
      //   }),
      // });

      // if (!twilioResponse.ok) {
      //   throw new Error('Failed to initiate call');
      // }

      // const twilioData = await twilioResponse.json();

      // 3. Update the call record with Twilio SID and status
      const { data: updatedCall, error: updateError } = await supabase
        .from('calls')
        .update({
          status: 'in-progress',
          twilio_call_sid: 'simulated_twilio_sid', // twilioData.sid,
        })
        .eq('id', call.id)
        .select()
        .single();

      if (updateError) {
        throw updateError;
      }

      setActiveCalls(prev => ({
        ...prev,
        [candidateId]: updatedCall
      }));

      toast({
        title: "Call Started",
        description: `Call started with ${candidates.find(c => c.id === candidateId)?.full_name}`,
      });
    } catch (error: any) {
      console.error("Call initiation error:", error);
      toast({
        title: "Error",
        description: "Failed to initiate call",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    // Subscribe to real-time call updates
    const channel = supabase
      .channel('calls-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'calls'
        },
        (payload) => {
          console.log('Call update received:', payload);
          
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const call = payload.new as Call;
            setActiveCalls(prev => ({
              ...prev,
              [call.candidate_id]: call
            }));

            // Start realtime transcription for in-progress calls
            if (call.status === 'in-progress' && !realtimeCaptures[call.id]) {
              const capture = startRealtimeTranscription(call.id);
              setRealtimeCaptures(prev => ({
                ...prev,
                [call.id]: capture
              }));
            }

            // Stop realtime transcription for completed calls
            if (call.status === 'completed' && realtimeCaptures[call.id]) {
              realtimeCaptures[call.id].stopCapture();
              setRealtimeCaptures(prev => {
                const updated = { ...prev };
                delete updated[call.id];
                return updated;
              });
            }
          }
        }
      )
      .subscribe();

    return () => {
      // Clean up realtime captures
      Object.values(realtimeCaptures).forEach(capture => capture.stopCapture());
      supabase.removeChannel(channel);
    };
  }, [realtimeCaptures]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Input
          type="search"
          placeholder="Search candidates..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-md"
        />
        <Button onClick={() => setAddCandidateOpen(true)}>
          <Phone className="mr-2 h-4 w-4" />
          Add Candidate
        </Button>
      </div>
      
      {candidates.map((candidate) => (
        <Card key={candidate.id} className="p-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold">{candidate.full_name}</h2>
              <div className="text-sm text-gray-500">
                <User className="mr-1 inline-block h-4 w-4" />
                {candidate.email || 'No email'}
              </div>
              <div className="text-sm text-gray-500">
                <MapPin className="mr-1 inline-block h-4 w-4" />
                {candidate.phone}
              </div>
              <div className="text-sm text-gray-500">
                <Calendar className="mr-1 inline-block h-4 w-4" />
                Created: {new Date(candidate.created_at).toLocaleDateString()}
              </div>
            </div>
            <Badge variant="secondary">
              <Clock className="mr-1 h-4 w-4" />
              {filteredCandidates.length} Candidates
            </Badge>
          </div>
          
          {/* Show realtime transcript for active calls */}
          {activeCalls[candidate.id] && (
            <div className="mt-4">
              <RealtimeTranscript 
                callId={activeCalls[candidate.id].id}
                isActive={activeCalls[candidate.id].status === 'in-progress'}
              />
            </div>
          )}
          
          <div className="mt-4 flex space-x-2">
            <Button onClick={() => makeCall(candidate.id)}>
              Call
            </Button>
            <Button variant="outline" onClick={() => handleOpenCallHistory(candidate.id)}>
              <History className="mr-2 h-4 w-4" />
              Call History
            </Button>
          </div>
        </Card>
      ))}
      
      <AddCandidateDialog open={addCandidateOpen} onOpenChange={setAddCandidateOpen} onCandidateAdded={fetchCandidates} />
      <CallHistoryDialog
        open={callHistoryOpen}
        onOpenChange={setCallHistoryOpen}
        candidateId={selectedCandidateId}
      />
    </div>
  );
};

export default CandidateList;
