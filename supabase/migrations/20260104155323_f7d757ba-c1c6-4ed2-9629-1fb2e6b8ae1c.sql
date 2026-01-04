-- Create books table to persist generated guides
CREATE TABLE public.books (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  topic TEXT NOT NULL,
  title TEXT NOT NULL,
  table_of_contents JSONB NOT NULL DEFAULT '[]'::jsonb,
  chapter1_content TEXT NOT NULL,
  local_resources JSONB NOT NULL DEFAULT '[]'::jsonb,
  has_disclaimer BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  session_id TEXT NOT NULL
);

-- Create index for faster lookups by session
CREATE INDEX idx_books_session_id ON public.books(session_id);
CREATE INDEX idx_books_created_at ON public.books(created_at DESC);

-- Enable RLS (public read/write for now since no auth)
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert books (anonymous users)
CREATE POLICY "Anyone can create books"
ON public.books
FOR INSERT
WITH CHECK (true);

-- Allow anyone to read books by session_id
CREATE POLICY "Anyone can read books"
ON public.books
FOR SELECT
USING (true);