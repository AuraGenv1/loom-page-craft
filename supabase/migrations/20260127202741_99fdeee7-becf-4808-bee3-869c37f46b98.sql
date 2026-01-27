-- Allow anyone (even anonymous) to upload images to book-images bucket
-- This is needed for users who create books without being logged in

DROP POLICY IF EXISTS "Authenticated users can upload book images" ON storage.objects;

CREATE POLICY "Anyone can upload book images" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'book-images');

-- Also ensure anyone can update (for upsert operations)
DROP POLICY IF EXISTS "Authenticated users can update book images" ON storage.objects;

CREATE POLICY "Anyone can update book images" 
ON storage.objects 
FOR UPDATE 
USING (bucket_id = 'book-images')
WITH CHECK (bucket_id = 'book-images');