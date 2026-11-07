import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing, ReduceMotion, runOnJS, useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { t } from '@/lib/i18n';
import { F } from '@/lib/theme';

const BG = '#0B1022'; // the native splash colour (app.json), so the hand-over is seamless
const U = 'M340 330 V555 a172 172 0 0 0 344 0 V440'; // the U of the logo (assets/images/logo.svg)
const U_LEN = 900;
const NAME = 'UniMate'.split('');
const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function Letter({ ch, i }: { ch: string; i: number }) {
  const v = useSharedValue(0);
  useEffect(() => { v.value = withDelay(620 + i * 55, withSpring(1, { damping: 14, stiffness: 180 })); }, [v, i]);
  const st = useAnimatedStyle(() => ({ opacity: Math.min(1, v.value * 1.4), transform: [{ translateY: (1 - v.value) * 16 }, { scale: 0.85 + v.value * 0.15 }] }));
  return <Animated.Text style={[s.name, st]}>{ch}</Animated.Text>;
}

/**
 * The opening on every cold start: the U of the logo draws itself, its dot drops in, «UniMate» rises letter by letter
 * and «صديقك الجامعي» fades in under it. Silent, about a second and a half, and it never holds the app back: it
 * leaves as soon as both the animation and the sign-in check are done (at once when the phone asks for less motion).
 */
export function Intro({ ready }: { ready: boolean }) {
  const reduce = useReducedMotion();
  const [played, setPlayed] = useState(reduce);
  const [gone, setGone] = useState(false);
  const draw = useSharedValue(0);
  const dot = useSharedValue(0);
  const tag = useSharedValue(0);
  const out = useSharedValue(1);

  useEffect(() => {
    // the first frame of this screen matches the native splash, so swap it out now
    SplashScreen.hideAsync().catch(() => {});
    if (reduce) return;
    draw.value = withTiming(1, { duration: 620, easing: Easing.bezier(0.65, 0, 0.35, 1) });
    dot.value = withDelay(480, withSequence(withSpring(1.18, { damping: 9, stiffness: 260 }), withSpring(1, { damping: 12 })));
    tag.value = withDelay(1050, withTiming(1, { duration: 380 }, (ok) => { if (ok) runOnJS(setPlayed)(true); }));
  }, [reduce, draw, dot, tag]);

  // never more than 6 s, whatever the sign-in check is doing (the screens behind have their own loading states)
  const [late, setLate] = useState(false);
  useEffect(() => { const tm = setTimeout(() => setLate(true), 6000); return () => clearTimeout(tm); }, []);
  useEffect(() => {
    if (!played || (!ready && !late)) return;
    out.value = withTiming(0, { duration: 260, reduceMotion: ReduceMotion.Never }, (ok) => { if (ok) runOnJS(setGone)(true); });
  }, [played, ready, late, out]);

  const uProps = useAnimatedProps(() => ({ strokeDashoffset: U_LEN * (1 - draw.value) }));
  const dotProps = useAnimatedProps(() => ({ r: 66.56 * dot.value }));
  const tagStyle = useAnimatedStyle(() => ({ opacity: tag.value, transform: [{ translateY: (1 - tag.value) * 8 }] }));
  const wrap = useAnimatedStyle(() => ({ opacity: out.value, transform: [{ scale: 1 + (1 - out.value) * 0.06 }] }));

  if (gone) return null;
  return (
    <Animated.View style={[StyleSheet.absoluteFill, s.bg, wrap]} pointerEvents={played && (ready || late) ? 'none' : 'auto'}
      accessible accessibilityLabel="UniMate">
      <Svg width={150} height={150} viewBox="180 110 680 680">
        <Defs>
          <LinearGradient id="dot" x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#FFB547" /><Stop offset="1" stopColor="#FF4F7B" /></LinearGradient>
        </Defs>
        <AnimatedPath d={U} fill="none" stroke="#FFFFFF" strokeWidth={128} strokeLinecap="round"
          strokeDasharray={U_LEN} animatedProps={reduce ? undefined : uProps} strokeDashoffset={reduce ? 0 : undefined} />
        <AnimatedCircle cx={684} cy={262} fill="url(#dot)" animatedProps={reduce ? undefined : dotProps} r={reduce ? 66.56 : undefined} />
      </Svg>
      <View style={s.row}>
        {reduce ? <Text style={s.name}>UniMate</Text> : NAME.map((ch, i) => <Letter key={i} ch={ch} i={i} />)}
      </View>
      <Animated.Text style={[s.tag, reduce ? null : tagStyle]}>{t('صديقك الجامعي')}</Animated.Text>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  bg: { backgroundColor: BG, alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  row: { flexDirection: 'row', direction: 'ltr', marginTop: 18 },
  name: { fontFamily: F.display, fontSize: 34, color: '#FFFFFF', letterSpacing: 0.5 },
  tag: { fontFamily: F.bodyMd, fontSize: 15, color: '#AEB6DA', marginTop: 6 },
});
