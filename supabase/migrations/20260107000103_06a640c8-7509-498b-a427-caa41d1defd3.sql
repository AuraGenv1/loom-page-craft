-- Add cover_image_url column to store FAL.AI generated images
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS cover_image_url text;

-- Add is_purchased column to track purchase status
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS is_purchased boolean NOT NULL DEFAULT false;

-- Add full chapter content columns (chapters 2-10)
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS chapter2_content text;
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS chapter3_content text;
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS chapter4_content text;
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS chapter5_content text;
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS chapter6_content text;
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS chapter7_content text;
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS chapter8_content text;
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS chapter9_content text;
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS chapter10_content text;

-- Add edition_year column for update editions
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS edition_year integer DEFAULT EXTRACT(YEAR FROM NOW());