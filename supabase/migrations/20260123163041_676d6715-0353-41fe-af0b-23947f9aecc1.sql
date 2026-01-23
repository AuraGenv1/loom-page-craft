-- Create enum for block types
CREATE TYPE public.page_block_type AS ENUM (
  'chapter_title',
  'text',
  'image_full',
  'image_half',
  'pro_tip',
  'heading',
  'list'
);

-- Create normalized book_pages table
CREATE TABLE public.book_pages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  chapter_number INTEGER NOT NULL,
  page_order INTEGER NOT NULL,
  block_type public.page_block_type NOT NULL,
  content JSONB NOT NULL DEFAULT '{}',
  image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Ensure unique ordering within each chapter
  UNIQUE(book_id, chapter_number, page_order)
);

-- Create indexes for efficient querying
CREATE INDEX idx_book_pages_book_id ON public.book_pages(book_id);
CREATE INDEX idx_book_pages_chapter ON public.book_pages(book_id, chapter_number);

-- Enable RLS
ALTER TABLE public.book_pages ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can manage pages for their own books
CREATE POLICY "Users can view pages for their books"
ON public.book_pages
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.books 
    WHERE books.id = book_pages.book_id 
    AND books.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert pages for their books"
ON public.book_pages
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.books 
    WHERE books.id = book_pages.book_id 
    AND books.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update pages for their books"
ON public.book_pages
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.books 
    WHERE books.id = book_pages.book_id 
    AND books.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete pages for their books"
ON public.book_pages
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.books 
    WHERE books.id = book_pages.book_id 
    AND books.user_id = auth.uid()
  )
);

-- Service role policy for edge functions
CREATE POLICY "Service role full access to book_pages"
ON public.book_pages
FOR ALL
USING (true)
WITH CHECK (true);

-- Trigger for updated_at
CREATE TRIGGER update_book_pages_updated_at
BEFORE UPDATE ON public.book_pages
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for live updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.book_pages;