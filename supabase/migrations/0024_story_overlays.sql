-- Story editor: text, stickers and mentions drawn on top of the photo/video, kept as data
-- so every phone (and the web) renders them crisp at its own size.
alter table stories add column if not exists overlays jsonb not null default '[]'::jsonb;
alter table stories drop constraint if exists stories_overlays_size;
alter table stories add constraint stories_overlays_size check (jsonb_typeof(overlays) = 'array' and jsonb_array_length(overlays) <= 30 and pg_column_size(overlays) < 20000);
