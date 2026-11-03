# Steps that need the owner (logins / accounts)

1. **Email service (Resend, free tier).** Needed so sign-in emails show the 6-digit code in Arabic and are not limited to 2 per hour. After signing up: add SMTP in Supabase → Auth → SMTP, then apply `supabase/email/otp.html` as the Magic Link and Confirm signup templates.
2. **Microsoft sign-in (Azure / Entra ID app registration).** Lets students sign in with their university Microsoft account and pulls name, photo and email. Redirect URL: `https://<project>.supabase.co/auth/v1/callback`. Put the client id/secret in Supabase → Auth → Providers → Azure. Reading timetables from Teams needs each university's IT to approve the app (admin consent).
3. **First owner admin.** Sign up once in the app, open the admin panel, copy the account id from the "not an admin" screen, then run: `insert into admins (user_id, role) values ('<id>', 'owner');`
4. **GitHub push.** Add a local folder named `unimate` in the desktop app (or add the repo to the session), then the code is pushed to `unimatejo/unimate`.
5. **Hosting the admin panel.** Cloudflare Pages (free): root `admin`, build command `npm run build`, output `dist`, env vars `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
6. **App builds.** Expo account + EAS: `eas build -p android` / `-p ios`. Apple Developer $99/year for the App Store, Google Play $25 once.
7. **Push notifications.** Firebase project (Android) + APNs key (iOS) uploaded to Expo.
8. **University data review.** Every university is marked "draft" in the panel; JUST still needs its colleges and majors.
