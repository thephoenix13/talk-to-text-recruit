
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
  const [callingCandidates, setCallingCandidates] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  // Polling controller for active calls
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  const startActiveCallsPolling = () => {
    if (pollingIntervalRef.current) return;
    console.log('⏱️ Starting active calls polling (every 3s)...');
    pollingIntervalRef.current = setInterval(() => {
      fetchActiveCalls({ fromPoller: true });
    }, 3000);
  };

  const stopActiveCallsPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
      console.log('🛑 Stopped active calls polling');
    }
  };

  useEffect(() => {
    const hasAnyActive = Object.keys(activeCalls).length > 0;
    if (hasAnyActive) startActiveCallsPolling();
    else stopActiveCallsPolling();
  }, [activeCalls]);

  useEffect(() => {
    fetchCandidates();
    fetchActiveCalls();
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

  const fetchActiveCalls = async (opts?: { fromPoller?: boolean }) => {
    if (!opts?.fromPoller) {
      console.log('🔍 Fetching active calls...');
    }

    try {
      const { data, error } = await supabase
        .from('calls')
        .select('*')
        .in('status', ['initiated', 'ringing', 'in-progress'])
        .order('started_at', { ascending: false });

      if (error) {
        console.error('❌ Error fetching active calls:', error);
        return;
      }

      if (data && data.length > 0) {
        const newActiveCalls: Record<string, Call> = {};

        data.forEach(call => {
          if (
            !newActiveCalls[call.candidate_id] ||
            new Date(call.started_at) > new Date(newActiveCalls[call.candidate_id].started_at)
          ) {
            newActiveCalls[call.candidate_id] = call;
          }
        });

        setActiveCalls(newActiveCalls);
      } else {
        if (!opts?.fromPoller) console.log('ℹ️ No active calls found');
        setActiveCalls({});
      }
    } catch (err) {
      console.error('❌ Exception fetching active calls:', err);
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

      if (data?.callId) {
        const optimisticCall: Call = {
          id: data.callId,
          candidate_id: candidateId,
          status: 'initiated',
          started_at: new Date().toISOString(),
        };

        setActiveCalls(prev => ({
          ...prev,
          [candidateId]: optimisticCall
        }));
      }

      toast({
        title: "Call Initiated",
        description: data?.message || `Calling ${candidate.full_name}...`,
      });

      startActiveCallsPolling();

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

  // Enhanced real-time subscription with better transcript handling
  useEffect(() => {
    console.log('🔄 Setting up real-time calls subscription...');

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
          console.log('📡 Real-time payload:', payload.eventType, payload.new);

          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const call = payload.new as Call;
            if (!call?.id) return;

            console.log(`🔔 ${payload.eventType} for call ${call.id}, status: ${call.status}`);

            if (['initiated', 'ringing', 'in-progress'].includes(call.status)) {
              setActiveCalls(prev => ({
                ...prev,
                [call.candidate_id]: call
              }));
            } else if (['completed', 'failed', 'no-answer', 'busy', 'canceled'].includes(call.status)) {
              console.log(`🏁 Call ended with status: ${call.status}`);
              setActiveCalls(prev => {
                const updated = { ...prev };
                delete updated[call.candidate_id];
                return updated;
              });
            }
          }
        }
      )
      .subscribe((status) => {
        console.log('🔗 Calls subscription status:', status);
      });

    return () => {
      console.log('🧹 Cleaning up calls subscription');
      stopActiveCallsPolling();
      supabase.removeChannel(channel);
    };
  }, []);

  if (loading) {
    return <div>Loading candidates...</div>;
  }

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
        const hasActiveCall = !!activeCall;
        const transcript = activeCall?.transcript || '';
        const isLiveTranscript = transcript.startsWith('[LIVE]');
        const displayTranscript = isLiveTranscript ? 
          transcript.replace('[LIVE]', '').trim() : 
          transcript;

        return (
          <div key={candidate.id} className="space-y-4">
            <Card className="p-6">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-semibold">{candidate.full_name}</h2>
                  <div className="text-sm text-gray-500 flex items-center">
                    <Mail className="mr-1 h-4 w-4" />
                    {candidate.email || 'No email'}
                  </div>
                  <div className="text-sm text-gray-500 flex items-center">
                    <Phone className="mr-1 h-4 w-4" />
                    {candidate.phone}
                  </div>
                  <div className="text-sm text-gray-500 flex items-center">
                    <Calendar className="mr-1 h-4 w-4" />
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
                  {hasActiveCall && (
                    <Badge 
                      variant={activeCall.status === 'in-progress' ? 'default' : 'secondary'} 
                      className={
                        activeCall.status === 'in-progress' ? 'bg-green-100 text-green-800' :
                        activeCall.status === 'ringing' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-blue-100 text-blue-800'
                      }
                    >
                      {activeCall.status === 'in-progress' ? 'Call In Progress' : 
                       activeCall.status === 'ringing' ? 'Call Ringing' :
                       `Call ${activeCall.status}`}
                    </Badge>
                  )}
                </div>
              </div>
              
              <div className="mt-4 flex space-x-2">
                <Button 
                  onClick={() => makeCall(candidate.id)}
                  disabled={callingCandidates.has(candidate.id) || hasActiveCall}
                >
                  {callingCandidates.has(candidate.id) ? 'Calling...' : 
                   hasActiveCall ? `In Call (${activeCall.status})` : 
                   'Call'}
                </Button>
                <Button variant="outline" onClick={() => handleOpenCallHistory(candidate.id)}>
                  <History className="mr-2 h-4 w-4" />
                  Call History
                </Button>
              </div>

              {/* Enhanced Live Transcript Display */}
              <div className="mt-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Badge 
                    variant={hasActiveCall && activeCall.status === 'in-progress' ? 'default' : 'secondary'} 
                    className={`flex items-center gap-1 ${
                      isLiveTranscript ? 'bg-green-100 text-green-800 border-green-300' : ''
                    }`}
                  >
                    {hasActiveCall && activeCall.status === 'in-progress' ? 
                      <Mic className="h-3 w-3" /> : 
                      <MicOff className="h-3 w-3" />
                    }
                    {isLiveTranscript ? 'Live Transcription' : 
                     hasActiveCall && activeCall.status === 'in-progress' ? 'Recording' : 
                     hasActiveCall && activeCall.status === 'ringing' ? 'Waiting for Connection' :
                     hasActiveCall && activeCall.status === 'initiated' ? 'Initiating Call' : 'Inactive'}
                  </Badge>
                  {hasActiveCall && (
                    <>
                      <Badge variant="outline" className="text-xs">
                        {displayTranscript.length} chars
                      </Badge>
                      {isLiveTranscript && (
                        <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-300 animate-pulse">
                          LIVE
                        </Badge>
                      )}
                    </>
                  )}
                </div>
                <Textarea
                  value={
                    hasActiveCall && activeCall.status === 'in-progress' 
                      ? (displayTranscript || 'Waiting for speech... Real-time transcription is starting...')
                      : hasActiveCall && activeCall.status === 'ringing'
                      ? 'Call is ringing... Transcript will start when call connects.'
                      : hasActiveCall && activeCall.status === 'initiated'
                      ? 'Call is being initiated... Please wait.'
                      : hasActiveCall
                      ? `Call status: ${activeCall.status}`
                      : 'No active call'
                  }
                  readOnly
                  placeholder="Live transcript will appear here during active calls..."
                  className={`min-h-[120px] ${
                    isLiveTranscript
                      ? 'bg-green-50 border-green-200 border-2' 
                      : hasActiveCall && activeCall.status === 'in-progress' 
                      ? 'bg-blue-50 border-blue-200' 
                      : hasActiveCall && activeCall.status === 'ringing'
                      ? 'bg-yellow-50 border-yellow-200'
                      : hasActiveCall && activeCall.status === 'initiated'
                      ? 'bg-blue-50 border-blue-200'
                      : 'bg-gray-50 border-gray-200'
                  }`}
                />
                {hasActiveCall && (
                  <div className="text-xs text-gray-500 flex justify-between items-center">
                    <span>Call ID: {activeCall.id}</span>
                    <span>Status: {activeCall.status}</span>
                    <span>Transcript: {displayTranscript.length} chars</span>
                    {isLiveTranscript && (
                      <span className="text-green-600 font-medium flex items-center gap-1">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                        LIVE
                      </span>
                    )}
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
