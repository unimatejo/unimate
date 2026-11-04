-- UniMate · 0040 reels: short videos as posts (post_media kind 'video' in the posts bucket)
update storage.buckets
set allowed_mime_types = array['image/jpeg','image/png','image/webp','application/pdf','video/mp4','video/quicktime'],
    file_size_limit = 52428800
where id = 'posts';
