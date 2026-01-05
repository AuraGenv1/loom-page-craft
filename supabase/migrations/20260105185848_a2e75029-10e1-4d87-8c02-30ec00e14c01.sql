-- Create a public bucket for generated book images (covers + chapter diagrams)
insert into storage.buckets (id, name, public)
values ('book-images', 'book-images', true)
on conflict (id) do update set public = true;

-- Public read access for images in this bucket
create policy "Public can read book images"
on storage.objects
for select
using (bucket_id = 'book-images');