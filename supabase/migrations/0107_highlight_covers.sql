-- UniMate · 0107 a highlight's cover can be any photo from your gallery (Instagram's "edit cover").
-- The cover file lives in your own folder of the stories bucket; it can be read by whoever can see your profile
-- (the same people who see the highlight), and by nobody else.
drop policy if exists "stories read" on storage.objects;
create policy "stories read" on storage.objects for select using (
  bucket_id = 'stories' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or is_admin()
    or exists (
      select 1 from stories s
      where s.author_id::text = (storage.foldername(objects.name))[1]
        and (s.media_url = objects.name or s.overlays::text like '%' || objects.name || '%' or s.meta::text like '%' || objects.name || '%')
        and can_see_story(s.*))
    or exists (
      select 1 from highlights h
      where h.cover_url = objects.name and h.owner_id::text = (storage.foldername(objects.name))[1] and can_see_user(h.owner_id))));
