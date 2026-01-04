-- Add user_id column to books table (nullable to support existing data)
ALTER TABLE public.books 
ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Drop existing permissive policies
DROP POLICY IF EXISTS "Anyone can create books" ON public.books;
DROP POLICY IF EXISTS "Anyone can read books" ON public.books;

-- Create new secure RLS policies

-- Users can only insert books if authenticated and setting their own user_id
CREATE POLICY "Authenticated users can create their own books"
ON public.books
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Users can read their own books
CREATE POLICY "Users can view their own books"
ON public.books
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Users can update their own books
CREATE POLICY "Users can update their own books"
ON public.books
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

-- Users can delete their own books
CREATE POLICY "Users can delete their own books"
ON public.books
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);