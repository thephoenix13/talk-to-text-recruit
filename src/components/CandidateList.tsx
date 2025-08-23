import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { Phone, Search, History, User, MapPin, Mail, Calendar, Clock, Mic, MicOff } from 'lucide-react';
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
  transcript?: string;
  twilio_call_sid?: string;
}

interface CandidateListProps {
  onViewCallHistory?: (candidateId: string) => void;
  userPhone?: string | null;
}

const CandidateList: React.FC<CandidateListProps> = ({ onViewCallHistory, userPhone }) => {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [addCandidateOpen, setAddCandidateOpen] = useState(false);
  const [callHistoryOpen, setCallHistoryOpen] = useState(false);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [activeCalls, setActiveCalls] = useState<Record<string, Call>>({});
  const [realtimeCaptures, setRealtimeCaptures] = useState<Record<string, RealtimeAudioCapture>>({});
  const [callingCandidates, setCallingCandidates] = useState<Set<string>>(new Set());
  const [liveTranscripts, setLiveTranscripts] = useState<Record<string, string>>({});
  const { toast } = useToast();

  // Keep a ref in sync with realtimeCaptures so the subscription callback always sees the latest map
  const realtimeCapturesRef = useRef<Record<string, RealtimeAudioCapture>>({});
  useEffect(() => {
    realtimeCapturesRef.current = realtimeCaptures;
  }, [realtimeCaptures]);

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

  // Fetch existing active calls on mount
  useEffect(() => {
    const fetchActiveCalls = async () => {
      console.log('🔍 Fetching existing active calls...');
      
      try {
        setActiveCalls({});
        setLiveTranscripts({});
        
        const { data, error } = await supabase
          .from('calls')
          .select('*')
          .in('status', ['ringing', 'in-progress'])
          .order('started_at', { ascending: false });

        if (error) {
          console.error('❌ Error fetching active calls:', error);
          return;
        }

        console.log('📊 Database query result for active calls:', data);

        if (data && data.length > 0) {
          console.log('📋 Found existing active calls:', data);
          const newActiveCalls: Record<string, Call> = {};
          const newLiveTranscripts: Record<string, string> = {};

          data.forEach(call => {
            if (!newActiveCalls[call.candidate_id] || 
                new Date(call.started_at) > new Date(newActiveCalls[call.candidate_id].started_at)) {
              newActiveCalls[call.candidate_id] = call;
              newLiveTranscripts[call.id] = call.transcript || '';
            }
          });
          
          setActiveCalls(newActiveCalls);
          setLiveTranscripts(newLiveTranscripts);
          console.log('✅ Active calls state updated with candidates:', Object.keys(newActiveCalls));
        } else {
          console.log('ℹ️ No existing active calls found');
        }

      } catch (err) {
        console.error('❌ Exception fetching active calls:', err);
        setActiveCalls({});
        setLiveTranscripts({});
      }
    };

    fetchActiveCalls();
  }, []);

  const filteredCandidates = candidates.filter((candidate) =>
    candidate.full_name.toLowerCase().includes(search.toLowerCase()) ||
    candidate.email?.toLowerCase().includes(search.toLowerCase()) ||
    candidate.phone.includes(search)
  );

  const handleOpenCallHistory = (candidateId: string) => {
    setSelectedCandidateId(candidateId);
    setCallHistoryOpen(true);
    if (onViewCallHistory) {
      onViewCallHistory(candidateId);
    }
  };

  const makeCall = async (candidateId: string) => {
    if (callingCandidates.has(candidateId)) {
      return;
    }

    const candidate = candidates.find(c => c.id === candidateId);
    if (!candidate) {
      toast({
        title: "Error",
        description: "Candidate not found",
        variant: "destructive",
      });
      return;
    }

    console.log('📞 Initiating call for candidate:', candidate.full_name);
    setCallingCandidates(prev => new Set(prev).add(candidateId));

    try {
      const { data, error } = await supabase.functions.invoke('initiate-call', {
        body: {
          candidateId: candidateId,
          candidateName: candidate.full_name,
          candidatePhone: candidate.phone,
        }
      });

      if (error) throw error;

      console.log('✅ Call initiated successfully:', data);
      
      if (data.callId) {
        console.log('⏳ Waiting for call status to be updated via real-time subscription...');
      }

      toast({
        title: "Call Initiated",
        description: data.message || `Calling ${candidate.full_name}...`,
      });

    } catch (error: any) {
      console.error("❌ Call initiation error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to initiate call",
        variant: "destructive",
      });
    } finally {
      setCallingCandidates(prev => {
        const newSet = new Set(prev);
        newSet.delete(candidateId);
        return newSet;
      });
    }
  };

  // Stable real-time subscription (subscribe once) and use refs for latest state
  useEffect(() => {
    console.log('🔄 Setting up enhanced calls subscription...');

    const channel = supabase
      .channel('calls-realtime-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'calls'
        },
        (payload) => {
          // Safely narrow payload.new/old before accessing properties to satisfy TypeScript
          const newRow = (payload.new as Partial<Call> | null) ?? null;
          const oldRow = (payload.old as Partial<Call> | null) ?? null;
          const callId = newRow?.id ?? oldRow?.id ?? 'unknown';
          const candidateId = newRow?.candidate_id ?? oldRow?.candidate_id ?? 'unknown';
          const status = newRow?.status ?? (payload.eventType === 'DELETE' ? 'deleted' : 'unknown');

          console.log('📡 Real-time call update received:', {
            eventType: payload.eventType,
            callId,
            status,
            candidateId
          });

          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const call = payload.new as Call;
            if (!call) {
              console.log('⚠️ No callable new row payload; skipping.');
              return;
            }

            console.log('🔄 Processing call update for candidate:', call.candidate_id, 'Status:', call.status);

            // Handle active statuses (ringing and in-progress)
            if (call.status === 'ringing' || call.status === 'in-progress') {
              console.log('📌 Setting active call for candidate:', call.candidate_id);
              setActiveCalls(prev => {
                const updated = { ...prev, [call.candidate_id]: call };
                console.log('✅ Active calls updated:', Object.keys(updated));
                return updated;
              });

              // Update live transcript
              setLiveTranscripts(prev => ({
                ...prev,
                [call.id]: call.transcript || ''
              }));

              // Start realtime transcription for in-progress calls only
              if (call.status === 'in-progress' && !realtimeCapturesRef.current[call.id]) {
                console.log('🎙️ Starting realtime transcription for in-progress call:', call.id);
                const capture = startRealtimeTranscription(call.id);
                // Update state and ref in sync
                setRealtimeCaptures(prev => {
                  const updated = { ...prev, [call.id]: capture };
                  realtimeCapturesRef.current = updated;
                  return updated;
                });
              }
            }
            // Handle completed/failed statuses
            else if (['completed', 'failed', 'no-answer', 'busy'].includes(call.status)) {
              console.log('🏁 Call ended, removing from active calls. Status:', call.status);

              setActiveCalls(prev => {
                const updated = { ...prev };
                delete updated[call.candidate_id];
                console.log('🗑️ Removed call from active calls, remaining:', Object.keys(updated));
                return updated;
              });

              // Remove from live transcripts
              setLiveTranscripts(prev => {
                const updated = { ...prev };
                delete updated[call.id];
                return updated;
              });

              // Stop realtime transcription via ref (no re-subscribe)
              const capture = realtimeCapturesRef.current[call.id];
              if (capture) {
                console.log('🛑 Stopping realtime transcription for ended call:', call.id);
                capture.stopCapture();
                setRealtimeCaptures(prev => {
                  const updated = { ...prev };
                  delete updated[call.id];
                  realtimeCapturesRef.current = updated;
                  return updated;
                });
              }
            }
          } else if (payload.eventType === 'DELETE') {
            const deletedCall = payload.old as Call;
            if (!deletedCall) return;
            console.log('🗑️ Call deleted from database:', deletedCall.id);

            setActiveCalls(prev => {
              const updated = { ...prev };
              delete updated[deletedCall.candidate_id];
              return updated;
            });

            setLiveTranscripts(prev => {
              const updated = { ...prev };
              delete updated[deletedCall.id];
              return updated;
            });

            const capture = realtimeCapturesRef.current[deletedCall.id];
            if (capture) {
              console.log('🛑 Stopping realtime transcription for deleted call:', deletedCall.id);
              capture.stopCapture();
              setRealtimeCaptures(prev => {
                const updated = { ...prev };
                delete updated[deletedCall.id];
                realtimeCapturesRef.current = updated;
                return updated;
              });
            }
          }
        }
      )
      .subscribe((status) => {
        console.log('🔗 Enhanced calls subscription status:', status);
      });

    return () => {
      console.log('🧹 Cleaning up enhanced calls subscription');
      // Stop any ongoing captures on unmount
      Object.values(realtimeCapturesRef.current).forEach(capture => capture.stopCapture());
      supabase.removeChannel(channel);
    };
  }, []); // Subscribe once

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
      
      {filteredCandidates.map((candidate) => {
        const activeCall = activeCalls[candidate.id];
        // Ensure this is always a boolean
        const hasActiveCall = !!activeCall && (activeCall.status === 'in-progress' || activeCall.status === 'ringing');
        const liveTranscript = activeCall ? liveTranscripts[activeCall.id] || '' : '';

        console.log('🎯 Rendering candidate:', candidate.full_name, {
          activeCall: activeCall ? {
            id: activeCall.id,
            status: activeCall.status,
            hasTranscript: !!activeCall.transcript
          } : null,
          hasActiveCall,
          callStatus: activeCall?.status || 'none'
        });

        return (
          <div key={candidate.id} className="space-y-4">
            <Card className="p-6">
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
                  {activeCall && (
                    <div className="text-sm font-medium text-blue-600 mt-1 flex items-center gap-2">
                      <Badge variant={activeCall.status === 'in-progress' ? 'default' : 'secondary'}>
                        Call Status: {activeCall.status}
                      </Badge>
                      <span className="text-xs text-gray-500">ID: {activeCall.id}</span>
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Badge variant="secondary">
                    <Clock className="mr-1 h-4 w-4" />
                    {filteredCandidates.length} Candidates
                  </Badge>
                  {hasActiveCall && (
                    <Badge variant={activeCall?.status === 'in-progress' ? 'default' : 'secondary'} 
                          className={activeCall?.status === 'in-progress' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}>
                      {activeCall?.status === 'in-progress' ? 'Call In Progress' : 'Call Ringing'}
                    </Badge>
                  )}
                </div>
              </div>
              
              <div className="mt-4 flex space-x-2">
                <Button 
                  onClick={() => makeCall(candidate.id)}
                  disabled={callingCandidates.has(candidate.id) || hasActiveCall}
                >
                  {callingCandidates.has(candidate.id) ? 'Calling...' : hasActiveCall ? 'In Call' : 'Call'}
                </Button>
                <Button variant="outline" onClick={() => handleOpenCallHistory(candidate.id)}>
                  <History className="mr-2 h-4 w-4" />
                  Call History
                </Button>
              </div>

              {/* Enhanced Live Transcript Display */}
              <div className="mt-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant={hasActiveCall && activeCall?.status === 'in-progress' ? 'default' : 'secondary'} className="flex items-center gap-1">
                    {hasActiveCall && activeCall?.status === 'in-progress' ? <Mic className="h-3 w-3" /> : <MicOff className="h-3 w-3" />}
                    Live Transcript Status: {
                      hasActiveCall 
                        ? (activeCall?.status === 'in-progress' ? 'Recording' : 'Waiting for Connection') 
                        : 'Inactive'
                    }
                  </Badge>
                </div>
                <Textarea
                  value={
                    hasActiveCall && activeCall?.status === 'in-progress' 
                      ? (liveTranscript || 'Transcript will appear here during the call...')
                      : hasActiveCall && activeCall?.status === 'ringing'
                      ? 'Call is ringing... Transcript will start when call connects.'
                      : 'No active call'
                  }
                  readOnly
                  placeholder="Live transcript will appear here during active calls..."
                  className={`min-h-[120px] ${
                    hasActiveCall && activeCall?.status === 'in-progress' 
                      ? 'bg-green-50 border-green-200' 
                      : hasActiveCall && activeCall?.status === 'ringing'
                      ? 'bg-yellow-50 border-yellow-200'
                      : 'bg-gray-50 border-gray-200'
                  }`}
                />
                {hasActiveCall && (
                  <div className="text-xs text-gray-500 flex justify-between">
                    <span>Call ID: {activeCall?.id}</span>
                    <span>Status: {activeCall?.status}</span>
                    <span>Transcript Length: {liveTranscript.length} chars</span>
                  </div>
                )}
              </div>
            </Card>
          </div>
        );
      })}
      
      <AddCandidateDialog 
        open={addCandidateOpen} 
        onOpenChange={setAddCandidateOpen} 
        onCandidateAdded={fetchCandidates}
      />
      <CallHistoryDialog
        open={callHistoryOpen}
        onOpenChange={setCallHistoryOpen}
        candidateId={selectedCandidateId}
      />
    </div>
  );
};

export default CandidateList;
