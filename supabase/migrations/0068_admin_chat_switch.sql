-- Owner's choice (Nov 2026, testing period): admins see private chats in full again.
-- One switch: private.push_cfg 'admin_chat_full' = 'on' (full) / 'off' (reported messages only, see 0065).
-- Every opening is still written to the admin log.
insert into private.push_cfg(k, v) values ('admin_chat_full', 'on') on conflict (k) do update set v = 'on';

create or replace function private.admin_chat_full()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select v = 'on' from private.push_cfg where k = 'admin_chat_full'), false);
$$;
grant execute on function private.admin_chat_full() to authenticated;

-- with the switch on, every message of a chat is "visible" to admins; off, only the reported windows
create or replace function private.admin_visible_messages(conv uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  with ordered as (select m.id, m.created_at, row_number() over (order by m.created_at, m.id) rn from messages m where m.conversation_id = conv and is_admin()),
  anchors as (
    select o.rn, 5 as before, 5 as after from ordered o join reports r on r.target_type = 'message' and r.target_id = o.id
    union all
    select coalesce((select max(o.rn) from ordered o where o.created_at <= r.created_at), 0), 30, 0
      from reports r where r.target_type = 'conversation' and r.target_id = conv and is_admin()
  )
  select o.id from ordered o where private.admin_chat_full()
  union
  select o.id from ordered o join anchors a on o.rn between a.rn - a.before and a.rn + a.after;
$$;

create or replace function public.admin_list_conversations(q text default '', lim integer default 50, off integer default 0)
returns table(id uuid, kind conversation_kind, title text, context_label text, last_message_at timestamptz, members jsonb, message_count bigint, last_body text)
language plpgsql security definer set search_path = public as $$
declare full_view boolean := private.admin_chat_full();
begin
  perform admin_require();
  return query
  select c.id, c.kind, c.title, c.context_label, c.last_message_at,
    (select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name, 'username', p.username, 'avatar_url', p.avatar_url, 'state', cm.state))
       from conversation_members cm join profiles p on p.id = cm.user_id where cm.conversation_id = c.id),
    (select count(*) from messages mm where mm.conversation_id = c.id),
    case when c.kind = 'community' or full_view
      then (select left(coalesce(mm.body, mm.kind::text), 80) from messages mm where mm.conversation_id = c.id order by mm.created_at desc limit 1)
      when exists (select 1 from private.admin_visible_messages(c.id)) then '⚑ عليها بلاغ'
      else '🔒 محادثة خاصة' end
  from conversations c
  where coalesce(q, '') = ''
     or c.title ilike '%' || q || '%' or c.id::text = q
     or exists (select 1 from conversation_members cm join profiles p on p.id = cm.user_id
                where cm.conversation_id = c.id and (p.full_name ilike '%' || q || '%' or p.username ilike '%' || q || '%'))
  order by c.last_message_at desc nulls last
  limit greatest(1, least(lim, 200)) offset greatest(0, off);
end $$;

-- owner-only switch for the admin panel
create or replace function public.admin_chat_mode(p_full boolean default null)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_full is not null then
    if not is_owner() then raise exception 'owner only'; end if;
    update private.push_cfg set v = case when p_full then 'on' else 'off' end where k = 'admin_chat_full';
    perform admin_log('admin_chat_mode', 'config', 'admin_chat_full', jsonb_build_object('full', p_full));
  else
    perform admin_require();
  end if;
  return private.admin_chat_full();
end $$;
revoke all on function public.admin_chat_mode(boolean) from public, anon;
grant execute on function public.admin_chat_mode(boolean) to authenticated;

create or replace function public.admin_conversation_messages(conv uuid, reason text default null)
returns setof messages language plpgsql security definer set search_path = public as $$
declare k conversation_kind; full_view boolean := private.admin_chat_full();
begin
  if not is_admin() then raise exception 'admins only'; end if;
  select kind into k from conversations where id = conv;
  if not full_view and k is distinct from 'community' and not exists (select 1 from private.admin_visible_messages(conv)) then
    raise exception 'private_chat';
  end if;
  insert into admin_audit_log(admin_id, action, target_type, target_id, meta)
  values (auth.uid(), 'open_conversation', 'conversation', conv::text, jsonb_build_object('reason', reason, 'scope', case when full_view or k = 'community' then 'full' else 'reported_only' end));
  if full_view or k = 'community' then
    return query select * from messages where conversation_id = conv order by created_at;
  else
    return query select * from messages where id in (select private.admin_visible_messages(conv)) order by created_at;
  end if;
end $$;

create or replace function public.admin_conversation_since(conv uuid, after timestamptz)
returns setof messages language plpgsql security definer set search_path = public as $$
declare k conversation_kind;
begin
  perform admin_require();
  select kind into k from conversations where id = conv;
  if k = 'community' or private.admin_chat_full() then
    return query select * from messages where conversation_id = conv and created_at > after order by created_at;
  else
    return query select * from messages where created_at > after and id in (select private.admin_visible_messages(conv)) order by created_at;
  end if;
end $$;
