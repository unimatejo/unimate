-- UniMate · 0057 how a photo / video is framed after the in-app crop editor.
-- meta: { rect?: {l,t,w,h}  -- where the media sits inside its frame, as fractions of the frame (videos; story photos shown smaller than the frame)
--         fit?: 'blur'        -- fill the rest of the frame with a blurred copy (stories)
--         trim?: {start,end}  -- seconds of a video to play }
-- Photos are cropped for real before upload, so most rows have no meta.
alter table post_media add column if not exists meta jsonb;
alter table stories add column if not exists meta jsonb;
alter table post_media drop constraint if exists post_media_meta_small;
alter table post_media add constraint post_media_meta_small check (meta is null or pg_column_size(meta) < 2000);
alter table stories drop constraint if exists stories_meta_small;
alter table stories add constraint stories_meta_small check (meta is null or pg_column_size(meta) < 2000);
