-- Allow all authenticated users to view all calls
CREATE POLICY "Allow all authenticated users to view all calls"
ON public.calls
FOR SELECT
TO authenticated
USING (true);

-- Allow all authenticated users to view all candidates  
CREATE POLICY "Allow all authenticated users to view all candidates"
ON public.candidates
FOR SELECT
TO authenticated
USING (true);