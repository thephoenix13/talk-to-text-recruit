
-- Enable real-time updates for the calls table
ALTER TABLE public.calls REPLICA IDENTITY FULL;

-- Add the calls table to the realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.calls;
