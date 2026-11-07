import { IBMPlexSansArabic_400Regular, IBMPlexSansArabic_500Medium, IBMPlexSansArabic_600SemiBold, IBMPlexSansArabic_700Bold } from '@expo-google-fonts/ibm-plex-sans-arabic';
import { useFonts } from 'expo-font';
import { Stack, router, useSegments, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastHost } from '@/components/shell/Toast';
import { ZoomHost } from '@/components/media/ZoomPhoto';
import { WebAlertHost } from '@/components/shell/WebAlert';
import { MediaCropperHost } from '@/components/media/MediaCropper';
import { useOtaUpdates } from '@/lib/ota';
import { useWebPush } from '@/lib/webpush';
import { AuthProvider, useAuth } from '@/lib/auth';
import { useTeamStatus } from '@/lib/team';
import { useNotifIntroDue } from '@/lib/notifPermission';
import { checkCrashMarks } from '@/lib/crashMark';
import { installGlobalErrorHandler, reportError, setScreen } from '@/lib/errors';
import { isAR, syncDirection, t } from '@/lib/i18n';
import { C, F, isDark } from '@/lib/theme';

SplashScreen.preventAutoHideAsync();
installGlobalErrorHandler();
checkCrashMarks();

/** Shown instead of closing the app when a screen fails to draw. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  // a new version went live while this page was open: its old code files are gone, so load the new version
  // (once per version: the mark holds the page's own build, so the next deploy can reload again)
  const stale = typeof window !== 'undefined' && /Loading module|Failed to fetch dynamically imported module|ChunkLoadError|Importing a module script failed/i.test(error.message);
  useEffect(() => {
    if (stale) {
      try {
        const build = (document.querySelector('script[src*="/entry-"]') as HTMLScriptElement | null)?.src ?? 'x';
        if (sessionStorage.getItem('chunk_reload') !== build) { sessionStorage.setItem('chunk_reload', build); window.location.replace(`${window.location.pathname}?v=${Date.now().toString(36)}`); return; }
      } catch { /* no storage */ }
    }
    reportError(error, true);
  }, [error, stale]);
  // the technical details go to the team's error log only; the student sees a plain message
  return (
    <View style={{ flex: 1, backgroundColor: C.bg, padding: 24, paddingTop: 110, gap: 14, alignItems: 'center' }}>
      <Text style={{ fontSize: 44 }}>🛠️</Text>
      <Text style={{ fontSize: 22, fontWeight: '700', color: C.ink, textAlign: 'center' }}>{stale ? t('في نسخة جديدة من يونيميت') : t('في إشي ما زبط هون')}</Text>
      <Text style={{ fontSize: 15, color: C.muted, textAlign: 'center', maxWidth: 320 }}>{stale ? t('اكبس «حدّث» عشان تفتح النسخة الجديدة.') : t('جرّب كمان مرة. إذا ضلت، فريق يونيميت وصله خبر وعم يشتغل عليها.')}</Text>
      <Text onPress={() => { if (stale && typeof window !== 'undefined') window.location.replace(`${window.location.pathname}?v=${Date.now().toString(36)}`); else retry(); }}
        style={{ alignSelf: 'stretch', fontSize: 16, fontWeight: '700', color: C.onPrimary, backgroundColor: C.primary, textAlign: 'center', paddingVertical: 14, borderRadius: 16, overflow: 'hidden', marginTop: 8 }}>{stale ? t('حدّث') : t('جرّب كمان مرة')}</Text>
      <Text onPress={() => { retry(); router.replace('/(tabs)'); }} style={{ fontSize: 15, color: C.primary, textAlign: 'center', paddingVertical: 10 }}>{t('ارجع للرئيسية')}</Text>
    </View>
  );
}

// Arabic first: make the whole layout right-to-left (needs one reload the first time in Expo Go)
syncDirection();

const AUTH_FREE = ['login', 'verify', 'callback', 'team', 'team-password'];
const TEAM_STEPS = ['team', 'team-password'];

function Gate() {
  const { session, profile, loading, profileError, refreshProfile, signOut } = useAuth();
  const [retrying, setRetrying] = useState(false);
  const seg = useSegments() as string[];
  useWebPush(session?.user.id);
  const team = useTeamStatus(session);
  // the one-time notifications screen, right after the first setup (never again once answered)
  const notifDue = useNotifIntroDue(!!profile?.onboarded);
  useEffect(() => { setScreen(seg.join('/')); }, [seg]);

  // the splash stays until we know who is signed in
  useEffect(() => { if (!loading) SplashScreen.hideAsync().catch(() => {}); }, [loading]);

  useEffect(() => {
    if (loading) return;
    const inAuth = seg[0] === '(auth)';
    // signed out (also after "use another email" on the unsupported screen)
    if (!session) { if (!inAuth || !AUTH_FREE.includes(seg[1])) router.replace('/(auth)/login'); return; }
    // the team sign-in screens lead on their own (password, then the authenticator code)
    if (inAuth && TEAM_STEPS.includes(seg[1])) return;
    // a team account only ever sees the admin panel, and only after its code
    if (team?.team) {
      if (team.aal !== 'aal2') router.replace('/(auth)/team');
      else if (seg[0] !== 'admin') router.replace('/admin');
      return;
    }
    if (session && !team) return; // still checking what kind of account this is
    if (!profile) return; // still loading or failed: the overlay below handles it
    if (!profile.university_id) { if (seg[1] !== 'unsupported') router.replace('/(auth)/unsupported'); return; }
    // the one-time setup decides on onboarding only
    if (!profile.onboarded) { if (seg[1] !== 'welcome') router.replace('/(auth)/welcome'); return; }
    if (notifDue === null) return;
    if (notifDue) { if (seg[1] !== 'notify') router.replace('/(auth)/notify'); return; }
    if (inAuth) router.replace('/(tabs)');
  }, [session, profile, loading, seg, team, notifDue]);

  // signed in but the profile couldn't load: never leave the user stuck on a blank screen
  const blocked = !loading && !!session && !profile;
  useEffect(() => {
    if (!blocked || profileError) return;
    // a brand-new account: its profile row is created a moment after sign-in
    const tm = setTimeout(() => { refreshProfile(); }, 1500);
    // still no profile after that: the account no longer exists, go back to sign in
    const out = setTimeout(() => { signOut(); }, 8000);
    return () => { clearTimeout(tm); clearTimeout(out); };
  }, [blocked, profileError, refreshProfile, signOut]);

  return (
    <>
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg }, animation: isAR ? 'slide_from_left' : 'slide_from_right', animationDuration: 240 }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
      <Stack.Screen name="post/new" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="story/[id]" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
      <Stack.Screen name="report" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="share" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="event/new" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="call/[id]" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
    </Stack>
    {blocked && (
      <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 14 }}>
        {profileError ? (
          <>
            <Text style={{ fontFamily: F.title, fontSize: 20, color: C.ink, textAlign: 'center' }}>{t('ما قدرنا نحمّل حسابك')}</Text>
            <Text style={{ fontFamily: F.body, fontSize: 15, color: C.muted, textAlign: 'center' }}>{t('تأكد من الإنترنت وجرّب كمان مرة.')}</Text>
            <Pressable onPress={async () => { setRetrying(true); await refreshProfile(); setRetrying(false); }} disabled={retrying}
              style={{ minHeight: 50, paddingHorizontal: 28, borderRadius: 16, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }}>
              {retrying ? <ActivityIndicator color={C.onPrimary} /> : <Text style={{ fontFamily: F.bodyBold, fontSize: 16, color: C.onPrimary }}>{t('جرّب كمان مرة')}</Text>}
            </Pressable>
            <Pressable onPress={signOut} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ fontFamily: F.bodyMd, color: C.primary }}>{t('تسجيل الخروج')}</Text></Pressable>
          </>
        ) : <ActivityIndicator color={C.primary} size="large" />}
      </View>
    )}
    </>
  );
}

export default function RootLayout() {
  useOtaUpdates();
  // loaded fine: a later stale-code error may reload again
  useEffect(() => { try { if (typeof sessionStorage !== 'undefined') setTimeout(() => sessionStorage.removeItem('chunk_reload'), 10000); } catch { /* no storage */ } }, []);
  const [fontsLoaded, fontError] = useFonts({
    IBMPlexSansArabic_400Regular, IBMPlexSansArabic_500Medium, IBMPlexSansArabic_600SemiBold, IBMPlexSansArabic_700Bold,
  });

  // a font that fails to load must not keep the app on the splash forever
  const loaded = fontsLoaded || !!fontError;
  if (!loaded) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: C.bg }}>
      <SafeAreaProvider>
        <AuthProvider>
          <StatusBar style={isDark ? 'light' : 'dark'} />
          <Gate />
          <ZoomHost />
          <ToastHost />
          <WebAlertHost />
          <MediaCropperHost />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
