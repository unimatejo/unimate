-- UniMate · 0105 highlights like Instagram, and muting someone's stories.
-- 1) Highlights take photo AND video stories, up to 100 per highlight (was: photos only, 30 for the whole profile).
-- 2) A story taken out of every highlight stops being "highlighted": it goes back to its normal life (seen only for
--    24 h, kept in the archive 30 days), so it can't still be opened by link after you removed it.
-- 3) story_mutes: hide someone's stories from your row without unfollowing or telling them (own rows only).

create or replace function guard_highlight()
returns trigger language plpgsql security definer set search_path = public as $$
declare owner uuid; k media_kind; n int;
begin
  select author_id, kind into owner, k from stories where id = new.story_id;
  if owner is null or owner <> (select owner_id from highlights where id = new.highlight_id) then raise exception 'not your story'; end if;
  if k not in ('image', 'video') then raise exception 'only photos and videos can be highlighted'; end if;
  select count(*) into n from highlight_items where highlight_id = new.highlight_id;
  if n >= 100 then raise exception 'highlight limit reached'; end if;
  update stories set is_highlighted = true where id = new.story_id;
  return new;
end $$;

create or replace function private.unhighlight_story() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update stories set is_highlighted = false
  where id = old.story_id and not exists (select 1 from highlight_items where story_id = old.story_id);
  return null;
end $$;
drop trigger if exists highlight_items_unhighlight on highlight_items;
create trigger highlight_items_unhighlight after delete on highlight_items for each row execute function private.unhighlight_story();
revoke all on function private.unhighlight_story() from public, anon, authenticated;

-- already out of every highlight: put right now
update stories s set is_highlighted = false
where s.is_highlighted and not exists (select 1 from highlight_items h where h.story_id = s.id);

create table if not exists public.story_mutes (
  user_id    uuid not null default auth.uid() references profiles(id) on delete cascade,
  muted_id   uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, muted_id),
  check (user_id <> muted_id)
);
alter table public.story_mutes enable row level security;
revoke all on public.story_mutes from anon;
grant select, insert, delete on public.story_mutes to authenticated;
drop policy if exists "story mutes own" on public.story_mutes;
create policy "story mutes own" on public.story_mutes for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
