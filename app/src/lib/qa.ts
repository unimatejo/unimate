import * as Device from 'expo-device';
import { router } from 'expo-router';
import { Platform, Settings } from 'react-native';

import { supabase } from './supabase';

/**
 * Automated testing on the iOS simulator only. `xcrun simctl launch <device> jo.unimate.app -qaToken <hash> -qaRoute /schedule`
 * puts these values in NSUserDefaults; a phone user has no way to set them. Without them this does nothing.
 */
export async function runQaLaunchArgs() {
  if (Platform.OS !== 'ios' || Device.isDevice) return; // never on a real phone
  let token: string | undefined, route: string | undefined;
  try { token = Settings.get('qaToken'); route = Settings.get('qaRoute'); } catch { return; }
  if (token) {
    const { data } = await supabase.auth.getSession();
    if (!data.session) await supabase.auth.verifyOtp({ token_hash: String(token), type: 'magiclink' });
  }
  if (route) setTimeout(() => router.replace(String(route) as never), 2500);
}
