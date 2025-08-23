
import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { Phone, History, Mail, User } from 'lucide-react';

interface Candidate {
  id: string;
  full_name: string;
  phone: string;
  email?: string;
  notes?: string;
  created_at: string;
}

interface CandidateListProps {
  onViewCallHistory: (candidateId: string) => void;
}

const CandidateList: React.FC<CandidateListProps> = ({ onViewCallHistory }) => {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [callingCandidateId, setCallingCandidateId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchCandidates();
  }, []);

  const fetchCandidates = async () => {
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

  const handleCall = async (candidate: Candidate) => {
    setCallingCandidateId(candidate.id);
    
    try {
      const { data, error } = await supabase.functions.invoke('initiate-call', {
        body: {
          candidateId: candidate.id,
          candidateName: candidate.full_name,
          candidatePhone: candidate.phone
        }
      });

      if (error) throw error;

      toast({
        title: "Call Initiated",
        description: `Calling ${candidate.full_name}...`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to initiate call",
        variant: "destructive",
      });
    } finally {
      setCallingCandidateId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (candidates.length === 0) {
    return (
      <div className="text-center py-8">
        <User className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">No candidates yet</h3>
        <p className="text-gray-500">Add your first candidate to get started with calls and transcriptions.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {candidates.map((candidate) => (
        <div key={candidate.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center space-x-3">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{candidate.full_name}</h3>
                  <div className="flex items-center space-x-4 text-sm text-gray-600">
                    <div className="flex items-center">
                      <Phone className="h-4 w-4 mr-1" />
                      {candidate.phone}
                    </div>
                    {candidate.email && (
                      <div className="flex items-center">
                        <Mail className="h-4 w-4 mr-1" />
                        {candidate.email}
                      </div>
                    )}
                  </div>
                  {candidate.notes && (
                    <p className="text-sm text-gray-600 mt-1">{candidate.notes}</p>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                onClick={() => onViewCallHistory(candidate.id)}
                variant="outline"
                size="sm"
              >
                <History className="h-4 w-4 mr-2" />
                History
              </Button>
              <Button
                onClick={() => handleCall(candidate)}
                disabled={callingCandidateId === candidate.id}
                size="sm"
              >
                <Phone className="h-4 w-4 mr-2" />
                {callingCandidateId === candidate.id ? 'Calling...' : 'Call'}
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default CandidateList;
