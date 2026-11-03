# Voice and video calls

What exists now:
- The `calls` table (voice / video, status ringing → active → ended / missed / declined, room_name) with RLS so only conversation members see a call.
- `app/src/app/call/[id].tsx`: the ringing / in-call screen and the signalling through realtime on the `calls` table.

What is still needed for real audio and video:
1. A media server. Recommended: **LiveKit Cloud** (free tier), or self-hosted LiveKit later.
2. A Supabase Edge Function `call-token` that checks the caller is a member of the conversation and returns a LiveKit access token for `room_name`.
3. `@livekit/react-native` + `@livekit/react-native-webrtc` in the app. These are native modules, so calls work in a **development build** (`eas build --profile development`), not in Expo Go.
4. Push notifications (Firebase / APNs) so an incoming call rings when the app is closed.

Cost note: video uses many more minutes than voice. Start with voice, then turn on video.
