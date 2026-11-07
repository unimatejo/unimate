# UniMate — Launch Readiness & Scale Audit

Date: 2026-11-07 · Project: `unimate` (`slkfyblvpewlxrifzrhg`, eu-central-1, Micro) · Code: `github.com/unimatejo/unimate` (`app/` Expo SDK 58)

> **Applied to production on 2026-11-07 (approved):** backup, migration history repair (0001–0126), 0127–0131, and the
> app update (#16–18). 0132–0134 (found by the load test below) applied the same day after a before/after check on
> production: 160 of 160 checks identical (28 tables + 4 privacy functions × 5 identities), main reads answer 200.

## الخلاصة لمحمد

- **القرار:** نقدر نطلق على جامعة وحدة (الهاشمية) على الخطة الحالية (Micro). إصلاحات اختبار الضغط (0132–0134) انطبقت على السيرفر الحقيقي.
- **أكبر خطرين على المصاري، مش على السرعة:**
  1. تصغير الصور على السيرفر (Image Transformations) بينحسب بالصورة.
  2. استهلاك الفيديو للنت (egress).
  - الحل موجود ومجاني، وهو إنه الجوال يعمل نسخة صغيرة من الصورة قبل ما يرفعها. بس هاد شغل بالتطبيق لسا ما انعمل.
- **سقف حقيقي:** خطة Pro فيها **500 اتصال Realtime بنفس اللحظة**. يعني لو صاروا أكثر من 500 طالب فاتحين التطبيق بنفس الوقت، بندفع زيادة. السعر مذكور تحت.
- **اختبار الضغط انعمل** على نسخة تجريبية فيها 20,000 طالب، 200 ألف منشور، مليون لايك، 2 مليون رسالة. طلّع 3 مشاكل كانت رح توقّع الصفحة الرئيسية لما يكبر المحتوى، وانحلّوا (0132–0134). السقف المقاس تحت.

## Phase 0 — Ground truth

| Item | Finding |
|---|---|
| Launch code | `unimatejo/unimate` → `app/` (Expo / React Native, not Vite/Capacitor) |
| Launch project | `slkfyblvpewlxrifzrhg` ("unimate"). The only other project on the account is `efwmtxhutialynxjnsdj` ("تفاحة", unrelated). |
| `igkvlvaafthbzvbndjzx`, `kwbzwdmqzhwnyjwdsjby` | Not on this account. They belong to an older prototype folder (Vite). That folder is **not** the launch app and should be archived. `unimate-v2` on the PC is a separate Vite prototype with no backend. |
| Migrations ↔ production | `supabase/migrations/0001–0126` are the schema. They were applied directly (SQL), so `supabase_migrations.schema_migrations` lists only `0126`. **Fix (P1):** record 0001–0126 as applied (`supabase migration repair --status applied`), then `supabase db pull` once to confirm zero diff. |
| Environments | Only production exists. **P1:** a staging project or branch for testing, created on demand and deleted after (see the costs list). |

## Phase 1 — Findings and fixes

Severity · evidence · fix · file · before → after.

### Database

| # | Sev | Evidence | Fix | File | Before → after |
|---|---|---|---|---|---|
| 1 | P0 | advisor `auth_rls_initplan`: 123 policies call `auth.uid()` / `my_university()` / `is_admin()` once per row | Rewrite every policy to `(select …)` (an initPlan, run once per query). Calls that take a row column (`is_member(conversation_id)`) stay per row by nature. | `0127_rls_once_per_query.sql` | 168 policies rewritten. Rows visible to a test student are identical before and after on 10 tables. No unwrapped call is left. |
| 2 | P0 | `unindexed_foreign_keys`: 80 FKs, including `message_reactions.user_id`, `notifications.actor_id`, `post_saves.user_id`, `story_views.viewer_id`, `profiles.college_id/major_id`, `comments.parent_id` | One index per uncovered FK | `0128_indexes_and_hygiene.sql` | 80 → 0 uncovered |
| 3 | P1 | `no_primary_key`: `private.alert_log`, `private.quota_log` | identity `id` primary key | `0128` | 2 → 0 |
| 4 | P1 | `function_search_path_mutable`: `private.looks_personal`, `private.osm_stage_guard` | `set search_path = ''` | `0128` | 2 → 0 |
| 5 | P0 | `pg_stat_statements` #1 by total time: `inbox_last_messages` (5,697 calls, 14.5 ms mean on a nearly empty DB). `unread_counts` is also hot. Both read every message of every chat and run the RLS check on each one. | Rewrite both per chat with a lateral `limit 1` / `limit 99` on the `(conversation_id, created_at desc)` index | `0129_inbox_queries.sql` | Same results (hash-compared for a real account). Cost no longer grows with chat history. |
| 6 | P0 | Every app listens to **all** inserts on `messages` (postgres_changes, no filter, `lib/unread.ts`). Realtime runs RLS once per connected user per message on one thread, so 500 online × each message. | The DB sends a content-free ping to each recipient's private topic `inbox:<uid>`, guarded by an RLS policy on `realtime.messages`. Chats over 300 members don't ping. | `0130_inbox_ping.sql` + `lib/unread.ts` | Per message: from N(online) RLS checks to M(members) pings. Tested: a message produced exactly 1 ping for the other member (rolled back). |
| 7 | P2 | `multiple_permissive_policies` (140 in the advisor) | Not merged yet. Merging changes the policy text, so it needs a per-table review (P1 after launch). Item 1 already removes most of the per-row cost. | — | — |
| 8 | P2 | 14 unused indexes | Keep until real traffic shows their use (the DB has 42 users). Re-check 2 weeks after launch. | — | — |

### Security

| # | Sev | Evidence | Status |
|---|---|---|---|
| 9 | OK | 130 `SECURITY DEFINER` functions are executable by `authenticated` | Checked: every one checks the caller (`auth.uid()`, `is_admin`/`owner_require`, `my_university`, `is_member`, `can_manage_conv`) or only returns public data (`app_content` texts, `study_rules_for` grade scales, `username_cooldown_days`). Admin functions use `owner_require()` server-side. Only `app_content()` is open to `anon` (login-screen texts, intended). |
| 10 | OK | 4 tables have RLS on but no policy (`event_disputes`, `honor_frames`, `osm_stage`, `ride_phones`) | Intended: no client access, only through definer functions. Documented here. |
| 11 | P0 (dashboard) | Leaked-password protection off | Turn on (Auth → Passwords). Only team (admin) accounts use passwords; students use university email codes / Microsoft. |
| 12 | P0 (dashboard) | Email sign-in codes use Supabase's built-in mailer unless custom SMTP is set (couldn't read this from here) | Check Auth → SMTP. If built-in, set **Resend** (free 3,000/month, 100/day) or **Brevo** (free 300/day) on the domain with SPF/DKIM/DMARC. Microsoft sign-in needs no email, which lowers the load. |
| 13 | P1 | No CAPTCHA on the email-code request | Turnstile (free) on «ابعتلي رابط» only. University-email-only sign-up already limits abuse. |
| 14 | OK | Storage | Every bucket has a size + MIME limit (chat 25 MB, posts/stories 50 MB, avatars 2 MB…). Private buckets use signed URLs. |
| 15 | OK | Client auth calls | `getUser()` 6 sites, `getSession()` 8, all one-off (sign-in callbacks, admin, uploads). None runs before every query, so the premise of audit item 6 doesn't apply to this codebase. |

### App (client)

| # | Sev | Evidence (file:line) | Fix | Status |
|---|---|---|---|---|
| 16 | P0 | `lib/presence.ts`: one app-wide presence channel `online`. Each open/close goes to every online student: traffic grows with the square of users and eats the 5M realtime-message quota. | Removed. «نشط الآن» is now last-seen within 4 min, looked up in one batched call (≤100 people, ≤1 per 60 s). `touch_seen` every 90 s. | committed, not released |
| 17 | P0 | `lib/unread.ts:24` (see #6) | Private ping, bursts folded into one refresh, safety poll 45 s → 120 s | committed, not released |
| 18 | P0 (cost) | `lib/supabase.ts:52`: every feed/chat image is a separately signed **transformed** image (`width`/`quality`). Supabase bills transformations per origin image (100 included, then **$5 per 1,000** per month), and signing costs one storage lookup per image (#2 query by DB time). | The phone uploads a small copy (`.t.jpg`, 480 px) next to each photo; lists show it, full size on tap; no server transformations. Signing batched per page (`createSignedUrls`, ≤100 per call). `0131` keeps small copies as long as their photo. | released (OTA). Turn off Image Transformations in the dashboard about a day after the update. |
| 19 | P1 | Per-bubble queries: `PostShareBubble` (2), `StoryReplyBubble` (2), `ContactBubble` (1), `PollBubble` (1 + **its own realtime channel**, `ChatAttach.tsx:430`) | Batch by the page's `ref_id`s, one poll channel per chat | not done |
| 20 | P1 | `StoriesRow.tsx:71`: pulls every view row of 200 stories to know "seen" | Filter `views.viewer_id = me` or an RPC returning `seen` | not done |
| 21 | P1 | Chat opens as a 4-step waterfall (`[id].tsx:188`) and also polls members every 15 s | `Promise.all`, drop the poll (realtime already covers it) | not done |
| 22 | P1 | Unbounded lists: comments (`post/[id].tsx:43`), follows lists, `story_views`, message requests (`requests.tsx:37` reads every message) | `.limit` + cursor | not done |
| 23 | P2 | O(n²) `find`/`some` inside `map`: inbox `:91,:106`, community `:84,:106`, schedule `:131`, map `:320` | `Map`/`Set` | not done (small n today) |
| 24 | OK | Pagination | Every list pages by `created_at` (keyset). No offset paging. |
| 25 | OK | Resilience (audit P0 #8) | Done this week: offline outbox for chat (text, photo, voice, location) and stories, last copy shown offline for chats, inbox, feed, profile, schedule, exams, announcements, honor board and campus map, resumable uploads, lighter story video (≤ ~9 MB). |

## Phase 3 — Load test (measured, 2026-11-07)

**Setup.** Staging branch `staging-loadtest`: same schema, policies and grants as production (policies hash-compared;
grants copied from production), same size class (Micro: 60 connections, 2 shared vCPU). Seeded: 30 universities,
20,000 students (5,000 in one university), 300k follows, **200k posts** (40k in the big university), 1M likes,
100k comments, 100k chats with **2M messages**, 100k enrollments, 200k notifications, 5k live stories. 1.2 GB.

**The student session.** Home (unread count, feed page as PostgREST builds it with author + media, my likes/saves on
those posts, "liked by", ads, `touch_seen`) → schedule (enrollments with sections/meetings/rooms, personal meetings,
`my_events`) → inbox (my chats, friends row, `inbox_last_messages`, `unread_counts`) → open a chat (60 messages) →
40% send a message (all triggers run: moderation, rate limit, inbox ping, push) → 20% open the map. Every screen runs
as the signed-in student (`authenticated` + the student's claims), so every RLS rule runs.

**How it was driven.** From inside the database (N sessions at once through `dblink`, no pause between screens).
Two outside drivers were tried and dropped: k6 from this workspace is blocked by Cloudflare in front of supabase.co
(one IP, tool user agent), and an edge function adds ~100 ms network per query, which hides the database cost.
So the numbers below are the **database ceiling**; PostgREST/Auth share the same machine, which is accounted for
in the capacity line.

### Found and fixed (applied to production 2026-11-07)

| # | Sev | Evidence | Fix | Before → after |
|---|---|---|---|---|
| 26 | **P0** | The feed (`posts … order by is_pinned desc, created_at desc limit 20`) had no index in that order: Postgres read every post of the university, ran `can_see_post` on each, sorted, kept 20. | Index per feed tab (university, college, community) in that order | `0132_feed_indexes.sql` · 40k posts: **> 20 s (timeout) → 27 ms** |
| 27 | **P0** | `feed_likers` ("liked by …") ran as the student: the like policy calls `can_see_post` twice per like row. | Check each post once; read the newest likes per post (new index) until 3 visible likers. Same people shown (hash-compared for 6 identities incl. admin, blocked liker, team account, hidden likes, own like on an unseen post). | `0133_feed_likers_once.sql` · 20 posts × 5 likes: **250 ms → 8 ms**; no longer grows with likes |
| 28 | **P0** | The 18 helper checks behind the row rules (`my_university`, `is_admin`, `is_member`, `is_blocked_between`, `can_see_post`, `can_see_user`…) were plain SQL functions, which Postgres re-plans on every call. `can_see_post` 1.14 ms, `can_see_user` 0.47 ms per call. | Same rules, PL/pgSQL (keeps plans per connection; `#variable_conflict use_column` keeps SQL's name rule). Same answers for 3,305 posts × 2,187 people × 5 identities, and same visible rows in 20 tables per identity. | `0134_privacy_checks_cached.sql` · `can_see_post` **1,140 → 121 µs**, `can_see_user` **472 → 95 µs** |
| 29 | P0 (dashboard) | Auth answered **429 "Request rate limit reached"** after ~100 sign-ins from one IP in a few minutes. On campus, many students share one Wi-Fi IP. | Raise the per-IP limits in Auth → Rate Limits before launch day (sign-ins/OTP verifications), together with custom SMTP (#12). | dashboard |

### Results (Micro size class, 60 s per step, 0 errors at every step)

| Sessions at once (no pause) | Before 0132–0134 | After: sessions/s | Home p50 / p95 | Schedule p95 | Inbox p95 | Send p95 |
|---|---|---|---|---|---|---|
| 1 | Home > 20 s at 40k posts (0132 alone: Home 300 ms, ~13 sessions/s) | 27 | 19 / 25 ms | 5 ms | 31 ms | 5 ms |
| 2 | ~18 sessions/s (saturated) | **46** (saturated) | 28 / 30 ms | 7 ms | 6 ms | 5 ms |
| 8 | | 45 | 123 / 133 ms | 29 ms | 25 ms | 18 ms |
| 32 | | 46 | 501 / 564 ms | 138 ms | 110 ms | 123 ms |

The database saturates at **~45 full student sessions per second** (2 vCPU). Past that nothing fails: screens slow
down evenly (queueing), no errors, no timeouts.

### Capacity

A real student at peak opens these 4–5 screens over ~30 s (reading between them). 45 sessions/s × 30 s ≈ **1,350
students actively using the app at the same moment at 100% DB CPU**. Leaving room for PostgREST/Auth on the same
machine and keeping CPU under ~60%: **~600 at once comfortably, ~1,000 at the edge** on Micro. "Open but idle" apps
cost almost nothing (one `touch_seen` per 90 s).

| Active at once | Micro (now) | What to do |
|---|---|---|
| ≤ 600 | comfortable | nothing |
| 600–1,000 | busy (CPU 60–90%) | watch; Large if it stays there |
| > 1,000 | over the ceiling | **Large** ($110/mo, 2 *dedicated* vCPU) or **XL** ($210/mo, 4 vCPU). Small/Medium add memory and connections but the same shared CPU, so they don't raise this ceiling. Billed per hour: can go up for exam weeks only. |

**Hard ceiling regardless of compute:** Pro includes **500 concurrent Realtime connections** (each open app holds one).
Over that: $10 per extra 1,000.

## Costs money (waiting for your decision)

| Item | When | Price (supabase.com/pricing, read 2026-11-07) |
|---|---|---|
| Realtime connections over 500 concurrent | >500 open apps | **$10 per extra 1,000** concurrent / month |
| Compute Large (2 dedicated vCPU, 8 GB) | > ~1,000 students active at once (measured above) | ~$110/month (the $10 credit covers Micro, so about **+$100/month**); per hour, can step back after the peak |
| Compute XL (4 dedicated vCPU) | > ~2,000 active at once | ~$210/month |
| Egress over 250 GB | video / photos at scale | $0.09/GB (uncached), $0.03/GB (CDN-cached) |
| Image transformations over 100 origin images | until they're turned off (#18 is released) | $5 per 1,000 images / month |
| Staging branch for the load test | used 2026-11-07, deleted the same day | $0.01344/hour while it exists (plus its compute) |
| Realtime messages over 5M/month | busy chats | $2.50 per million |
| Custom SMTP | free tier first (Resend/Brevo) | $0 → ~$20/month later |

## Not done yet (honest list)

- Load test from real phones/HTTP at scale (the database was measured from inside; Realtime connections over 500 and the HTTP layer were not driven at volume).
- #19–23 client batching, merging permissive policies (#7), Realtime Broadcast for in-chat messages (the open chat still uses filtered postgres_changes, acceptable at launch scale), counter columns for likes/followers, cron batching review, PDPL (Jordan 2023) data inventory, PITR + restore drill, alerts at 70%.

## Go / no-go

**Go for one university on Micro** once: (a) custom SMTP is confirmed and Auth rate limits are raised (#12, #29), (b) leaked-password protection is on, (c) image transformations are turned off. Already done: 0127–0134 and the app update (#16–18). Open the next university only after a week of real numbers (DB CPU, realtime connections, egress).
