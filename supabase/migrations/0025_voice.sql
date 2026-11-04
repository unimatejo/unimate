-- Voice messages: allow web recordings (webm/ogg) next to iPhone m4a.
update storage.buckets set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'audio/m4a', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/webm', 'audio/ogg', 'audio/mpeg', 'application/pdf'] where id = 'chat';
