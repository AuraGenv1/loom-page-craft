-- Add image metadata columns to book_pages for provenance tracking
ALTER TABLE public.book_pages
ADD COLUMN IF NOT EXISTS image_source TEXT,
ADD COLUMN IF NOT EXISTS original_url TEXT,
ADD COLUMN IF NOT EXISTS image_license TEXT,
ADD COLUMN IF NOT EXISTS image_attribution TEXT,
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE;

-- Add comments for documentation
COMMENT ON COLUMN public.book_pages.image_source IS 'Source of the image: unsplash, pexels, wikimedia, or upload';
COMMENT ON COLUMN public.book_pages.original_url IS 'Original external URL before archiving to storage';
COMMENT ON COLUMN public.book_pages.image_license IS 'License type: Unsplash License, Pexels License, CC0, Rights Certified by Publisher';
COMMENT ON COLUMN public.book_pages.image_attribution IS 'Attribution string: Photo by X on Pexels, or artist name';
COMMENT ON COLUMN public.book_pages.archived_at IS 'Timestamp when image was archived to permanent storage';