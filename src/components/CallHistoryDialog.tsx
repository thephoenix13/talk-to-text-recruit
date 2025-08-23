
import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Phone, Play, FileText, Clock, Calendar } from 'lucide-react';

interface Call {
  id: string;
  status: string;
  started_at: string;
  ended_at?: string;
  duration_seconds?: number;
  recording_url?: string;
  transcript?: string;
  summary?: string;
}

interface CallHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidateId: string | null;
}

const CallHistoryDialog: React.FC<CallHistoryDialogProps> = ({ 
  open, 
  onOpenChange, 
  candidateId 
}) => {
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCall, setSelectedCall] = useState<Call | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (open && candidateId) {
      fetchCalls();
    }
  }, [open, candidateId]);

  const fetchCalls = async () => {
    if (!candidateId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('calls')
        .select('*')
        .eq('candidate_id', candidateId)
        .order('started_at', { ascending: false });

      if (error) throw error;
      setCalls(data || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to fetch call history",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800';
      case 'in-progress': return 'bg-blue-100 text-blue-800';
      case 'failed': return 'bg-red-100 text-red-800';
      case 'no-answer': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '0s';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  if (selectedCall) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Call Details</DialogTitle>
            <DialogDescription>
              Full transcript and summary for this call
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Badge className={getStatusColor(selectedCall.status)}>
                {selectedCall.status}
              </Badge>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setSelectedCall(null)}
              >
                Back to History
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <strong>Started:</strong> {formatDate(selectedCall.started_at)}
              </div>
              <div>
                <strong>Duration:</strong> {formatDuration(selectedCall.duration_seconds)}
              </div>
            </div>

            {selectedCall.recording_url && (
              <div>
                <h4 className="font-semibold mb-2 flex items-center">
                  <Play className="h-4 w-4 mr-2" />
                  Recording
                </h4>
                <audio controls className="w-full">
                  <source src={selectedCall.recording_url} type="audio/mpeg" />
                  Your browser does not support the audio element.
                </audio>
              </div>
            )}

            {selectedCall.transcript && (
              <div>
                <h4 className="font-semibold mb-2 flex items-center">
                  <FileText className="h-4 w-4 mr-2" />
                  Transcript
                </h4>
                <div className="bg-gray-50 p-4 rounded-lg whitespace-pre-wrap text-sm">
                  {selectedCall.transcript}
                </div>
              </div>
            )}

            {selectedCall.summary && (
              <div>
                <h4 className="font-semibold mb-2">AI Summary</h4>
                <div className="bg-blue-50 p-4 rounded-lg text-sm">
                  {selectedCall.summary}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Call History</DialogTitle>
          <DialogDescription>
            View all calls made to this candidate
          </DialogDescription>
        </DialogHeader>
        
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : calls.length === 0 ? (
          <div className="text-center py-8">
            <Phone className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No calls yet</h3>
            <p className="text-gray-500">Make your first call to see the history here.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {calls.map((call) => (
              <div 
                key={call.id} 
                className="border rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => setSelectedCall(call)}
              >
                <div className="flex items-center justify-between mb-2">
                  <Badge className={getStatusColor(call.status)}>
                    {call.status}
                  </Badge>
                  <span className="text-sm text-gray-500">
                    {formatDate(call.started_at)}
                  </span>
                </div>
                
                <div className="flex items-center justify-between text-sm text-gray-600">
                  <div className="flex items-center">
                    <Clock className="h-4 w-4 mr-1" />
                    Duration: {formatDuration(call.duration_seconds)}
                  </div>
                  <div className="flex items-center space-x-2">
                    {call.recording_url && (
                      <Play className="h-4 w-4 text-blue-600" />
                    )}
                    {call.transcript && (
                      <FileText className="h-4 w-4 text-green-600" />
                    )}
                  </div>
                </div>
                
                {call.summary && (
                  <p className="text-sm text-gray-700 mt-2 line-clamp-2">
                    {call.summary}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default CallHistoryDialog;
