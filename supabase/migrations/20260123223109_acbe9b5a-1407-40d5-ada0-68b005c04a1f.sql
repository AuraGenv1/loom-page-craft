-- Add is_official column to books table for Official Verification System
ALTER TABLE public.books 
ADD COLUMN IF NOT EXISTS is_official boolean NOT NULL DEFAULT false;

-- Add comment for documentation
COMMENT ON COLUMN public.books.is_official IS 'Indicates if this is a Loom & Page Original (true) or user-generated content (false)';