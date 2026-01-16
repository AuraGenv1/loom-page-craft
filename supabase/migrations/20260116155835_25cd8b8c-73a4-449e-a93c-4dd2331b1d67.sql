-- Add storage policies for book_images bucket (authenticated users can upload and view)

-- Allow authenticated users to upload files to book_images bucket
CREATE POLICY "Authenticated users can upload book images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'book-images');

-- Allow authenticated users to view/select their uploaded images
CREATE POLICY "Authenticated users can view book images"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'book-images');

-- Allow public access to view book images (since bucket is public)
CREATE POLICY "Public can view book images"
ON storage.objects
FOR SELECT
TO anon
USING (bucket_id = 'book-images');

-- Allow authenticated users to update their images
CREATE POLICY "Authenticated users can update book images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'book-images')
WITH CHECK (bucket_id = 'book-images');

-- Allow authenticated users to delete their images  
CREATE POLICY "Authenticated users can delete book images"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'book-images');