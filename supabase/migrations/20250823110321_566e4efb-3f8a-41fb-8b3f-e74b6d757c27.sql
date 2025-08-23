
-- Ensure full row data is sent on UPDATE/DELETE so realtime payloads contain id, candidate_id, status, etc.
ALTER TABLE public.calls REPLICA IDENTITY FULL;

-- Add calls to the realtime publication (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'calls'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.calls;
  END IF;
END
$$;
