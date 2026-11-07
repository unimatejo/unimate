import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { ChevronLeft, ChevronRight, Megaphone } from 'lucide-react-native';
import { Linking, StyleSheet, View, type TextStyle } from 'react-native';

import { Row, T, Tap } from '@/components/ui';
import { paletteOf, say, type Banner, type Notice } from '@/lib/appContent';
import { isAR, t } from '@/lib/i18n';
import { F, shadow } from '@/lib/theme';
import { isWebUrl } from '@/lib/util';

/** Owner-written words sit on the side their own language reads from: Arabic on the right, English on the left. */
export function ownDir(s: string): TextStyle {
  const ar = /[؀-ۿ]/.test(s);
  return { textAlign: ar ? 'right' : 'left', writingDirection: ar ? 'rtl' : 'ltr', alignSelf: 'stretch' };
}

/** Where the banner's tap goes: a page inside the app, or a secure site in the browser. */
export function openOwnerLink(link?: string) {
  const l = link?.trim();
  if (!l) return;
  if (l.startsWith('/') && !l.startsWith('/admin')) router.push(l as never);
  else if (isWebUrl(l)) Linking.openURL(l).catch(() => {});
}

/** The owner's notice to everyone: one line on a lit gradient, a megaphone at its start. */
export function NoticeBar({ notice }: { notice: Notice }) {
  const text = say(notice.text, notice.text_en);
  if (!text) return null;
  const [a, b] = paletteOf(notice.tone, 'sunset');
  return (
    <LinearGradient colors={[a, b]} start={{ x: isAR ? 1 : 0, y: 0 }} end={{ x: isAR ? 0 : 1, y: 1 }} accessibilityRole="alert"
      style={{ borderRadius: 20, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
        <Megaphone size={17} color="#FFFFFF" />
      </View>
      <T v="bold" color="#FFFFFF" style={[{ flex: 1, fontSize: 14, lineHeight: 22 }, ownDir(text)]}>{text}</T>
    </LinearGradient>
  );
}

/**
 * The owner's banner on Home. With a photo: the photo fills it, darkened from the bottom so the words always read,
 * tinted by the chosen palette. Without one: the palette's gradient with soft light in its corner.
 */
export function OwnerBanner({ banner, preview }: { banner: Banner; preview?: boolean }) {
  const title = say(banner.title, banner.title_en);
  const body = say(banner.body, banner.body_en);
  const cta = say(banner.cta, banner.cta_en);
  const [deep, mid, lit] = paletteOf(banner.tone);
  const Arrow = isAR ? ChevronLeft : ChevronRight;
  if (!title) return null;
  return (
    <Tap disabled={preview || !banner.link?.trim()} scale={0.98} onPress={() => openOwnerLink(banner.link)} accessibilityRole={banner.link ? 'link' : undefined}
      style={[{ borderRadius: 26, overflow: 'hidden', minHeight: banner.image ? undefined : 150, aspectRatio: banner.image ? 2 : undefined, backgroundColor: deep }, shadow]}>
      {banner.image
        ? <Image source={{ uri: banner.image }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} cachePolicy="memory-disk" />
        : (
          <LinearGradient colors={[deep, mid, lit]} locations={[0, 0.55, 1]} start={{ x: isAR ? 0 : 1, y: 1 }} end={{ x: isAR ? 1 : 0, y: 0 }} style={StyleSheet.absoluteFill}>
            {/* soft light in the far corner */}
            <View style={{ position: 'absolute', top: -70, [isAR ? 'left' : 'right']: -50, width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.14)' }} />
            <View style={{ position: 'absolute', bottom: -90, [isAR ? 'right' : 'left']: -40, width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(0,0,0,0.18)' }} />
          </LinearGradient>
        )}
      <LinearGradient
        colors={banner.image ? ['rgba(0,0,0,0)', `${deep}66`, `${deep}EE`] : ['rgba(0,0,0,0)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.12)']}
        locations={[0, 0.45, 1]} style={{ flex: 1, padding: 18, justifyContent: 'flex-end', gap: 6 }}>
        <T v="h2" color="#FFFFFF" numberOfLines={2} style={[{ fontFamily: F.display, fontSize: 22, lineHeight: 30 }, ownDir(title)]}>{title}</T>
        {body ? <T v="small" color="rgba(255,255,255,0.9)" numberOfLines={3} style={[{ lineHeight: 21 }, ownDir(body)]}>{body}</T> : null}
        {banner.link?.trim() ? (
          <Row gap={4} style={{ alignSelf: 'flex-start', marginTop: 6, minHeight: 38, paddingHorizontal: 14, borderRadius: 13, backgroundColor: '#FFFFFF' }}>
            <T v="bold" color={deep} style={{ fontSize: 14 }}>{cta || t('اكتشف المزيد')}</T>
            <Arrow size={16} color={deep} />
          </Row>
        ) : null}
      </LinearGradient>
    </Tap>
  );
}
