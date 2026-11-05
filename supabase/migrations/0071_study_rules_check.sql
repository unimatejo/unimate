-- Study rules: the server checks the shape too, so a bad save can never break every student's GPA / absence math.
create or replace function public.admin_set_study_rules(p_university uuid, p_rules jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare mx numeric; e jsonb; seen text[] := '{}'; prev numeric := null; pt numeric;
begin
  perform admin_require();
  if p_rules is null or jsonb_typeof(p_rules) <> 'object' then raise exception 'bad rules'; end if;
  if exists (select 1 from jsonb_object_keys(p_rules) k where k not in ('absence_pct', 'weeks', 'scale', 'max_gpa')) then raise exception 'bad rules'; end if;

  if p_rules ? 'max_gpa' then
    if jsonb_typeof(p_rules->'max_gpa') <> 'number' or (p_rules->>'max_gpa')::numeric not in (4, 5) then raise exception 'bad rules'; end if;
  end if;
  mx := coalesce((p_rules->>'max_gpa')::numeric, 4);

  if p_rules ? 'absence_pct' then
    if jsonb_typeof(p_rules->'absence_pct') <> 'number' or (p_rules->>'absence_pct')::numeric not between 1 and 50 then raise exception 'bad rules'; end if;
  end if;
  if p_rules ? 'weeks' then
    if jsonb_typeof(p_rules->'weeks') <> 'number' or (p_rules->>'weeks')::numeric <> trunc((p_rules->>'weeks')::numeric)
       or (p_rules->>'weeks')::int not between 8 and 20 then raise exception 'bad rules'; end if;
  end if;
  if p_rules ? 'scale' then
    if jsonb_typeof(p_rules->'scale') <> 'array' or jsonb_array_length(p_rules->'scale') not between 1 and 20 then raise exception 'bad rules'; end if;
    for e in select * from jsonb_array_elements(p_rules->'scale') loop
      if jsonb_typeof(e) <> 'object' or jsonb_typeof(e->'g') <> 'string' or jsonb_typeof(e->'p') <> 'number'
         or (e->>'g') !~ '^[A-DF][+-]?$' or (e->>'g') = any(seen) then raise exception 'bad rules'; end if;
      pt := (e->>'p')::numeric;
      if pt < 0 or pt > mx or (prev is not null and pt >= prev) then raise exception 'bad rules'; end if;
      seen := seen || (e->>'g'); prev := pt;
    end loop;
  end if;

  update universities set study_rules = p_rules where id = p_university;
  if not found then raise exception 'bad university'; end if;
  perform admin_log('set_study_rules', 'university', p_university::text, p_rules);
end $$;
revoke all on function public.admin_set_study_rules(uuid, jsonb) from public, anon;
grant execute on function public.admin_set_study_rules(uuid, jsonb) to authenticated;
