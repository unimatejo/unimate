-- Change disappearing-messages mode and post a proper system line (clients can't insert kind = 'system').
create or replace function set_conversation_vanish(conv uuid, mode vanish_mode)
returns void language plpgsql security definer set search_path = public as $$
declare who text;
begin
  if not is_member(conv) then raise exception 'not a member'; end if;
  select full_name into who from profiles where id = auth.uid();
  perform set_config('unimate.system', 'on', true);
  update conversations set vanish = mode where id = conv;
  insert into messages(conversation_id, sender_id, kind, body)
  values (conv, auth.uid(), 'system', coalesce(split_part(who, ' ', 1), '') || ' ← ' || case mode
    when 'never' then 'الرسائل ما بتختفي'
    when 'after_view' then 'الرسائل بتختفي بعد المشاهدة'
    when 'h24' then 'الرسائل بتختفي بعد 24 ساعة'
    else 'الرسائل بتختفي بعد أسبوع' end);
  perform set_config('unimate.system', 'off', true);
end $$;
grant execute on function set_conversation_vanish(uuid, vanish_mode) to authenticated;

-- mark_read must not touch the reader's own messages ('after_view' only vanishes what the other side sent)
