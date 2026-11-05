# Steps that need the owner (logins / accounts)

1. **Email service (Resend, free tier).** Needed so sign-in emails show the 6-digit code in Arabic and are not limited to 2 per hour. After signing up: add SMTP in Supabase → Auth → SMTP, then apply `supabase/email/otp.html` as the Magic Link and Confirm signup templates.
2. **Microsoft sign-in (Azure / Entra ID app registration).** Lets students sign in with their university Microsoft account and pulls name, photo and email. Redirect URL: `https://<project>.supabase.co/auth/v1/callback`. Put the client id/secret in Supabase → Auth → Providers → Azure. Reading timetables from Teams needs each university's IT to approve the app (admin consent).
3. **First owner admin.** Sign up once in the app, then run: `insert into admins (user_id, role) values ('<id>', 'owner');`. After that the owner adds other admins from the app: Settings → Admin panel → Admins.
4. **Admin levels.** `owner` has everything. `moderator` handles reports, content checks, suspending accounts, professor titles and support; only sees chats that were reported. The rules are enforced by the database (`supabase/migrations/0080_admin_roles.sql`).
5. **App builds.** Pushing to `main` builds the Android APK and the iOS app on GitHub Actions (`.github/workflows`). Apple Developer $99/year for the App Store, Google Play $25 once.
6. **Push notifications.** Firebase project (Android) + APNs key (iOS).
7. **University data review.** Every university is marked "draft" in the admin panel; JUST still needs its colleges and majors.
