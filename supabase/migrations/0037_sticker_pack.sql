-- UniMate's own sticker pack (original "Yuni" character + Jordanian text + a few animated), shown to everyone.
create table if not exists public.pack_stickers (
  id uuid primary key default gen_random_uuid(),
  pack text not null default 'yuni',
  url text not null unique,
  tags text,
  animated boolean not null default false,
  position int not null default 0
);
alter table public.pack_stickers enable row level security;
drop policy if exists "packs read" on public.pack_stickers;
create policy "packs read" on public.pack_stickers for select using (true);
grant select on public.pack_stickers to anon, authenticated;
