-- Step 0: Migrate cover_image_url from TEXT to TEXT[] for fallback logic
-- First add a new temporary column
ALTER TABLE public.books ADD COLUMN cover_image_urls text[];

-- Migrate existing data (convert single URL to array with one element)
UPDATE public.books 
SET cover_image_urls = ARRAY[cover_image_url]
WHERE cover_image_url IS NOT NULL;

-- Drop the old column and rename the new one
ALTER TABLE public.books DROP COLUMN cover_image_url;
ALTER TABLE public.books RENAME COLUMN cover_image_urls TO cover_image_url;