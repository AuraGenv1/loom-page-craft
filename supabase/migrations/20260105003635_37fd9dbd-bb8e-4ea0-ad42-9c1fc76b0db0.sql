-- Drop the old permissive SELECT policy
DROP POLICY IF EXISTS "Anyone can view books" ON public.books;

-- Create a strict SELECT policy: only authenticated users can view their own books via direct query
CREATE POLICY "Users can view their own books"
ON public.books
FOR SELECT
USING (auth.uid() = user_id);

-- Create a security definer function for session-based access
-- This allows guests to view books by providing their session_id
CREATE OR REPLACE FUNCTION public.get_book_by_session(p_session_id TEXT)
RETURNS SETOF public.books
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.books
  WHERE session_id = p_session_id
  ORDER BY created_at DESC
  LIMIT 1;
$$;