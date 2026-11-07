-- UniMate · 0131 the small copies of photos are kept as long as their photo
--
-- Phones now upload a small copy next to each photo (`<name>.t.jpg`, shown in lists; nothing is resized on the
-- server). No row points to the small copy, so the daily cleanup (storage_orphans) would have taken it after 30 days.
-- A small copy now belongs to its photo: it goes only once the photo itself is gone.

create or replace function public.storage_orphans(min_age interval default '30 days'::interval)
returns table (bucket_id text, name text, size bigint)
language sql stable security definer set search_path = public, storage as $$
  select o.bucket_id, o.name, coalesce((o.metadata->>'size')::bigint, 0)
  from storage.objects o
  where o.bucket_id in ('stories', 'posts', 'chat')
    and o.created_at < now() - min_age
    and case
      when o.name ~ '\.t\.jpg$' then
        -- a small copy: an orphan only when its photo is no longer stored
        not exists (select 1 from storage.objects x where x.bucket_id = o.bucket_id and x.name <> o.name
                      and x.name like regexp_replace(o.name, '\.t\.jpg$', '') || '.%' and x.name !~ '\.t\.jpg$')
      else
        not exists (select 1 from stories s where (s.media_url = o.name or s.media_url like '%/' || o.name)
                      and (s.expires_at > now() - interval '30 days' or exists (select 1 from highlight_items h where h.story_id = s.id)))
        and not exists (select 1 from post_media pm where pm.url = o.name or pm.url like '%/' || o.name)
        and not exists (select 1 from messages m where m.media_url = o.name or m.media_url like '%/' || o.name)
        and not exists (select 1 from highlights h where h.cover_url = o.name or h.cover_url like '%/' || o.name)
        and not exists (select 1 from title_requests t where t.proof_url like '%' || o.name)
        and not exists (select 1 from moderation_queue q where q.media_url like '%' || o.name)
    end;
$$;
