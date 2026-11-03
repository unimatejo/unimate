-- Data quality flags for seeded university data, and allow the few portals that only serve http.
alter table universities add column if not exists data_status text not null default 'draft' check (data_status in ('draft', 'verified'));
alter table universities add column if not exists data_notes text;
alter table colleges add column if not exists verified boolean not null default false;
alter table majors   add column if not exists verified boolean not null default false;
alter table university_links drop constraint if exists university_links_url_check;
alter table university_links add constraint university_links_url_check check (url ~ '^(https?://|tel:)');
