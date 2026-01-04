-- Drop existing restrictive policies on books table
DROP POLICY IF EXISTS "Authenticated users can create their own books" ON public.books;
DROP POLICY IF EXISTS "Users can view their own books" ON public.books;
DROP POLICY IF EXISTS "Users can update their own books" ON public.books;
DROP POLICY IF EXISTS "Users can delete their own books" ON public.books;

-- Create new policies that allow both anonymous and authenticated access

-- Anonymous users can insert books (user_id will be null)
CREATE POLICY "Anyone can create books"
ON public.books
FOR INSERT
TO anon, authenticated
WITH CHECK (
  (auth.uid() IS NULL AND user_id IS NULL) OR 
  (auth.uid() = user_id)
);

-- Users can view their own books (by user_id) OR anonymous books (by session_id match handled in app)
CREATE POLICY "Anyone can view books"
ON public.books
FOR SELECT
TO anon, authenticated
USING (
  user_id IS NULL OR 
  auth.uid() = user_id
);

-- Only authenticated users can update their own books
CREATE POLICY "Users can update their own books"
ON public.books
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

-- Only authenticated users can delete their own books
CREATE POLICY "Users can delete their own books"
ON public.books
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);