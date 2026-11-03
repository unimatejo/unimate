import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

/** Instagram-style app glyph (gradient square, camera outline). */
export function InstagramGlyph({ size = 44 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Defs>
        <LinearGradient id="ig" x1="0" y1="1" x2="1" y2="0">
          <Stop offset="0" stopColor="#FFD776" />
          <Stop offset="0.3" stopColor="#F77737" />
          <Stop offset="0.6" stopColor="#E1306C" />
          <Stop offset="0.85" stopColor="#C13584" />
          <Stop offset="1" stopColor="#5851DB" />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="48" height="48" rx="13" fill="url(#ig)" />
      <Rect x="11" y="11" width="26" height="26" rx="8" fill="none" stroke="#fff" strokeWidth="3.2" />
      <Circle cx="24" cy="24" r="6.2" fill="none" stroke="#fff" strokeWidth="3.2" />
      <Circle cx="31.6" cy="16.4" r="2" fill="#fff" />
    </Svg>
  );
}

/** Snapchat-style app glyph (yellow square, ghost). */
export function SnapGlyph({ size = 44 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Rect x="0" y="0" width="48" height="48" rx="13" fill="#FFFC00" />
      <Path
        d="M24 10.5c-5.3 0-8.6 3.9-8.6 8.7v4.1c-.9.1-1.8-.3-2.4.3-.6.7.2 1.6 1 2l1.3.6c-.9 2.6-2.8 4.4-5.1 5.2-.6.2-.6 1 0 1.3 1.1.5 2.4.7 3.4 1 .3.6.2 1.6.8 1.8.9.3 2.1-.3 3.4 0 1.9.5 3.1 2.8 6.2 2.8s4.3-2.3 6.2-2.8c1.3-.3 2.5.3 3.4 0 .6-.2.5-1.2.8-1.8 1-.3 2.3-.5 3.4-1 .6-.3.6-1.1 0-1.3-2.3-.8-4.2-2.6-5.1-5.2l1.3-.6c.8-.4 1.6-1.3 1-2-.6-.6-1.5-.2-2.4-.3v-4.1c0-4.8-3.3-8.7-8.6-8.7z"
        fill="#fff" stroke="#111" strokeWidth="2" strokeLinejoin="round"
      />
    </Svg>
  );
}
