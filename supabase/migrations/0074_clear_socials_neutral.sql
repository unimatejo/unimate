-- Owner's intent: removing someone's Instagram / Snapchat is a courtesy (they lost access to their account),
-- not a penalty. No block, a neutral note, and they can add them again whenever they sign back in.
delete from private.socials_blocked;  -- nobody stays blocked from the earlier version

create or replace function public.admin_clear_socials(p_user uuid, p_block boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare had_ig text; had_sc text; old_bio text; new_bio text;
begin
  perform admin_require();
  select instagram, snapchat into had_ig, had_sc from private.profile_socials where user_id = p_user;
  select bio into old_bio from profiles where id = p_user;
  if not found then raise exception 'not found'; end if;
  new_bio := coalesce(private.strip_socials_clean(private.strip_socials(old_bio)), '');
  update private.profile_socials set instagram = null, snapchat = null, updated_at = now() where user_id = p_user;
  perform set_config('unimate.system', 'on', true);
  update profiles set bio = new_bio, instagram = null, snapchat = null
  where id = p_user and (bio is distinct from new_bio or instagram is not null or snapchat is not null);
  delete from private.socials_blocked where user_id = p_user;
  if had_ig is not null or had_sc is not null or old_bio is distinct from new_bio then
    insert into notifications(user_id, kind, title, body)
    values (p_user, 'system', 'شلنا حسابات التواصل من بروفايلك',
            'شلنا حساب إنستغرام وسناب من بروفايلك حفاظاً على خصوصيتك. بتقدر ترجع تضيفها أي وقت من تعديل البروفايل.');
  end if;
  perform set_config('unimate.system', 'off', true);
  perform admin_log('clear_socials', 'user', p_user::text,
    jsonb_build_object('instagram', had_ig, 'snapchat', had_sc, 'bio_before', old_bio));
  return jsonb_build_object('bio', new_bio, 'had_instagram', had_ig is not null, 'had_snapchat', had_sc is not null, 'bio_changed', old_bio is distinct from new_bio);
end $$;
