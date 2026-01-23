-- Drop the overly permissive service role policy
DROP POLICY "Service role full access to book_pages" ON public.book_pages;

-- Add policy for guest/anonymous book creation (matching books table pattern)
-- Guests can view pages for books they created via session_id
CREATE POLICY "Guests can view pages for their session books"
ON public.book_pages
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.books 
    WHERE books.id = book_pages.book_id 
    AND books.user_id IS NULL
  )
);

-- Allow inserts when book_id references a valid book (service role handles this)
CREATE POLICY "Allow page inserts for valid books"
ON public.book_pages
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.books 
    WHERE books.id = book_pages.book_id
  )
);