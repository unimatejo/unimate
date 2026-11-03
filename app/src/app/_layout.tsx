import { Alexandria_500Medium, Alexandria_700Bold, Alexandria_800ExtraBold } from '@expo-google-fonts/alexandria';
import { Rubik_400Regular, Rubik_500Medium, Rubik_600SemiBold } from '@expo-google-fonts/rubik';
import { useFonts } from 'expo-font';
import { Stack, router, useSegments, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as Updates from 'expo-updates';
import { useEffect } from 'react';
import { I18nManager, ScrollView, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from '@/lib/auth';
import { installGlobalErrorHandler, reportError, setScreen } from '@/lib/errors';
import { C } from '@/lib/theme';

SplashScreen.preventAutoHideAsync();
installGlobalErrorHandler();

/** Shown instead of closing the app when a screen fails to draw. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => { reportError(error, true); }, [error]);
  return (
    <View style={{ flex: 1, backgroundColor: C.bg, padding: 24, paddingTop: 90, gap: 14 }}>
      <Text style={{ fontSize: 22, fontWeight: '700', color: C.ink, textAlign: 'right' }}>صار خطأ بهالصفحة</Text>
      <Text style={{ fontSize: 15, color: C.muted, textAlign: 'right' }}>انبعت تقرير لفريق يونيميت تلقائياً.</Text>
      <ScrollView style={{ maxHeight: 260, backgroundColor: C.white, borderRadius: 14, padding: 12 }}>
        <Text selectable style={{ fontSize: 12, color: C.ink2, textAlign: 'left' }}>{error.message}</Text>
      </ScrollView>
      <Text onPress={retry} style={{ fontSize: 16, fontWeight: '700', color: C.white, backgroundColor: C.primary, textAlign: 'center', paddingVertical: 14, borderRadius: 16, overflow: 'hidden' }}>جرّب كمان مرة</Text>
      <Text onPress={() => { retry(); router.replace('/(tabs)'); }} style={{ fontSize: 15, color: C.primary, textAlign: 'center', paddingVertical: 10 }}>ارجع للرئيسية</Text>
    </View>
  );
}

// Arabic first: make the whole layout right-to-left (needs one reload the first time in Expo Go)
if (!I18nManager.isRTL) {
  I18nManager.allowRTL(true);
  I18nManager.forceRTL(true);
  Updates.reloadAsync().catch(() => {});
}

function Gate() {
  const { session, profile, loading } = useAuth();
  const seg = useSegments() as string[];
  useEffect(() => { setScreen(seg.join('/')); }, [seg]);

  useEffect(() => {
    if (loading) return;
    const inAuth = seg[0] === '(auth)';
    if (!session && !inAuth) router.replace('/(auth)/login');
    else if (session && profile && !profile.university_id && seg[1] !== 'unsupported') router.replace('/(auth)/unsupported');
    else if (session && profile?.university_id && inAuth && seg[1] !== 'welcome') router.replace('/(tabs)');
  }, [session, profile, loading, seg]);

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg }, animation: 'slide_from_left' }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
      <Stack.Screen name="post/new" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="story/[id]" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
      <Stack.Screen name="report" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="share" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="event/new" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="call/[id]" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [loaded] = useFonts({
    Alexandria_500Medium, Alexandria_700Bold, Alexandria_800ExtraBold,
    Rubik_400Regular, Rubik_500Medium, Rubik_600SemiBold,
  });
  useEffect(() => { if (loaded) SplashScreen.hideAsync(); }, [loaded]);
  if (!loaded) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <StatusBar style="dark" />
          <Gate />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
