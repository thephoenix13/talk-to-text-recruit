
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { Plus, LogOut, Phone } from 'lucide-react';
import { User, Session } from '@supabase/supabase-js';
import CandidateList from '@/components/CandidateList';
import AddCandidateDialog from '@/components/AddCandidateDialog';
import CallHistoryDialog from '@/components/CallHistoryDialog';
import PhoneSetup from '@/components/PhoneSetup';

const Dashboard = () => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [callHistoryOpen, setCallHistoryOpen] = useState(false);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [userPhone, setUserPhone] = useState<string | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        if (!session) {
          navigate('/auth');
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (!session) {
        navigate('/auth');
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleSignOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      navigate('/auth');
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleViewCallHistory = (candidateId: string) => {
    setSelectedCandidateId(candidateId);
    setCallHistoryOpen(true);
  };

  const handlePhoneSet = (phone: string) => {
    setUserPhone(phone);
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <div className="flex items-center">
                <Phone className="h-8 w-8 text-blue-600" />
                <h1 className="ml-2 text-xl font-semibold text-gray-900">TalentCall</h1>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-700">Welcome, {user.email}</span>
              <Button onClick={handleSignOut} variant="outline" size="sm">
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="mb-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
                <p className="text-gray-600">Manage your candidates and recruitment calls</p>
              </div>
              <Button onClick={() => setAddDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Candidate
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6">
            {!userPhone && (
              <PhoneSetup onPhoneSet={handlePhoneSet} />
            )}
            
            <Card>
              <CardHeader>
                <CardTitle>Candidates</CardTitle>
                <CardDescription>
                  Manage your candidate pipeline and initiate calls
                </CardDescription>
              </CardHeader>
              <CardContent>
                <CandidateList 
                  onViewCallHistory={handleViewCallHistory}
                  userPhone={userPhone}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      <AddCandidateDialog 
        open={addDialogOpen} 
        onOpenChange={setAddDialogOpen} 
      />
      
      <CallHistoryDialog
        open={callHistoryOpen}
        onOpenChange={setCallHistoryOpen}
        candidateId={selectedCandidateId}
      />
    </div>
  );
};

export default Dashboard;
