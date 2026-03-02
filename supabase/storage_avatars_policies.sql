-- Avatars bucket: create in Dashboard (Storage → New bucket).
-- The bucket identifier must be exactly: avatars (lowercase). The "Name" you type when
-- creating the bucket is the id used by the API. Set Public to On.
-- Or the app will try to create it automatically on first upload.
-- Then run this file to allow authenticated uploads to their own folder and public read.
-- Safe to run multiple times (drops existing policies first).

drop policy if exists "Allow authenticated upload to own avatars folder" on storage.objects;
create policy "Allow authenticated upload to own avatars folder"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (auth.jwt()->>'sub')
);

drop policy if exists "Allow public read avatars" on storage.objects;
create policy "Allow public read avatars"
on storage.objects for select
to public
using (bucket_id = 'avatars');
