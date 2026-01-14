-- Add unique constraint on book_id and chapter_number for upsert operations
CREATE UNIQUE INDEX IF NOT EXISTS chapters_book_chapter_unique 
ON public.chapters (book_id, chapter_number);
