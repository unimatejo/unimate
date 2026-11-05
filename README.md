# UniMate · يونيميت

Student community app for Jordanian universities: schedule, study tools, campus map, community, private messaging.

## Layout

| Folder | What it is |
| --- | --- |
| `app/` | The app (Expo / React Native): Android, iPhone and the web app at app.unimate.my |
| `app/src/app/` | Screens. Every file is a page; the folder path is its URL. Folders in brackets only group pages and don't change the URL |
| `app/src/components/` | Building blocks, one folder per feature (chat, feed, story, profile, study, rides, honor, admin…); `ui/` holds the shared basics |
| `app/src/lib/` | Logic without screens: sign-in, database client, translations, schedule, uploads |
| `supabase/migrations/` | Database tables, security rules and server functions, applied in order |
| `supabase/functions/` | Server functions (push notifications, photo checks, timetable reading…) |
| `supabase/tests/` | Security checks |
| `supabase/seed/`, `supabase/data/` | University, college, major and campus data |
| `site/` | The public site unimate.my |
| `tools/` | Build and publish scripts |

## Screen groups (`app/src/app/`)

- `(tabs)` – the five main tabs · `(auth)` – sign-in and first setup
- `(study)` – absences, GPA, exams, honor board, study partners, section swaps, courses
- `(campus)` – map, staff directory, rides, announcements
- `(community)` – sections, search, people, notifications, points leaderboard, profiles
- `(chat)` – messages and group invites
- `admin/`, `settings/`, `post/`, `story/`, `event/`, `call/`, `report`, `share`

## Checks

```bash
cd app
npm run check      # types, lint, unused code
```

## Admin levels

- **Owner**: everything.
- **Moderator**: reports, content checks, suspending accounts, professor titles, support. Sees only reported chats.

The database enforces these rules (`supabase/migrations/0080_admin_roles.sql`); the app only hides what a level can't use.

Secrets are never committed. See `.env.example` files.
