import { IBMPlexSansArabic_400Regular, IBMPlexSansArabic_500Medium, IBMPlexSansArabic_600SemiBold, IBMPlexSansArabic_700Bold } from '@expo-google-fonts/ibm-plex-sans-arabic';
import { useFonts } from 'expo-font';
import { Stack, router, useSegments, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastHost } from '@/components/Toast';
import { WebAlertHost } from '@/components/WebAlert';
import { useOtaUpdates } from '@/lib/ota';
import { useWebPush } from '@/lib/webpush';
import { AuthProvider, useAuth } from '@/lib/auth';
import { installGlobalErrorHandler, reportError, setScreen } from '@/lib/errors';
import { runQaLaunchArgs } from '@/lib/qa';
import { isAR, syncDirection, t, ta } from '@/lib/i18n';
import { C, F, isDark } from '@/lib/theme';

SplashScreen.preventAutoHideAsync();
installGlobalErrorHandler();

/** Shown instead of closing the app when a screen fails to draw. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  // a new version went live while this page was open: its old code files are gone, so load the new version once
  const stale = typeof window !== 'undefined' && /Loading module|Failed to fetch dynamically imported module|ChunkLoadError/i.test(error.message);
  useEffect(() => {
    if (stale) {
      try { if (sessionStorage.getItem('chunk_reload') !== '1') { sessionStorage.setItem('chunk_reload', '1'); window.location.reload(); return; } } catch { /* no storage */ }
    }
    reportError(error, true);
  }, [error, stale]);
  return (
    <View style={{ flex: 1, backgroundColor: C.bg, padding: 24, paddingTop: 90, gap: 14 }}>
      <Text style={{ fontSize: 22, fontWeight: '700', color: C.ink, textAlign: ta }}>{t('صار خطأ بهالصفحة')}</Text>
      <Text style={{ fontSize: 15, color: C.muted, textAlign: ta }}>{t('انبعت تقرير لفريق يونيميت تلقائياً.')}</Text>
      <ScrollView style={{ maxHeight: 260, backgroundColor: C.card, borderRadius: 14, padding: 12 }}>
        <Text selectable style={{ fontSize: 12, color: C.ink2, textAlign: 'left' }}>{error.message}</Text>
      </ScrollView>
      <Text onPress={retry} style={{ fontSize: 16, fontWeight: '700', color: C.onPrimary, backgroundColor: C.primary, textAlign: 'center', paddingVertical: 14, borderRadius: 16, overflow: 'hidden' }}>{t('جرّب كمان مرة')}</Text>
      <Text onPress={() => { retry(); router.replace('/(tabs)'); }} style={{ fontSize: 15, color: C.primary, textAlign: 'center', paddingVertical: 10 }}>{t('ارجع للرئيسية')}</Text>
    </View>
  );
}

// Arabic first: make the whole layout right-to-left (needs one reload the first time in Expo Go)
syncDirection();

const AUTH_FREE = ['login', 'verify', 'callback'];

function Gate() {
  const { session, profile, loading, profileError, refreshProfile, signOut } = useAuth();
  const [retrying, setRetrying] = useState(false);
  const seg = useSegments() as string[];
  useWebPush(session?.user.id);
  useEffect(() => { setScreen(seg.join('/')); }, [seg]);

  // the splash stays until we know who is signed in
  useEffect(() => { if (!loading) SplashScreen.hideAsync().catch(() => {}); }, [loading]);

  useEffect(() => {
    if (loading) return;
    const inAuth = seg[0] === '(auth)';
    // signed out (also after "use another email" on the unsupported screen)
    if (!session) { if (!inAuth || !AUTH_FREE.includes(seg[1])) router.replace('/(auth)/login'); return; }
    if (!profile) return; // still loading or failed: the overlay below handles it
    if (!profile.university_id) { if (seg[1] !== 'unsupported') router.replace('/(auth)/unsupported'); return; }
    // the one-time setup decides on onboarding only
    if (!profile.onboarded) { if (seg[1] !== 'welcome') router.replace('/(auth)/welcome'); return; }
    if (inAuth) router.replace('/(tabs)');
  }, [session, profile, loading, seg]);

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
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg }, animation: isAR ? 'slide_from_left' : 'slide_from_right' }}>
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
  useEffect(() => { if (loaded) runQaLaunchArgs().catch(() => {}); }, [loaded]);
  if (!loaded) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: C.bg }}>
      <SafeAreaProvider>
        <AuthProvider>
          <StatusBar style={isDark ? 'light' : 'dark'} />
          <Gate />
          <ToastHost />
          <WebAlertHost />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
