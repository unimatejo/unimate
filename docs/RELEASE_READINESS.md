# Release readiness — ground truth

- **Launch app:** `github.com/unimatejo/unimate`, folder `app/` (Expo SDK 58, React Native; web build at app.unimate.my).
- **Launch database:** Supabase project `unimate`, ref `slkfyblvpewlxrifzrhg` (eu-central-1, Pro plan, Micro compute).
- **Schema source of truth:** `supabase/migrations/` (0001 onwards, applied in order). Production's migration history
  only lists the newest one because earlier ones were applied as plain SQL: record them with
  `supabase migration repair --status applied <versions>` before the first CLI-driven deploy.
- **Not the launch app:** the older prototype projects `igkvlvaafthbzvbndjzx` / `kwbzwdmqzhwnyjwdsjby` (not on this
  account) and the `unimate-v2` Vite folder on the owner's PC. Archive them.
- **Environments:** production only. Staging = a Supabase branch created for a test and deleted after.
- Full audit: `docs/SCALE_AUDIT_REPORT.md`.
