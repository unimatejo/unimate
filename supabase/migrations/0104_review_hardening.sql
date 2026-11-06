-- UniMate · 0104 hardening for review (NOT applied yet — waiting for the owner's approval).
-- Audit of 2026-11-06 on the live database:
--   · 172 SECURITY DEFINER functions in public; 135 are callable by `authenticated`. Every one was checked:
--     the admin_/owner_ ones all call admin_require()/owner_require()/team_require() first (admin_import_grades
--     calls owner_require() AND private.team_require()); admin_log only writes when is_admin(); the rest are the
--     app's own RPCs or helpers the RLS policies call (those must stay callable, a policy runs as the user).
--   · 8 are called by nothing in the app and by no policy — only from inside other definer functions, which run
--     as the owner and don't need the grant. They are closed below.
--   · official grades live in private.official_grades: no grant to anon/authenticated, read only through
--     honor_board()/honor_status() (opted-in students only, top 10, GPA only with permission).
--   · 18 old error "admin_alert" notifications still hold raw error text (grant check, PGRST201, Loading module). They
--     were sent to the owner and the team account only (never to students), before 0088 stopped the alerts.

-- 1) internal helpers: no direct calls from the app
revoke execute on function public.admin_require() from public, anon, authenticated;
revoke execute on function public.owner_require() from public, anon, authenticated;
revoke execute on function public.admin_session_ok() from public, anon, authenticated;
revoke execute on function public.can_announce(uuid) from public, anon, authenticated;
revoke execute on function public.can_pin_announcement(uuid) from public, anon, authenticated;
revoke execute on function public.can_request_title() from public, anon, authenticated;
-- old entry points the app no longer uses (enroll_in let a caller pick the enrollment source; set_hide_honor
-- was replaced by set_honor_options in 0089)
revoke execute on function public.enroll_in(text, text, text, text, text, enrollment_source) from public, anon, authenticated;
revoke execute on function public.set_hide_honor(boolean) from public, anon, authenticated;

-- 2) client_errors: the app only ever adds a row; reading is for the owner (RLS), changing or removing for nobody
revoke update, delete on public.client_errors from authenticated;

-- 3) the error alerts are gone for good: remove the no-op trigger and the old raw-text alerts
drop trigger if exists client_errors_alert on public.client_errors;
drop function if exists public.on_client_error();
-- (moderation alerts share the kind and stay: only the old error ones go)
delete from public.notifications where kind = 'admin_alert' and title like 'عطل بالتطبيق:%';
