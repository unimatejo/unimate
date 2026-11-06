# UniMate — Architecture

A map of where everything lives, so anyone opening the project knows where to change a feature.
Keep it current: run `python3 tools/arch/generate.py` after adding or moving screens, components, functions or migrations
(it rewrites the generated part at the end of this file), and edit the hand-written parts when a flow changes.

## 1. The pieces

| Part | Where | Runs on |
|---|---|---|
| App (iPhone, Android, web) | `app/` — Expo SDK 58, React Native, expo-router | phones; web at **app.unimate.my** (Hostinger, static) |
| Backend | `supabase/` — Postgres + Row Level Security, RPC functions, triggers, Storage, Edge Functions | Supabase project `slkfyblvpewlxrifzrhg` |
| Public site | `site/` (`python3 build.py`) | **unimate.my** (Hostinger) |
| Build & release tools | `tools/` — `web/postbuild.py` (PWA + old-chunk recovery), `ota/publish.js` (over-the-air updates), `arch/generate.py` (this file) | the developer's machine / CI |
| CI | `.github/workflows` — Android APK and iOS IPA on every push to `main` that touches `app/` | GitHub Actions |

## 2. Inside the app (`app/src`)

- `app/` — **screens**. The file path is the URL (expo-router). Groups in brackets don't appear in the URL:
  `(auth)` sign-in and onboarding · `(tabs)` the five tabs · `(community)` feed, people, notifications ·
  `(chat)` messages · `(campus)` map, announcements, rides, directory · `(study)` GPA, attendance, exams, honor board ·
  `admin/` the admin panel · `settings/` settings · `post/`, `story/` create and view.
- `components/` — **pieces of screens**, one folder per feature (`feed`, `story`, `chat`, `admin`, `create`, `media`, `profile`, `study`, `ui`…).
  `components/ui` is the design system (buttons, text, fields, sheets).
- `lib/` — **logic without UI**: data loading (`posts.ts`, `schedule.ts`), auth (`auth.tsx`, `team.ts`), media (`upload.ts`,
  `videoShrink.ts`, `cropper.ts`), notifications (`notifPermission.ts`, `notify.ts`, `webpush.ts`), errors (`errors.ts`, `run.ts`),
  cache (`cache.ts`), translations (`i18n.ts`, `i18n.en.ts`), theme (`theme.ts`).
- `_layout.tsx` (root) — the **gate**: decides where a session goes (sign-in → team code → setup → notifications intro → tabs),
  the app-wide error screen, and the OTA updater.

## 3. How data moves

**Reading.** Screens call Supabase directly (`supabase.from(...)` / `supabase.rpc(...)`). Row Level Security decides what each
account may see; there is no API server in between. Screens that open often (home, timetable, feed, inbox, notifications,
profiles) first show what they showed last time (`lib/cache.ts`) and refresh quietly.

**Writing.** Inserts/updates go through RLS too. Anything official or multi-step is an RPC (`security definer` function) that
checks the caller first (`admin_require()`, `owner_require()`, `auth.uid()`). Triggers then do the follow-ups: counters,
notifications, push, content checks, and **guards** that undo changes a user may not make (title, blue check, status…).

**Notifications.** A database row in `notifications` → trigger `private.on_notification_push` → Edge Function `push`
(web push for the web app, FCM for Android). The client never creates notifications.

**Media.** Pick → crop/frame (`MediaCropper`, `StoryEditor`) → photos resized on the device by their long side
(`lib/upload.ts › fitLongSide`), videos converted/trimmed to MP4 (`lib/videoShrink.ts`) → Storage (`posts`, `stories`, `chat`
private; `avatars`, `stickers`, `ads`, `campus` public). Shown through short-lived signed links; photos are resized on the
server for where they're shown (`lib/supabase.ts › mediaUrl(bucket, path, width)` + `photoWidth`).

**Errors.** Any failure is logged quietly to `client_errors` (`lib/errors.ts › reportError`, deduplicated) and shown to the
student only as a plain message (`lib/run.ts › friendly / userMessage`; root `ErrorBoundary`). Admins read them in
Admin › أخطاء التطبيق (`app/admin/errors.tsx`). Stale web code after a deploy reloads once per version.

## 4. Main flows — where to look

| Flow | Client | Database / server |
|---|---|---|
| University sign-in (email code, Microsoft) | `(auth)/login.tsx`, `verify.tsx`, `callback.tsx`, `lib/auth.tsx` | `handle_new_user`, `sync_verified`, Edge `ms-role` → `ms_apply_title` |
| Team (admin) sign-in | `(auth)/team.tsx`, `team-password.tsx`, `lib/team.ts` | `private.team_accounts`, `is_team_account`, `admin_session_ok` (needs aal2) |
| First setup + notifications intro | `(auth)/welcome.tsx`, `(auth)/notify.tsx`, `lib/notifPermission.ts` | `profiles.onboarded`, `notification_prefs` |
| Feed | `(tabs)/community.tsx`, `components/feed/*`, `lib/posts.ts` | `posts`, `post_media`, `post_likes`, RPC `feed_likers`; checks `private.mod_post` |
| Create post / story / reel | `post/new.tsx`, `components/create/*`, `components/story/StoryEditor.tsx` | Storage `posts`/`stories`, `stories`, `post_media`; image check Edge `moderate` |
| Stories | `components/story/StoriesRow.tsx`, `story/[id].tsx` | `stories`, `story_views`, `can_see_story` |
| Chats | `(chat)/messages/*`, `components/chat/*`, `lib/unread.ts`, `lib/presence.ts` | `conversations`, `conversation_members`, `messages`, `inbox_last_messages`, `unread_counts` |
| Timetable | `(tabs)/schedule.tsx`, `lib/schedule.ts`, `components/study/ScheduleScan.tsx` | `enrollments`, `sections`, `section_meetings`, `add_course`, Edge `schedule-import` (Gemini) |
| Honor board and frames | `(study)/honor.tsx`, `components/honor/*`, `lib/frames.ts`, `Avatar` in `components/ui`, `admin/grades.tsx` | `honor_board`, `honor_status`, `honor_frames_visible`, `honor_frames`, `private.honor_rows`, `private.official_grades`, `admin_import_grades`, `admin_set_frame` |
| Titles and blue check | `settings/faculty.tsx`, `admin/titles.tsx`, `components/admin/UserDetail.tsx` | `request_title`, `admin_review_title`, `admin_set_title`, `admin_set_blue_check`, `private.is_vip_title`, guards on `profiles` |
| Announcements | `(campus)/announcements/*` | `post_announcement`, `can_announce` |
| Content checks | (automatic) | `moderation_words`, `private.mod_*` triggers, `moderation_queue`, Edge `moderate`; Admin › فحص المحتوى |
| App look (owner) | `admin/look.tsx`, `lib/appContent.ts`, `components/home/quick.ts` | `app_content`, `admin_set_app_content` |
| Campus map | `(campus)/map.tsx`, `components/map/*`, `lib/campus/*` | `campus_maps`, Storage `campus`, Edge `campus-osm`, `buildings`, `places`, `campus_search` |
| Admin panel | `app/admin/*`, `components/admin/kit.tsx`, `components/admin/sections.ts` | `admin_*` RPCs, `admin_stats`, `admin_series`, `admin_audit_log` |

## 4a. Honor board and frames

Ranks come **only** from the university's official grades (`private.official_grades`, never typed by students). The points
system was removed (0108, dropped in 0112); `/honor` is the only ranking.

- **Opt-in.** `profiles.hide_honor` is `true` by default. Nobody appears on the board or wears a frame until they turn on
  «شارك بلوحة المتفوقين». A nickname (`honor_alias`) shows instead of name, photo and major, and means no frame.
- **No GPAs for others.** `honor_board` returns `gpa` only on the caller's own row. The "your place" card never compares.
- **Frames** (`honor_frames`, 0109): per term and scope (major / college / university) from the term GPA:
  1st gold (glows), 2nd silver, 3rd bronze, 4th–10th small blue, nobody else. Scope `special` = given by the owner
  (`admin_set_frame`, Admin › user › إطار التكريم). Worked out by `private.compute_honor_frames` after every import and in
  the nightly `honor_snapshot` job (00:15), which also stamps «آخر تحديث». Owner switch: Admin › شكل التطبيق › إطارات التكريم
  (`app_content.features.frames`).
- **Client.** `lib/frames.ts` loads `honor_frames_visible()` once (3 h cache, cleared on sign-out); the shared `Avatar` reads
  it by user id and draws the frame **inside** its size, so every screen (posts, comments, chats, stories, profile, board)
  gets it with no layout change. `frame={null}` turns it off where a bigger frame is drawn (the podium).

### Official grades file (Admin › علامات الجامعة, `admin_import_grades`, owner + team account only)

One file per term. Students are matched by **university number** (`profile_private.student_number`); unmatched rows are kept
and match later when that student signs up.

CSV / TSV (comma, Arabic comma, semicolon or Tab; a header line is skipped; Arabic digits are fine):

```
student_number, term_gpa, cumulative_gpa, credit_hours, major
2620387, 3.71, 3.60, 96, الهندسة المدنية
2620707, 3.98, 3.90, 102, الهندسة المدنية
```

or JSON: `[{"student_number":"2620387","term_gpa":3.71,"cumulative_gpa":3.60,"credit_hours":96,"major":"الهندسة المدنية"}]`

- `student_number` 5–12 digits; GPAs 0–4 (at least one of the two); `credit_hours` and `major` optional.
- `major` is matched to `majors.name_ar` / `name_en` of that university (`private.major_key`); an unknown name groups on its
  own, and with no major the student's profile major is used.
- Re-uploading the same term updates rows in place. «اعتبره الفصل الحالي» makes it the term the board shows by default;
  older terms stay selectable on the board.

## 4b. Campus map (3D) and "وديني"

- **Data.** Edge function `campus-osm` (fired by pg_cron every 3 h for the campus with the oldest file, or by hand
  `private.campus_osm_fire(<university>)`) reads the campus box from the **OSM map API** (Overpass mirrors refuse or time
  out from cloud servers), and writes `campus/<university>.json` to Storage plus a row in `campus_maps` (version, stats).
  The file holds building outlines with heights (`height` / `building:levels`, else our `floors`, else a default by type),
  green areas, water, parking, every walkable path and road, and trees. Each of our `buildings` is linked to the outline it
  stands in (or the nearest within 40 m) so the 3D building carries the **official Arabic name** and floors; a building OSM
  doesn't have gets an approximate box. New named points of interest on campus (kiosks, bus stops, cafés, ATMs, gates…) are
  added to `places` with their `osm_id`; nothing already there is changed or removed.
  The campus outline is looked up by the university's name (Photon search, then the outline from the OSM API; the name
  must match, word for word) so a rough saved centre still lands the map on the real campus; if the centre is outside
  that outline it is moved into it.
- **Admin.** Admin › خرائط الجامعات (`app/admin/maps.tsx`, RPCs `admin_campus_overview`, `admin_campus_rebuild`) lists
  every university's map with how complete it is (ready / partial / sparse), opens it as its students see it
  (`/map?uni=<id>`, admins only: RLS already lets admins read every campus's buildings and places), or rebuilds it now.
- **Web.** `react-native-maps` is swapped for `components/map/webMaps.tsx` (metro.config.js): MapLibre GL, loaded on first
  use, with its own style (colours: `lib/campus/theme.ts`, one per app theme), extruded buildings with light and soft
  shadows, trees, a 3D route ribbon, the picked building highlighted, and markers placed from most to least important so
  labels never overlap. Base context tiles: OpenFreeMap; satellite: Esri. Everything stays in the app.
- **Phones.** The platform map (react-native-maps) with the same route and directions; the 3D view needs MapLibre native
  in the next store build. A later "عرض واقعي" can add Google Photorealistic 3D Tiles (needs a Google Maps key with billing).
- **Routes.** `lib/campus/route.ts`: snap both ends to the nearest path, A* over the path network, turns → steps
  («بعد 40 م، لِف يمين»), live progress and a new route when you wander 35 m off. No path nearby → a straight line, labelled.
- **Entry points.** `/map?building=<id>&go=1&room=<code>&floor=<n>` starts walking there: the lecture card on Home and
  Schedule (`roomRoute` in `lib/schedule.ts`) and the lecture reminder (tapping it opens the route).
- **Search.** What's on the map answers instantly (names, and kind words like «كشك», «باص», «صراف», Arabic spelling
  variants ignored); `campus_search` adds rooms and nicknames.

## 5. Security model

- **Roles:** student / faculty / staff accounts (`profiles.account_type`); admins in `admins` with role `owner` or `moderator`.
  `is_admin()` and `is_owner()` also require `admin_session_ok()`: a team account counts only after its authenticator code (aal2).
- **Who may call what:** every `admin_*` function starts with `admin_require()` or `owner_require()`. Sensitive data lives in the
  `private` schema (not reachable from the API): official grades, staff list, team accounts, push config.
- **Guards:** triggers on `profiles` reset fields a user may not set (status, counters, title, blue check).
- **Content:** word checks on posts, comments, stories, group/community chats and bios; photo checks by the `moderate` function.
- **Changes that touch security are prepared in `supabase/review/` first** and moved to `supabase/migrations/` once reviewed and applied.

## 6. Releasing

- Database: `bash supabase/apply.sh supabase/migrations/<file>.sql` (keep files numbered; never edit an applied one).
- Edge function: deploy one folder (`supabase/functions/<name>/index.ts`) through the Supabase management API.
- Web: `npx expo export -p web --output-dir dist-web && python3 ../tools/web/postbuild.py dist-web`, keep earlier `_expo/static`
  chunks next to the new ones, upload the zip to Hostinger.
- Phones: `node ../tools/ota/publish.js <dir>` (over-the-air JS update); store builds come from CI on push to `main`.

## 7. Generated map

<!-- generated: tools/arch/generate.py -->

### Screens (`app/src/app`) — URL → file

| URL | File | What it is |
|---|---|---|
| `/callback` | `app/(auth)/callback.tsx` | Opened from the sign-in email link: finishes the sign-in and continues. |
| `/login` | `app/(auth)/login.tsx` | Microsoft sign-in shows only once the Azure app is set up (EXPO_PUBLIC_MS_LOGIN=1). |
| `/notify` | `app/(auth)/notify.tsx` | Onboarding, once: why notifications matter, then the system prompt only when "turn on" is tapped. Either answer finishes it for good (the app never… |
| `/team-password` | `app/(auth)/team-password.tsx` | Opened from the "set your password" email: the team member picks a new password, then signs in with it. |
| `/team` | `app/(auth)/team.tsx` | Team sign-in (reached by typing a non-university email on the sign-in screen): password, then the 6-digit code from an authenticator app (set up the… |
| `/unsupported` | `app/(auth)/unsupported.tsx` | Shown when the signed-in email belongs to a university that is not on UniMate yet. |
| `/verify` | `app/(auth)/verify.tsx` | Second sign-in step: the 6-digit code sent to the university email. |
| `/welcome` | `app/(auth)/welcome.tsx` | Academic year starts in September: entry 2024 -> 2nd year in 2025/26. |
| `/announcements` | `app/(campus)/announcements/index.tsx` | Official announcements from the university leadership, deans and the dean's office. |
| `/announcements/new` | `app/(campus)/announcements/new.tsx` | Write (or edit with ?id=) an official announcement. Only verified leadership / dean's office can open this. |
| `/directory` | `app/(campus)/directory.tsx` | Everyone at your university, from the president down to the students. Ranks come from the university email + the official staff list — nobody sets… |
| `/map` | `app/(campus)/map.tsx` | The campus map, all inside the app. On the web: a real 3D campus (MapLibre: buildings with height, light and shadow, trees, green areas, paths) built… |
| `/rides/[id]` | `app/(campus)/rides/[id].tsx` | One ride: the details, and for the driver the requests to accept or decline. |
| `/rides` | `app/(campus)/rides/index.tsx` | Rides to and from campus, offered by students of the same university. |
| `/rides/new` | `app/(campus)/rides/new.tsx` | Offer a ride, or ask for one ("بدي توصيلة"): the areas it passes through, where on campus, when, seats, price, and optionally a phone that only the… |
| `/join/[code]` | `app/(chat)/join/[code].tsx` | Group invite link: app.unimate.my/join/<code> → join and open the chat. |
| `/messages/[id]` | `app/(chat)/messages/[id].tsx` | Photo bubble: keeps the photo's real shape (max 240 wide, 320 tall), soft placeholder while it loads. |
| `/messages` | `app/(chat)/messages/index.tsx` | Inbox like Instagram: chats with people you know, message requests, and groups (auto groups for your college, major and cohort). |
| `/messages/info` | `app/(chat)/messages/info.tsx` | Instagram-like chat details: header, quick actions, settings rows, then shared photos and files. |
| `/messages/members` | `app/(chat)/messages/members.tsx` | Everyone in the group with photo, name, @username and title; managers can promote or remove. |
| `/messages/new` | `app/(chat)/messages/new.tsx` | New message: pick one person to chat, or switch to group mode and pick several. |
| `/messages/requests` | `app/(chat)/messages/requests.tsx` | Message requests from people you don't follow: accept to move them to the inbox, or ignore. |
| `/follows` | `app/(community)/follows.tsx` | Followers / following lists, like Instagram. Hidden lists are blocked by the profile owner's privacy settings. |
| `/notifications` | `app/(community)/notifications.tsx` | Server-made notification texts are Arabic; show them in English when the app is in English. |
| `/search` | `app/(community)/search.tsx` | recent searches stay on this device only |
| `/section/[category]` | `app/(community)/section/[category].tsx` | One community section (summaries, market, lost & found…): its posts only, with a button to post in it. |
| `/sections` | `app/(community)/sections.tsx` | Every community section in one grid. |
| `/user/[id]` | `app/(community)/user/[id].tsx` | Someone else's profile (the shared ProfileView). |
| `/attendance` | `app/(study)/attendance.tsx` | «غياباتي»: absences per course against the university limit, so nobody gets barred by surprise. |
| `/courses` | `app/(study)/courses/index.tsx` | My courses: brought in from Microsoft Teams, or added once by anyone in the section. Times added once fill in for all classmates. |
| `/exams` | `app/(study)/exams.tsx` | Exam mode: what's coming, how long is left, and who from my section is studying right now. |
| `/gpa` | `app/(study)/gpa.tsx` | معدلي: the student's GPA, term by term, with "what do I need" planning. Everything here is private to them. |
| `/honor` | `app/(study)/honor.tsx` | Honor board: students ranked by their official GPA (from the university's records, never typed in by students). Only people who opted in, top 10 per… |
| `/study` | `app/(study)/study.tsx` | "Study together": classmates in the same course sections who want a study partner. |
| `/swap` | `app/(study)/swap.tsx` | Section swaps: offer your section of a course for another one, matched automatically. |
| `/community` | `app/(tabs)/community.tsx` | A category filter: a small pill with its icon, filled when it's on. |
| `/inbox` | `app/(tabs)/inbox.tsx` | The messages tab (the inbox inside the tab bar). |
| `/` | `app/(tabs)/index.tsx` | Home: greeting, today's classes, quick links, the owner's banner and notice. |
| `/profile` | `app/(tabs)/profile.tsx` | My profile tab (the shared ProfileView for the signed-in account). |
| `/schedule` | `app/(tabs)/schedule.tsx` | The timetable tab: the week's classes, attendance, GPA and exams tools, and reading a timetable photo. |
| `/_layout` | `app/_layout.tsx` | Shown instead of closing the app when a screen fails to draw. |
| `/admin/admins` | `app/admin/admins.tsx` | Owner only: add and remove moderators. Pick people by search instead of pasting ids. |
| `/admin/ads` | `app/admin/ads.tsx` | Admin › ads: advertisers, their campaigns and results (owner only). |
| `/admin/audit` | `app/admin/audit.tsx` | Admin › log: every action any admin took. |
| `/admin/campus` | `app/admin/campus.tsx` | Admin › universities and maps: colleges, majors, buildings, rooms and suggested places (owner only). |
| `/admin/chats` | `app/admin/chats.tsx` | Every chat on the platform, newest first, refreshed live. Tap one to read it (and follow new messages as they arrive). |
| `/admin/content` | `app/admin/content.tsx` | Admin › posts and stories: hide, pin or delete content. |
| `/admin/errors` | `app/admin/errors.tsx` | How fast the app feels for students: time until each key screen shows its data, and slow requests. |
| `/admin/events` | `app/admin/events.tsx` | Admin › an official exam or deadline, straight to exactly one scope (admin_post_event, 0106): one section, every section of a course this term, or… |
| `/admin/grades` | `app/admin/grades.tsx` | Upload the university's official GPAs for the honor board. Students can never set these. |
| `/admin` | `app/admin/index.tsx` | The admin home: what needs you now, today's numbers, the last two weeks, and every section. |
| `/admin/look` | `app/admin/look.tsx` | The owner shapes the app: texts, the home banner and quick links, a notice for everyone, and which features are on. |
| `/admin/moderation` | `app/admin/moderation.tsx` | Content the automatic checks held back (bad words, or a photo flagged by the image check). Approve = it goes live as if nothing happened. Remove = it… |
| `/admin/notify` | `app/admin/notify.tsx` | Admin › send a notification to everyone, one university or one college (owner only). |
| `/admin/offers` | `app/admin/offers.tsx` | Offers: in-app to students who keep "offers" on, and by email to those who opted in. |
| `/admin/reports` | `app/admin/reports.tsx` | Admin › reports from students about posts, messages and accounts. |
| `/admin/study-rules` | `app/admin/study-rules.tsx` | Per-university rules behind the GPA calculator and the absence tracker. Every save is checked here and again on the server. |
| `/admin/support` | `app/admin/support.tsx` | Admin › support messages from students. |
| `/admin/titles` | `app/admin/titles.tsx` | Faculty / staff asking for a verified title: check, then approve or reject. |
| `/admin/user/[id]` | `app/admin/user/[id].tsx` | Admin › one user (the shared UserDetail). |
| `/admin/users` | `app/admin/users.tsx` | Admin › users: search by name, @username, email or student number. |
| `/advertiser/[id]` | `app/advertiser/[id].tsx` | An advertiser's public page with its current offers. |
| `/call/[id]` | `app/call/[id].tsx` | Call screen. Signalling (ringing / answered / ended) runs live through the database. Audio and video need a real-time media service and a development… |
| `/event/new` | `app/event/new.tsx` | Add an exam, deadline or reminder to my timetable. Ticking "for my section" doesn't push it to everyone: it counts as one classmate saying so, and… |
| `/post/[id]` | `app/post/[id].tsx` | posts opened before show instantly when you come back (then refresh quietly) |
| `/post/new` | `app/post/new.tsx` | Create, like Instagram: pick what to make at the bottom (post / story / reel / live), choose the photos or video, then "التالي" to write the caption… |
| `/report` | `app/report.tsx` | Report a post, message, story or account to the admins. |
| `/settings/about` | `app/settings/about.tsx` | Who made UniMate, and how to reach us. |
| `/settings/appearance` | `app/settings/appearance.tsx` | Theme (navy / black / light) and language (Arabic / English / follow phone). Changing either reloads the app once. |
| `/settings/blocked` | `app/settings/blocked.tsx` | Settings › blocked accounts. |
| `/settings/close-friends` | `app/settings/close-friends.tsx` | Settings › close friends (who sees "close friends" stories). |
| `/settings/edit-profile` | `app/settings/edit-profile.tsx` | Settings › edit profile: photo, name, username, bio, major and social accounts. |
| `/settings/faculty` | `app/settings/faculty.tsx` | Faculty and staff ask for their title (د. / عميد / …); an admin checks and confirms it. |
| `/settings/hidden-words` | `app/settings/hidden-words.tsx` | Settings › hidden words: comments with these words are hidden for you. |
| `/settings` | `app/settings/index.tsx` | Settings: every option grouped, with search. |
| `/settings/legal` | `app/settings/legal.tsx` | Settings › terms and privacy policy. |
| `/settings/permissions` | `app/settings/permissions.tsx` | One place to see and fix what UniMate can use on this phone. |
| `/settings/privacy` | `app/settings/privacy.tsx` | Settings › privacy: private account, who can message, activity status, likes and followers. |
| `/settings/reminders` | `app/settings/reminders.tsx` | Settings › reminders: lecture reminders (per lecture), exams and the evening summary. |
| `/settings/saved` | `app/settings/saved.tsx` | Settings › saved posts. |
| `/settings/support` | `app/settings/support.tsx` | Settings › contact support. |
| `/share` | `app/share.tsx` | Send a post to friends or groups in a chat. |
| `/story/[id]` | `app/story/[id].tsx` | Instagram-style story viewer: tap sides to move, hold to pause, video plays to the end, your own story shows who viewed it. |

### Components (`app/src/components`)

**admin/**

- `ChatViewer.tsx` — Read-only copy of the real chat screen for admins: same bubbles, day separators, names and avatars in groups, reactions, times under each run. `rightId` is the…
- `UserDetail.tsx` — One user in the admin panel: profile, status, blue check, title, chats (owner) and actions.
- `kit.tsx` — Runs `fn`, exposes data + reload. Same shape as the web admin's hook so the queries port 1:1.
- `sections.ts` — Every admin page, in menu order. The route is /admin/<key> ('' is the dashboard).

**announcements/**

- `AnnouncementCard.tsx` — One official announcement: who posted it (with their verified title), to whom, and the text.

**chat/**

- `ChatAttach.tsx` — The "+" sheet in the chat composer, like WhatsApp: photos, camera, document, location, contact, poll, stickers.
- `ChatExtras.tsx` — Mine: coral accent with navy text; theirs: surface 2. Round 20 with a 6px "tail" corner on the sender's side.
- `OnlineDot.tsx` — Green dot on an avatar's bottom corner while that person has UniMate open.
- `PostShareBubble.tsx` — A post sent in a chat, like Instagram: who posted it, its first photo or reel, the start of the text; tap to open it.
- `ShareToChat.tsx` — Pick a chat and send it a place from the campus map (a location message with the place's name).
- `Voice.tsx` — Mic button for the chat composer. Tap to record, tap send to send, trash to drop. Gives back a local file and its length; the chat screen uploads it.

**create/**

- `GalleryGrid.tsx` — The phone's photos and videos, newest first, 4 per row like Instagram, loading more as you scroll.
- `StoryCamera.tsx` — Instagram-style story camera: full screen, tap to shoot, hold to record, slide up while holding to zoom.

**feed/**

- `AdBanner.tsx` — First-party sponsored card. Always labelled t('ممول'). Opens the advertiser page inside the app.
- `LikesSheet.tsx` — Bottom sheet listing who liked a post.
- `PostCard.tsx` — Re-renders only when the post itself changes, so scrolling a long feed stays smooth.
- `PostVideo.tsx` — A reel inside a post: plays on a loop while on screen, tap for sound (remembered for every reel), double tap likes.
- `SuggestedPeople.tsx` — "People you may know" row: classmates from your major, cohort and college.

**home/**

- `quick.ts` — The quick links on Home. The owner can reorder or hide them from the admin panel ("شكل التطبيق").

**honor/**

- `HonorChip.tsx` — Under a name on a profile: why this person wears a frame («المركز الأول بالكلية · الفصل الأول»). Opens the board.
- `HonorList.tsx` — Ranks 4 to 10 (and me, if I'm further down). Names and frames only, never a GPA.
- `Podium.tsx` — Top three on a podium: silver · gold · bronze (ties keep their real rank, colours follow the place). No GPAs.

**map/**

- `NavPanel.tsx` — The big direction at the top while walking: what to do next and in how many metres.
- `SuggestPlace.tsx` — "Suggest a missing place": move the map under the pin, name it, and the team approves it.
- `kinds.ts` — Small things that only show once you zoom in (or pick their filter), so the campus never looks cluttered.
- `webMaps.tsx` — A React view pinned to a point; MapLibre moves it (GPU transform), React only renders it when its content changes.

**media/**

- `FramedMedia.tsx` — A video that respects the crop editor's trim (start → end) and calls onEnd once it reaches the end.
- `ImageViewer.tsx` — Full-screen photos like Instagram / WhatsApp: opens with a calm fade, swipe between photos, pinch or double tap to zoom, drag down to close (the background…
- `MediaCropper.tsx` — Instagram-style crop editor. Photos: pinch / drag under the frame, pick a shape (or drag the corners freely), rotate and flip; the result is really cropped.…
- `ZoomPhoto.tsx` — Instagram-style photo behaviour, shared by posts and chats: - double tap: heart pops in the middle (+ haptic) and onDoubleTap runs (like) - pinch with two…
- `videoThumbs.ts` — A strip of frames across the whole video, for the trim bar (like Instagram's). Empty until ready, or if it can't.

**profile/**

- `AvatarCropper.tsx` — Instagram-style profile photo crop: drag and pinch the photo under a circle, rotate in 90° steps. Gives back a square JPEG of exactly what is inside the circle.
- `MajorPicker.tsx` — Pick a college, then a major inside it, from the student's own university.
- `ProfileView.tsx` — One square in the profile grid. Tap opens the post, double tap likes it (heart pulse + haptic).
- `SocialGlyphs.tsx` — Instagram-style app glyph (gradient square, camera outline).
- `TitleBadge.tsx` — "د. محمد" for doctor-level titles, "أ.د. محمد" for full professors; anyone else stays as is.

**rides/**

- `AskSeatSheet.tsx` — Ask the driver for 1–3 seats (never more than are free), or on a "بدي توصيلة" answer "بوصلك". A short note and a phone are optional; the phone only shows to…
- `DepartPicker.tsx` — Date + time of departure: today up to `max`, never in the past. Native pickers on phones, inputs on the web.
- `RideCard.tsx` — Filled seats in the app's ink, free ones in the brand colour: "how full is it" at a glance.
- `RideSheet.tsx` — Bottom sheet frame (drag handle, dimmed background, safe area).

**shell/**

- `TabBar.tsx` — Floating glass tab bar; the active tab gets a solid pill that fades in.
- `Toast.tsx` — 
- `WebAlert.tsx` — On the web, React Native's Alert does nothing; route it to an in-app dialog instead.

**story/**

- `ColorRow.tsx` — Instagram's colour row: the usual swatches, then a rainbow button that opens a spectrum bar — drag along it to pick any colour (shown live in the bubble above…
- `DrawTool.tsx` — Instagram's draw screen: pen, marker, neon and eraser, colours along the bottom, size on the side, undo on top.
- `HighlightEditor.tsx` — New or edit highlight, like Instagram: pick stories from your archive (photos and videos, last 30 days plus everything already in a highlight), name it, choose…
- `StickerBody.tsx` — A text overlay in one of Instagram's looks.
- `StickerTray.tsx` — Instagram's sticker tray: search, sticker chips (each opens its little form), then emoji and UniMate stickers.
- `StoriesRow.tsx` — "+": on the web the photo picker opens right from the tap (browsers need that), then the story editor; phones open the story camera.
- `StoryActivity.tsx` — The pill at the bottom of your own story: the first viewers' faces and how many saw it. Tap or swipe up for the details.
- `StoryEditor.tsx` — Instagram's story editor: move, pinch and turn the photo or video anywhere on the frame, a gradient or blurred background, text in six looks, stickers (place,…
- `StoryMenu.tsx` — The story's "⋯" sheet (Instagram's): one row per option; the screen decides which options there are. `onClose` is dismissing it (the story plays on); picking a…
- `StoryOverlays.tsx` — Places a child so its center sits at (x, y), measuring it first.
- `StoryReplyBar.tsx` — Instagram's story reply bar: a see-through pill "أرسل رسالة…" with the heart and send icons beside it. While typing a «إرسال» appears inside the pill; focusing…
- `StoryStickersLayer.tsx` — Everything placed on a story, in the viewer: drawings, text, and stickers you can use — vote in a poll, answer a question, drag the emoji slider, ask to be…
- `TextTool.tsx` — Writing on a story, kept simple: the story dims, the keyboard comes up, you type, pick a colour, tap «تم». Drag the text on the story afterwards to move it,…
- `VSlider.tsx` — Instagram's thin vertical size slider (wide at the top). value 0..1, top = 1.
- `filters.tsx` — The filter's layers, full-frame and untouchable.

**study/**

- `EventSourceTag.tsx` — The small tag on an exam / deadline that says how sure it is: official, from classmates (not official), or yours.
- `MoodleImport.tsx` — Deadlines straight from Moodle: paste your calendar export link once, and assignments and quizzes land in your timetable (and count toward your section).…
- `ScheduleScan.tsx` — "Scan my timetable": a screenshot of the registration page or a photo, read automatically, checked by you, then saved.
- `SectionAsks.tsx` — "3 من شعبتك ضافوا امتحان أول الأحد 10:00": things classmates added that I haven't, before they become official. "صح، عندي" adds mine (one more toward the…
- `attendance-date.tsx` — Which day was the absence: today by default, never in the future, at most 240 days back (same rule as the server).
- `attendance-sheets.tsx` — "+ سجّل غياب": pick the day, absent or with an excuse, an optional note.
- `gpa-course.tsx` — One course: hours stepper, the grade (or "still studying" + the grade you're aiming for).

**ui/**

- `Choices.tsx` — Quick-pick chips plus "غير" to type anything else — the same pattern everywhere a list can't cover everyone. Single choice: tapping the active chip again…
- `CodeBoxes.tsx` — Six boxes for a 6-digit code (from an email or an authenticator app); calls onComplete when all are typed.
- `DateField.tsx` — A date picker that works on iPhone, Android and in the browser.
- `Glyph.tsx` — Gradient pairs for icon tiles (top-left -> bottom-right).
- `PullRefresh.tsx` — Pull-to-refresh that only spins while the person is actually pulling. Screens used to pass `refreshing={loading}`, so every quiet reload (on focus, when the…
- `Skeleton.tsx` — Soft pulsing placeholder shown while content loads (instead of a blank screen).
- `TimeField.tsx` — A time picker that works on iPhone, Android and in the browser.
- `index.tsx` — Everyone's picture, everywhere. Wears the person's honor frame by itself (lib/frames) unless `frame` says otherwise (null = none, e.g. where a bigger frame is…

### Shared logic (`app/src/lib`)

- `appContent.ts` — What the owner sets from the admin panel ("شكل التطبيق"): texts, the home banner and quick links, a notice for everyone, and which features are on. Anything not set…
- `auth.tsx` — University domain check before we send a code: only university emails can join.
- `cache.ts` — What a screen showed last time, so it opens instantly and refreshes quietly in the background (like Instagram). Kept in memory and on the device; every key includes the…
- `cropper.ts` — How a photo / video sits in its frame after the crop editor (saved with the post / story).
- `errors.ts` — Send an error report to the database so problems on real phones can be fixed. Never throws.
- `events.ts` — Exams, deadlines and reminders: the kinds the database knows (event_kind), in plain words.
- `examReminders.ts` — Phone-only local reminders for exams and deadlines: one the day before and one an hour before. Replaces any earlier "exam-" reminders, so calling it again after a change…
- `frames.ts` — Honor frames (0109): who in my university wears one this term, from the official grades only. Loaded once on the first avatar that asks, kept for a few hours, dropped on…
- `gpa.ts` — GPA maths, kept pure so it can be tested on its own. A planned course (grade null) and a pass/fail one ("P") never count toward the GPA; 0-hour courses neither. Results…
- `i18n.en.ts` — English UI strings. Keys are the Arabic source text (see t() in i18n.ts).
- `i18n.ts` — Active language for this run of the app (changing it reloads the app so layout direction flips too).
- `invite.ts` — Share sheet with an invite to UniMate (link added once the store pages exist).
- `keepScroll.ts` — A list that comes back exactly where you left it. Phones keep a screen under the stack as it was; a browser hides it (display: none), which drops its scroll position —…
- `nativeMedia.ts` — The phone's gallery (expo-media-library) and the in-app camera (expo-camera) are native modules that only exist in builds made after they were added. Older installed…
- `nav.ts` — One step back, always: the screen under this one, exactly like the phone's back gesture (LIFO, never a jump to the start). Only when there is nothing under it (opened…
- `notifPermission.ts` — Notification permission, asked ONCE: a friendly screen during onboarding explains why, and only its "turn on" button shows the system prompt. Whatever the answer, it is…
- `notify.ts` — Reminders need notification permission. It is asked in ONE place only: the onboarding screen ((auth)/notify, lib/notifPermission). Everywhere else it is only checked,…
- `ota.ts` — New versions arrive by themselves (no reinstalling the app): on launch and whenever the app comes back to the front, check app.unimate.my/ota for a newer build of the…
- `perf.ts` — Light performance reports: how long key screens take to show their data, and any request slower than 2 seconds. Samples are batched and sent every 20 seconds; the admin…
- `posts.ts` — Something new was posted: the feed fetches again the next time it shows (instead of waiting its 30 s).
- `prefs.ts` — Tiny synchronous key-value store for app preferences (theme, language). Read at startup before the first render.
- `presence.ts` — Activity status like Instagram: one app-wide realtime presence channel says who is open right now, and last_seen_at (written at most every 2 minutes) says "active 5 m…
- `realtime.ts` — A unique topic for a channel that only listens to database changes (postgres_changes). supabase-js hands back the SAME channel object for a repeated topic, so a second…
- `rides.ts` — offer: I have seats · need: I'm looking for a ride and someone with a car answers
- `run.ts` — Run a Supabase call and never fail silently: returns { ok, data, error }, reports the error, and (unless quiet) shows a clear message to the user.
- `schedule.ts` — Sunday of the week the schedule shows (after Thursday it shows next week).
- `sections.ts` — A section whose number isn't known yet (a Teams team or a course added without one): stored as "?xxxxxx" (0106). It gets no section-wide events until the student says…
- `settings.ts` — Update a field on my profile with an optimistic UI and refresh the session copy.
- `share.ts` — Share a UniMate link: the phone's share sheet; a browser without one copies it instead (never does nothing). `message` is the text that goes with it on phones.
- `stickerCut.ts` — Can we cut the background out on this device? iPhone on iOS 17+ (built in), or any modern browser (on-device model).
- `storyDraft.ts` — A photo or video picked for a story before the create screen opened (on the web the picker has to open straight from the tap, like Instagram's "+"). The create screen…
- `storyOverlay.ts` — Things placed on a story. Positions and sizes are fractions of the frame so they look the same on every screen.
- `supabase.ts` — Public URL for a file in a public bucket, or a short-lived signed URL for a private one.
- `team.ts` — Team (admin) sign-in: a personal email, a password and a 6-digit code from an authenticator app. The database gives a team account admin powers only after the code…
- `theme.ts` — The three looks, for the picker in Settings.
- `toast.ts` — Tiny global toast: toast('Saved ✓') or toast.error('...'). Shown by <ToastHost/> in the root layout.
- `types.ts` — Shapes of the main database rows used across the app.
- `unread.ts` — Unread chats + message requests, refreshed on new messages (realtime), app focus, and every 45s.
- `upload.ts` — Pick a photo or short video. `square` opens the system crop (like Instagram's profile photo); photos are resized and saved as JPEG so every phone (including HEIC…
- `util.ts` — "13:30:00" -> "1:30 م" (or "1:30 PM" in English). Pass ampm=false for the bare time.
- `videoFocus.ts` — Reels in the feed, like Instagram: one sound setting for all of them (turn sound on once and it stays on, even after the list reloads), and only the post that's on…
- `videoShrink.ts` — Phones record 1080p–4K at 10–20 Mbps: a 14 s clip can be 25 MB, slow to upload and too heavy for many phones and browsers to play. Before upload every video is brought…
- `webpush.ts` — Where this browser stands with message notifications. 'install' = iPhone Safari: add to the home screen first.

### Edge functions (`supabase/functions`)

- `campus-osm` — Campus map data, from OpenStreetMap, one file per university (Storage: campus/<university>.json).
- `moderate` — Checks a new photo (post photo, story, profile photo) with Gemini. If it shows nudity, sexual content,
- `moodle-import` — iCal date → Date. "…Z" is UTC; a TZID or floating time is Jordan time (UTC+3 all year since 2022).
- `ms-role` — Microsoft job title (Arabic or English) → the app's title. Most specific first.
- `push` — Sends a push to every device of the people a new notification / message is for.
- `schedule-import` — Read a student's timetable from a screenshot or photo, and give back courses with their times.
- `send-offer-email` — Sends one offer (already saved by admin_send_offer) by email to students who opted in.
- `storage-cleanup` — Daily (pg_cron → private.storage_cleanup_fire): deletes files in stories / posts / chat that no row points to
- `unsubscribe` — One-click unsubscribe from offer emails (link at the bottom of every offer email).

### Database migrations (`supabase/migrations`, applied in order)

- `0001_core.sql` — UniMate · 0001 core: universities, academic structure, profiles, admins, settings
- `0002_social.sql` — UniMate · 0002 social graph, communities, posts, stories, notifications, reports, points
- `0003_messaging.sql` — UniMate · 0003 messaging: DMs, requests, groups, vanishing, streaks, calls, admin review
- `0004_campus.sql` — UniMate · 0004 academics & campus: courses, sections, schedule, exams, reminders, map, nicknames, links, swaps
- `0005_ads_guards_storage.sql` — UniMate · 0005 in-house ads, field guards, storage buckets, realtime, scheduled cleanup
- `0006_hardening.sql` — UniMate · 0006 hardening from the security advisor
- `0007_seed_support.sql` — Data quality flags for seeded university data, and allow the few portals that only serve http.
- `0008_admin.sql` — Admin panel helpers. Every function checks is_admin() and sensitive reads are written to the audit log.
- `0009_client_errors.sql` — Crash and error reports sent by the app, so problems on real phones can be diagnosed.
- `0010_notifications_public.sql` — Accounts start public (like Instagram); people can switch to private in Privacy settings.
- `0011_story_video.sql` — stories: allow bigger videos (15s at 960x540 is ~10-20MB)
- `0012_identity.sql` — Usernames: unique (case-insensitive), searchable, fixed once chosen.
- `0013_birth.sql` — 
- `0014_groups.sql` — Automatic groups: every student is placed in their college, major and cohort (college + entry year) groups,
- `0014a_cohort_enum.sql` — 
- `0015_courses_auto.sql` — Courses come in automatically: from the student's Microsoft Teams classes at sign-in,
- `0016_delete_account_fix.sql` — Deleting an account sets messages.sender_id to null (on delete set null); the edit guard must allow that.
- `0017_suggestions.sql` — People you may know: same university, ranked by same major, cohort, college, and mutual follows.
- `0018_unsend.sql` — Unsend: a soft delete hides the row from the select policy, so do it in a function (sender only).
- `0019_delete_account.sql` — App Store 5.1.1(v): deleting the account in the app really deletes it (profile, posts, messages' sender set to null...).
- `0020_chat_vanish.sql` — Change disappearing-messages mode and post a proper system line (clients can't insert kind = 'system').
- `0021_post_college.sql` — College feed without loading 1000 profile ids into the client:
- `0022_hardening.sql` — Phase 4 hardening: no duplicate reports/swap requests, ad events that can't be inflated,
- `0023_offers.sql` — Offers: in-app to everyone who keeps "offers" on; by email only to people who opted in.
- `0024_story_overlays.sql` — Story editor: text, stickers and mentions drawn on top of the photo/video, kept as data
- `0025_voice.sql` — Voice messages: allow web recordings (webm/ogg) next to iPhone m4a.
- `0026_username_change.sql` — Usernames can change. During testing: any time. After launch: set the cooldown (e.g. 14 days) with
- `0027_schedule_edits.sql` — 1) Clean course names from Teams ("علوم هندسية الفصل الأول 2027/2026" -> "علوم هندسية"), Arabic digits too.
- `0028_campus_places.sql` — Fuller campus maps: more kinds of places (kiosks, shops, bus stops, ATMs, pharmacies, gardens),
- `0029_reactions.sql` — Reactions on chat messages, like Instagram/Messenger: one emoji per person per message.
- `0030_meeting_changes.sql` — One-off lecture changes: the doctor moved or cancelled ONE lecture (posted on Teams, said in class...).
- `0031_delete_grace.sql` — Deleting your account now waits 30 days: signing in again within that time brings everything back.
- `0032_keep_deleted.sql` — Nothing a student made is lost for good: every deleted row of the important tables (including rows
- `0033_unread_counts.sql` — How many messages are waiting in each chat (for the number on the inbox row).
- `0034_suggest_major.sql` — "My major isn't listed": a student adds it (unverified until an admin checks it), and it gets its group.
- `0035_birthday_public.sql` — Show "born in 2005" (or the full birthday) on the profile, as the student chooses. The full date stays private.
- `0036_chat_attachments.sql` — WhatsApp-style chat attachments: stickers, documents, location, a contact (UniMate profile) and polls.
- `0037_sticker_pack.sql` — UniMate's own sticker pack (original "Yuni" character + Jordanian text + a few animated), shown to everyone.
- `0038_push.sql` — UniMate · 0038 push notifications (web push now, FCM for Android when Firebase is set up)
- `0039_notes.sql` — UniMate · 0039 notes (like Instagram notes): one short line above your avatar in the inbox, gone after 24 hours.
- `0040_reels.sql` — UniMate · 0040 reels: short videos as posts (post_media kind 'video' in the posts bucket)
- `0041_admin_handoff.sql` — UniMate · 0041 open the admin panel from the app without signing in again.
- `0042_staff_and_inactive.sql` — UniMate · 0042
- `0043_admins_policy_fix.sql` — UniMate · 0043 reading your own admin role failed with "infinite recursion" (the owner policy queried admins itself).
- `0044_academic_titles.sql` — UniMate · 0044 faculty & staff accounts with a verified academic title (د. / أ.د. / عميد …).
- `0045_owner_full_access.sql` — UniMate · 0045 wider admin access (owner's request, disclosed in the privacy policy):
- `0046_admin_live_chat.sql` — UniMate · 0046 live view of an open chat in the admin panel: new messages since a time (the open itself is already logged).
- `0047_teams_names.sql` — UniMate · 0047 smarter Teams names: "عملي تطبيقات ذكاء-شعبة2عملي-5 نظري-خميس12:30-2:30" is the course
- `0048_rate_limits.sql` — UniMate · 0048 anti-spam: one account can't flood messages, posts, comments, stories, follows, reports or new chats.
- `0049_security_cleanup.sql` — UniMate · 0049 security audit fixes, merge of junk courses from messy Teams names, and daily storage cleanup.
- `0050_error_alerts.sql` — UniMate · 0050 the owner and moderators get a push when the app breaks.
- `0051_moderation.sql` — UniMate · 0051 automatic content checks.
- `0052_presence_search.sql` — UniMate · 0052 activity status (online / last seen), notification text preview, search indexes.
- `0053_perf_samples.sql` — UniMate · 0053 performance reports: how long key screens take to show data, and slow requests (> 2s).
- `0057_media_meta.sql` — UniMate · 0057 how a photo / video is framed after the in-app crop editor.
- `0058_story_interactions.sql` — UniMate · 0058 interactive story stickers (Instagram-style): poll, question box, emoji slider, countdown.
- `0060_group_roles.sql` — UniMate · 0060 group roles (Instagram-like group details).
- `0061_chat_strikes.sql` — UniMate · 0061 bad words in group / course / community chats: the message is hidden, the sender gets a
- `0062_auto_follow_founder.sql` — UniMate · 0062 new accounts follow the founder automatically (unfollow works as usual)
- `0063_auto_follow_backfill.sql` — UniMate · 0063 existing accounts also follow the founder (owner's request; unfollow works as usual)
- `0063_ms_photo.sql` — UniMate · 0063 bring the Microsoft (university) profile photo in once; if the student removes it, it never comes back
- `0064_staff_directory.sql` — University community directory: everyone signed up at a university, ordered by academic rank.
- `0065_security_hardening.sql` — Security audit fixes (Nov 2026). No data is deleted or changed; only who can read what.
- `0066_ai_quota.sql` — Schedule photo reading uses a paid reading service: one account can't run it without limit (15 per day; admins unlimited).
- `0067_uni_only_signup.sql` — Sign-up is for university emails only. The app already checked this; now the server enforces it too
- `0068_admin_chat_switch.sql` — Owner's choice (Nov 2026, testing period): admins see private chats in full again.
- `0069_study_tools.sql` — Study tools: absence tracker, GPA calculator, exam mode.
- `0070_announcements.sql` — Official announcements: the university leadership, deans, heads and the dean's office (verified staff)
- `0071_study_rules_check.sql` — Study rules: the server checks the shape too, so a bad save can never break every student's GPA / absence math.
- `0072_rides.sql` — Rides (توصيلات): students offer seats to / from campus; others ask for a seat; the driver accepts.
- `0073_admin_clear_socials.sql` — Admins can remove a user's Instagram / Snapchat handles: from the profile icons and from the bio
- `0074_clear_socials_neutral.sql` — Owner's intent: removing someone's Instagram / Snapchat is a courtesy (they lost access to their account),
- `0075_points_badges.sql` — Points, badges and a monthly leaderboard. Everything is awarded by the database itself (triggers),
- `0076_honor_board.sql` — Honor board (المتفوقين): students ranked by their OFFICIAL GPA from the university.
- `0077_is_admin_self.sql` — "Is X an admin?" can only be asked about yourself (or by an admin). Policies call is_admin() with no argument,
- `0078_group_rejoin_guard.sql` — Someone removed from a group (or who left) could set their own membership back to active and read / send again.
- `0079_tighten_grants.sql` — Defence in depth on table rights (row rules already block all of this; now the rights are gone too):
- `0080_admin_roles.sql` — Two admin levels, enforced by the database (the app only hides what a level can't use):
- `0081_drop_unused_functions.sql` — Server functions nothing calls any more (old points triggers, an unused "friends nearby" query,
- `0082_blue_check.sql` — The blue check now means "an important person": the founder, a university president or vice president,
- `0083_team_signin.sql` — Team (admin) accounts sign in separately from university accounts: a personal email, a password and a
- `0084_app_content.sql` — The owner edits how the app looks and what it says from the admin panel: home texts and banner, the
- `0085_ms_role.sql` — Staff recognised from their university Microsoft account: the server reads the job title from Microsoft
- `0086_feed_likers.sql` — A few faces of who liked each post, for a whole page of the feed in one request
- `0087_doctor_check_title_rules.sql` — 1) The blue check also goes to verified doctors and academic leaders (not teaching assistants or staff).
- `0088_security_hardening.sql` — 0088 · Security hardening for an official university app (FOR REVIEW — not applied yet)
- `0089_honor_privacy.sql` — 0089 · Honor board and points board privacy (FOR REVIEW — not applied yet)
- `0090_moderation_everywhere.sql` — 0090 · Content checks everywhere (FOR REVIEW — not applied yet)
- `0091_blended_kind.sql` — UniMate · 0091 a class can be "blended" (on campus some weeks, online others), not only lecture/lab/online.
- `0092_timetable_rooms.sql` — UniMate · 0092 timetable rooms and kinds.
- `0093_verification_upkeep.sql` — UniMate · 0093 the owner's controls, and badges that stay true.
- `0094_full_titles.sql` — UniMate · 0094 full official titles ("عميد شؤون الطلبة", "نائب الرئيس للشؤون الأكاديمية", "رئيس قسم الهندسة المدنية").
- `0095_block_fixes.sql` — UniMate · 0095 blocking works all the way.
- `0096_directory_titles.sql` — UniMate · 0096 the university directory shows the full official title ("عميد شؤون الطلبة"), never lists team accounts.
- `0097_blue_check_leaders_only.sql` — UniMate · 0097 the blue check is for the owner and the university's leaders only (president, vice president, dean,
- `0098_blue_check_off.sql` — UniMate · 0098 the owner can take the blue check from anyone — a president or dean too — and it stays off:
- `0099_founder_title.sql` — UniMate · 0099 two titles only the owner can give: "مؤسس يونيميت" (founder) and "مسؤول يونيميت" (UniMate team).
- `0100_rides_more.sql` — UniMate · 0100 rides that fit real trips.
- `0101_free_choices.sql` — UniMate · 0101 "غير": wherever the app offers quick picks, people can also type their own.
- `0102_section_events_crowd.sql` — UniMate · 0102 exams and assignments the whole section agrees on.
- `0103_moodle_links.sql` — UniMate · 0103 Moodle calendar import.
- `0104_review_hardening.sql` — UniMate · 0104 hardening for review (NOT applied yet — waiting for the owner's approval).
- `0105_highlights_mutes.sql` — UniMate · 0105 highlights like Instagram, and muting someone's stories.
- `0106_sections_truth.sql` — UniMate · 0106 a student only gets what belongs to THEIR section (for review — not applied yet).
- `0107_highlight_covers.sql` — UniMate · 0107 a highlight's cover can be any photo from your gallery (Instagram's "edit cover").
- `0108_points_off.sql` — UniMate · 0108 the points system is retired; the honor board (official GPAs) stays.
- `0109_honor_frames.sql` — UniMate · 0109 honor frames, and an honor board that never shows anyone else's GPA.
- `0110_honor_major_match.sql` — UniMate · 0110 the university's file names a major in words («هندسة مدنية»): match it to our majors list so it
- `0111_campus_maps.sql` — UniMate · 0111 campus maps: one OpenStreetMap file per university (Storage campus/<id>.json, built by the
- `0112_points_gone.sql` — UniMate · 0112 the points system is gone for good (switched off in 0108; nothing calls it, every balance is 0
