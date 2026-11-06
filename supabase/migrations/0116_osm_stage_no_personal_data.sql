-- osm_stage (raw OSM / Wikimapia rows, never shown to anyone) held people's homes, names and phone numbers from
-- Wikimapia. The import never took them; here they go, and new ones can't come in.
--
-- 1) Delete the rows that look personal (a home or flat, a person's name, a phone number) and that no building or
--    place came from (no osm_id in `buildings` / `places` matches them), so nothing on any map changes.
-- 2) A guard on osm_stage: a row whose name is clearly personal is dropped on insert or update (no error, so a bulk
--    load still goes through). It is stricter than (1): words like "بيت" also name shops, so the guard sticks to homes,
--    flats, the late / someone's workplace, family diwans and phone numbers.

create or replace function private.looks_personal(n text, strict boolean default true)
returns boolean language sql immutable as $$
  select coalesce(n, '') ~ '\d{5,}|\d{3}[\s-]\d{3,}|07[789]\d{7}'
      or coalesce(n, '') ~ '(منزل|مسكن خاص|شق[ةه] [أ-ي0-9]|فيلا [أ-ي]|المرحوم|مكان عمل|ديوان عشائر|منزل رقم|رقم \d+ ?منزل)'
      or (not strict and coalesce(n, '') ~ '(مسكن|بيت ال|بيت [أ-ي]|فيلا|عمار[ةه] |بناي[ةه] |شق[ةه] |ديوان|رقم \d+|الحاج |ابناء|أبناء|ابناع|اهداء|إهداء|عيلته|المحترم|الدكتور[ةه]? [أ-ي]|^د\. ?[أ-ي]|Dr\. ?[A-Z])');
$$;

do $$
declare n int;
begin
  delete from osm_stage s
  where private.looks_personal(coalesce(s.name_ar, '') || ' ' || coalesce(s.name_en, ''), false)
    and not exists (select 1 from places x where x.osm_id is not null and regexp_replace(x.osm_id, '\D', '', 'g') = regexp_replace(s.osm, '\D', '', 'g'))
    and not exists (select 1 from buildings b where b.osm_id is not null and regexp_replace(b.osm_id, '\D', '', 'g') = regexp_replace(s.osm, '\D', '', 'g'));
  get diagnostics n = row_count;
  raise notice 'osm_stage: % personal rows removed', n;
end $$;

create or replace function private.osm_stage_guard() returns trigger language plpgsql as $$
begin
  if private.looks_personal(coalesce(new.name_ar, '') || ' ' || coalesce(new.name_en, '')) then return null; end if;
  return new;
end $$;
drop trigger if exists osm_stage_guard on public.osm_stage;
create trigger osm_stage_guard before insert or update on public.osm_stage for each row execute function private.osm_stage_guard();
