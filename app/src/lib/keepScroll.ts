import { useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';
import { Platform, type FlatList, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

/**
 * A list that comes back exactly where you left it. Phones keep a screen under the stack as it was; a browser
 * hides it (display: none), which drops its scroll position — so on the web the offset is remembered and put back
 * when the screen shows again. Pass `onScroll` to the list (and `scrollEventThrottle`).
 */
export function useKeepScroll<T>(ref: React.RefObject<FlatList<T> | null>) {
  const y = useRef(0);
  const shown = useRef(true);
  // hiding the screen makes the browser report a scroll to 0 (with a list 0 px tall): only count real scrolls
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (shown.current && e.nativeEvent.layoutMeasurement.height > 0) y.current = e.nativeEvent.contentOffset.y;
  }, []);
  useFocusEffect(useCallback(() => {
    shown.current = true;
    let f = 0;
    if (Platform.OS === 'web' && y.current >= 1) {
      const at = y.current;
      shown.current = false; // until it's back in place
      // after the browser has laid the screen out again
      f = requestAnimationFrame(() => requestAnimationFrame(() => { ref.current?.scrollToOffset({ offset: at, animated: false }); shown.current = true; }));
    }
    return () => { cancelAnimationFrame(f); shown.current = false; };
  }, [ref]));
  return onScroll;
}
