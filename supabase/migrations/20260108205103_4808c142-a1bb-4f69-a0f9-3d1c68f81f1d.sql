-- Drop if exists to ensure clean creation
DROP TABLE IF EXISTS public.chapters;

-- Create chapters table
CREATE TABLE public.chapters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    book_id UUID REFERENCES public.books(id) ON DELETE CASCADE,
    title TEXT,
    content TEXT,
    chapter_number INTEGER,
    image_url TEXT,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.chapters ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (for edge functions)
CREATE POLICY "Service role full access" ON public.chapters
    FOR ALL USING (true) WITH CHECK (true);

-- Allow public to read chapters
CREATE POLICY "Public can read chapters" ON public.chapters
    FOR SELECT USING (true);