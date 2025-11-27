import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mic, FileText, Calendar, Clock, Search } from "lucide-react";
import { format } from "date-fns";

interface Call {
  id: string;
  candidate_id: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  recording_url: string | null;
  transcript: string | null;
  summary: string | null;
  candidate: {
    full_name: string;
    phone: string;
  };
}

export default function Calls() {
  const [calls, setCalls] = useState<Call[]>([]);
  const [filteredCalls, setFilteredCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedCall, setSelectedCall] = useState<Call | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchCalls();
  }, []);

  useEffect(() => {
    filterCalls();
  }, [calls, searchQuery, statusFilter]);

  const fetchCalls = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("calls")
        .select(`
          *,
          candidate:candidates(full_name, phone)
        `)
        .order("started_at", { ascending: false });

      if (error) throw error;
      setCalls(data || []);
    } catch (error: any) {
      toast({
        title: "Error fetching calls",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const filterCalls = () => {
    let filtered = [...calls];

    if (searchQuery) {
      filtered = filtered.filter(
        (call) =>
          call.candidate.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          call.candidate.phone.includes(searchQuery)
      );
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter((call) => call.status === statusFilter);
    }

    setFilteredCalls(filtered);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-500/10 text-green-500 border-green-500/20";
      case "in-progress":
        return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      case "failed":
        return "bg-red-500/10 text-red-500 border-red-500/20";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return "N/A";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  if (selectedCall) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <button
          onClick={() => setSelectedCall(null)}
          className="mb-4 text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to All Calls
        </button>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Call with {selectedCall.candidate.full_name}</span>
              <Badge className={getStatusColor(selectedCall.status)}>
                {selectedCall.status}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Started</p>
                <p className="font-medium">
                  {format(new Date(selectedCall.started_at), "PPp")}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Duration</p>
                <p className="font-medium">{formatDuration(selectedCall.duration_seconds)}</p>
              </div>
            </div>

            {selectedCall.recording_url && (
              <div>
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  <Mic className="h-4 w-4" />
                  Recording
                </h3>
                <audio controls className="w-full">
                  <source src={selectedCall.recording_url} type="audio/mpeg" />
                </audio>
              </div>
            )}

            {selectedCall.transcript && (
              <div>
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Transcript
                </h3>
                <div className="bg-muted p-4 rounded-lg text-sm whitespace-pre-wrap">
                  {selectedCall.transcript}
                </div>
              </div>
            )}

            {selectedCall.summary && (
              <div>
                <h3 className="font-semibold mb-2">AI Summary</h3>
                <div className="bg-primary/5 p-4 rounded-lg text-sm">
                  {selectedCall.summary}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">All Calls</h1>
        <p className="text-muted-foreground">
          View and manage all call recordings and transcripts
        </p>
      </div>

      <div className="flex gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by candidate name or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="in-progress">In Progress</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="text-center py-12">Loading calls...</div>
      ) : filteredCalls.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No calls found
        </div>
      ) : (
        <div className="space-y-4">
          {filteredCalls.map((call) => (
            <Card
              key={call.id}
              className="cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => setSelectedCall(call)}
            >
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="font-semibold text-lg">
                        {call.candidate.full_name}
                      </h3>
                      <Badge className={getStatusColor(call.status)}>
                        {call.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {call.candidate.phone}
                    </p>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground mt-2">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(call.started_at), "PPp")}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDuration(call.duration_seconds)}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {call.recording_url && (
                      <Badge variant="outline" className="gap-1">
                        <Mic className="h-3 w-3" />
                        Recording
                      </Badge>
                    )}
                    {call.transcript && (
                      <Badge variant="outline" className="gap-1">
                        <FileText className="h-3 w-3" />
                        Transcript
                      </Badge>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
