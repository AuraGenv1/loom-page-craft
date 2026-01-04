-- Drop existing policies and recreate as properly permissive
DROP POLICY IF EXISTS "Anyone can create books" ON public.books;
DROP POLICY IF EXISTS "Anyone can view books" ON public.books;

-- Create permissive INSERT policy for both anon and authenticated
CREATE POLICY "Anyone can create books"
ON public.books
FOR INSERT
TO anon, authenticated
WITH CHECK (
  (auth.uid() IS NULL AND user_id IS NULL) OR 
  (auth.uid() = user_id)
);

-- Create permissive SELECT policy for both anon and authenticated  
CREATE POLICY "Anyone can view books"
ON public.books
FOR SELECT
TO anon, authenticated
USING (
  user_id IS NULL OR 
  auth.uid() = user_id
);