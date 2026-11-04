-- College feed without loading 1000 profile ids into the client:
-- every post remembers its author's college at the time of posting.
alter table posts add column if not exists college_id uuid references colleges(id) on delete set null;

create or replace function posts_set_college() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.college_id is null then
    select college_id into new.college_id from profiles where id = new.author_id;
  end if;
  return new;
end $$;

drop trigger if exists posts_set_college on posts;
create trigger posts_set_college before insert on posts for each row execute function posts_set_college();

update posts p set college_id = pr.college_id from profiles pr where pr.id = p.author_id and p.college_id is null;

create index if not exists posts_college_idx on posts(college_id, created_at desc) where not is_hidden;
