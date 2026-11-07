# UniMate — Launch Readiness & Scale Audit

Date: 2026-11-07 · Project: `unimate` (`slkfyblvpewlxrifzrhg`, eu-central-1, Micro) · Code: `github.com/unimatejo/unimate` (`app/` Expo SDK 58)

> **Nothing in this report has been applied to production.** Fixes 0127–0130 are migration files tested inside
> transactions that were rolled back. The app-side fixes are committed locally but not released. Both wait for approval.

## الخلاصة لمحمد

- **القرار:** نقدر نطلق على جامعة وحدة (الهاشمية) على الخطة الحالية (Micro)، **بس بعد** ما تتطبق الإصلاحات الأربعة الجاهزة وتنزل نسخة التطبيق المعدّلة.
- **أكبر خطرين على المصاري، مش على السرعة:**
  1. تصغير الصور على السيرفر (Image Transformations) بينحسب بالصورة.
  2. استهلاك الفيديو للنت (egress).
  - الحل موجود ومجاني، وهو إنه الجوال يعمل نسخة صغيرة من الصورة قبل ما يرفعها. بس هاد شغل بالتطبيق لسا ما انعمل.
- **سقف حقيقي:** خطة Pro فيها **500 اتصال Realtime بنفس اللحظة**. يعني لو صاروا أكثر من 500 طالب فاتحين التطبيق بنفس الوقت، بندفع زيادة. السعر مذكور تحت.
- **ما في اختبار ضغط حقيقي لهلأ:** المرحلة الثالثة (k6 على نسخة تجريبية من السيرفر) لسا ما انعملت. الأرقام تحت **تقدير هندسي، مش قياس**.

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
| 18 | P0 (cost) | `lib/supabase.ts:52`: every feed/chat image is a separately signed **transformed** image (`width`/`quality`). Supabase bills transformations per origin image (100 included, then **$5 per 1,000** per month), and signing costs one storage lookup per image (#2 query by DB time). | Make the small copy on the phone at upload (`-s.jpg`, 480 px) and show it in lists; full size on tap; no server transformations. Batch-sign per page (`createSignedUrls`). | **not done**: next task, needs approval of the approach |
| 19 | P1 | Per-bubble queries: `PostShareBubble` (2), `StoryReplyBubble` (2), `ContactBubble` (1), `PollBubble` (1 + **its own realtime channel**, `ChatAttach.tsx:430`) | Batch by the page's `ref_id`s, one poll channel per chat | not done |
| 20 | P1 | `StoriesRow.tsx:71`: pulls every view row of 200 stories to know "seen" | Filter `views.viewer_id = me` or an RPC returning `seen` | not done |
| 21 | P1 | Chat opens as a 4-step waterfall (`[id].tsx:188`) and also polls members every 15 s | `Promise.all`, drop the poll (realtime already covers it) | not done |
| 22 | P1 | Unbounded lists: comments (`post/[id].tsx:43`), follows lists, `story_views`, message requests (`requests.tsx:37` reads every message) | `.limit` + cursor | not done |
| 23 | P2 | O(n²) `find`/`some` inside `map`: inbox `:91,:106`, community `:84,:106`, schedule `:131`, map `:320` | `Map`/`Set` | not done (small n today) |
| 24 | OK | Pagination | Every list pages by `created_at` (keyset). No offset paging. |
| 25 | OK | Resilience (audit P0 #8) | Done this week: offline outbox for chat (text, photo, voice, location) and stories, last copy shown offline for chats, inbox, feed, profile, schedule, exams, announcements, honor board and campus map, resumable uploads, lighter story video (≤ ~9 MB). |

## Capacity (estimate, not measured)

Assumptions for the Hashemite peak (between lectures): one app open ≈ 15–25 requests in the first 10 s (feed or home), then ≈ 1 request / 30 s while open. After fixes 1–6 and 16–17, typical requests take 2–15 ms.

| Concurrent open | Requests/s at peak | Micro (2 vCPU shared, 1 GB, 60 conns) |
|---|---|---|
| 250 | ~60–120 | comfortable |
| 500 | ~120–250 | OK, CPU ~40–60% (estimate) |
| 1,000 | ~250–500 | limit: needs measuring; Small likely |
| 2,000+ | 500–1,000 | Small/Medium |

**Hard ceiling regardless of compute:** Pro includes **500 concurrent Realtime connections**. Each open app holds one.

## Costs money (waiting for your decision)

| Item | When | Price (supabase.com/pricing, read 2026-11-07) |
|---|---|---|
| Realtime connections over 500 concurrent | >500 open apps | **$10 per extra 1,000** concurrent / month |
| Compute Small (2 GB) | if the load test shows Micro saturates | $15/month instead of Micro's $10 (the $10 credit covers Micro), so **+$5/month**; billed per hour, can step back after the peak |
| Compute Medium (4 GB) | peak weeks only | $60/month, so **+$50/month** (per hour) |
| Egress over 250 GB | video / photos at scale | $0.09/GB (uncached), $0.03/GB (CDN-cached) |
| Image transformations over 100 origin images | **now**, unless #18 is done | $5 per 1,000 images / month |
| Staging branch for the load test | Phase 3, a few hours | $0.01344/hour while it exists (plus its compute) |
| Realtime messages over 5M/month | busy chats | $2.50 per million |
| Custom SMTP | free tier first (Resend/Brevo) | $0 → ~$20/month later |

## Not done yet (honest list)

- Phase 3 load test (k6 on a seeded staging branch) has not been run, so every capacity number above is an estimate.
- #18 thumbnails (cost), #19–23 client batching, merging permissive policies (#7), Realtime Broadcast for in-chat messages (the open chat still uses filtered postgres_changes, acceptable at launch scale), counter columns for likes/followers, cron batching review, PDPL (Jordan 2023) data inventory, PITR + restore drill, alerts at 70%.

## Go / no-go

**Go for one university on Micro** once: (a) 0127–0130 are applied, (b) the app update with #16–17 is out, (c) custom SMTP is confirmed, (d) leaked-password protection is on, (e) #18 is done or image transformations are capped. Open the next university only after a week of real numbers (DB CPU, realtime connections, egress).
