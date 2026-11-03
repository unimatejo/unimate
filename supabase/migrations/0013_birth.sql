create or replace function set_birth_date(d date)
returns void language sql security definer set search_path = public as $$
  update profile_private set birth_date = d where user_id = auth.uid() and d between date '1950-01-01' and current_date - interval '14 years';
$$;
grant execute on function set_birth_date(date) to authenticated;
