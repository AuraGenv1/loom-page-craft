-- Allow guests to view guest books (books with user_id IS NULL)
-- This enables the book_pages RLS policies to properly evaluate
-- since they use EXISTS (SELECT 1 FROM books WHERE ...)
CREATE POLICY "Guests can view guest books"
ON public.books
FOR SELECT
USING (user_id IS NULL);