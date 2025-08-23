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
    if (onViewCallHistory) {
      onViewCallHistory(candidateId);
    }
  };

  const makeCall = async (candidateId: string) => {
    if (callingCandidates.has(candidateId)) {
      return; // Prevent multiple calls to the same candidate
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
      // Use the existing initiate-call edge function
      const { data, error } = await supabase.functions.invoke('initiate-call', {
        body: {
          candidateId: candidateId,
          candidateName: candidate.full_name,
          candidatePhone: candidate.phone,
        }
      });

      if (error) throw error;

      console.log('✅ Call initiated successfully:', data);
      toast({
        title: "Call Initiated",
        description: data.message || `Calling ${candidate.full_name}...`,
      });

      // The call status will be updated via real-time subscriptions
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

  useEffect(() => {
    console.log('🔄 Setting up calls subscription...');
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
          console.log('📡 Call update received:', payload);
          
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const call = payload.new as Call;
            console.log('📊 Processing call update:', call);
            
            setActiveCalls(prev => {
              const updated = {
                ...prev,
                [call.candidate_id]: call
              };
              console.log('🔄 Updated active calls:', updated);
              return updated;
            });

            // Start realtime transcription for in-progress calls
            if (call.status === 'in-progress' && !realtimeCaptures[call.id]) {
              console.log('🎙️ Starting realtime transcription for call:', call.id);
              const capture = startRealtimeTranscription(call.id);
              setRealtimeCaptures(prev => ({
                ...prev,
                [call.id]: capture
              }));
            }

            // Stop realtime transcription for completed calls
            if (call.status === 'completed' && realtimeCaptures[call.id]) {
              console.log('🛑 Stopping realtime transcription for call:', call.id);
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
      .subscribe((status) => {
        console.log('🔗 Calls subscription status:', status);
      });

    return () => {
      console.log('🧹 Cleaning up calls subscription');
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
      
      {filteredCandidates.map((candidate) => {
        const activeCall = activeCalls[candidate.id];
        const hasActiveCall = activeCall && (activeCall.status === 'in-progress' || activeCall.status === 'ringing');
        
        console.log('🎯 Rendering candidate:', candidate.full_name, {
          activeCall,
          hasActiveCall,
          callStatus: activeCall?.status
        });
        
        return (
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
                  <Badge variant="default" className="bg-green-100 text-green-800">
                    Active Call
                  </Badge>
                )}
              </div>
            </div>
            
            {/* Show realtime transcript for any active call */}
            {activeCall && (
              <div className="mt-6">
                <div className="mb-2 text-sm font-medium text-gray-700">
                  Live Transcript for Call {activeCall.id}
                </div>
                <RealtimeTranscript 
                  callId={activeCall.id}
                  isActive={true}
                />
              </div>
            )}
            
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
          </Card>
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
