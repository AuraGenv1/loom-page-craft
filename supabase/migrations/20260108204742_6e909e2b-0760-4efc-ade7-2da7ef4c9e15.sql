-- Create chapters table for storing individual book chapters
CREATE TABLE public.chapters (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  chapter_number INTEGER NOT NULL,
  title TEXT,
  content TEXT,
  image_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'generating', 'completed', 'failed')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(book_id, chapter_number)
);

-- Enable RLS
ALTER TABLE public.chapters ENABLE ROW LEVEL SECURITY;

-- Create policies matching book access patterns
CREATE POLICY "Users can view chapters of their own books"
ON public.chapters
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.books 
    WHERE books.id = chapters.book_id 
    AND books.user_id = auth.uid()
  )
);

CREATE POLICY "Anyone can view chapters via session"
ON public.chapters
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.books 
    WHERE books.id = chapters.book_id
  )
);

CREATE POLICY "Service role can insert chapters"
ON public.chapters
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Service role can update chapters"
ON public.chapters
FOR UPDATE
USING (true);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_chapters_updated_at
BEFORE UPDATE ON public.chapters
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster lookups
CREATE INDEX idx_chapters_book_id ON public.chapters(book_id);
CREATE INDEX idx_chapters_status ON public.chapters(status);