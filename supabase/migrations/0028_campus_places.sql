-- Fuller campus maps: more kinds of places (kiosks, shops, bus stops, ATMs, pharmacies, gardens),
-- English names, and an OpenStreetMap id so imports can be re-run without duplicates.
alter type place_kind add value if not exists 'kiosk';
alter type place_kind add value if not exists 'shop';
alter type place_kind add value if not exists 'bus';
alter type place_kind add value if not exists 'atm';
alter type place_kind add value if not exists 'pharmacy';
alter type place_kind add value if not exists 'garden';

alter table public.places add column if not exists name_en text;
alter table public.places add column if not exists osm_id text;
create unique index if not exists places_osm_uniq on public.places (osm_id) where osm_id is not null;
