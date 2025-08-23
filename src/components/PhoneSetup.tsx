
import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { Phone } from 'lucide-react';

interface PhoneSetupProps {
  onPhoneSet: (phone: string) => void;
}

const PhoneSetup: React.FC<PhoneSetupProps> = ({ onPhoneSet }) => {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('profiles')
        .select('phone')
        .eq('id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
        console.error('Error fetching profile:', error);
        return;
      }

      if (data?.phone) {
        setPhone(data.phone);
        onPhoneSet(data.phone);
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setInitialLoading(false);
    }
  };

  const handleSave = async () => {
    if (!phone.trim()) {
      toast({
        title: "Error",
        description: "Please enter a phone number",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('profiles')
        .upsert({ 
          id: user.id, 
          phone: phone.trim() 
        });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Phone number saved successfully",
      });

      onPhoneSet(phone.trim());
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save phone number",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) {
    return <div className="text-sm text-gray-500">Loading...</div>;
  }

  return (
    <div className="space-y-4 p-4 border rounded-lg bg-blue-50">
      <div className="flex items-center space-x-2">
        <Phone className="h-5 w-5 text-blue-600" />
        <h3 className="font-medium text-blue-900">Phone Setup Required</h3>
      </div>
      <p className="text-sm text-blue-700">
        Enter your phone number to receive calls when connecting with candidates.
      </p>
      <div className="space-y-2">
        <Label htmlFor="phone">Your Phone Number</Label>
        <div className="flex space-x-2">
          <Input
            id="phone"
            type="tel"
            placeholder="+1234567890"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="flex-1"
          />
          <Button onClick={handleSave} disabled={loading}>
            {loading ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PhoneSetup;
