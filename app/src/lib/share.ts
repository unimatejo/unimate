import { Directory, File, Paths } from 'expo-file-system';
import { Platform, Share } from 'react-native';

import { reportError } from './errors';
import { t } from './i18n';
import { galleryPermission, mediaLibrary } from './nativeMedia';
import { toast } from './toast';

/**
 * Share a UniMate link: the phone's share sheet; a browser without one copies it instead (never does nothing).
 * `message` is the text that goes with it on phones.
 */
export async function shareLink(url: string, message?: string) {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && !(navigator as Navigator & { share?: unknown }).share) {
    try { await navigator.clipboard.writeText(url); toast(t('تم نسخ الرابط')); } catch { toast(url); }
    return;
  }
  Share.share(Platform.OS === 'web' ? { url, message: message ?? url } : { message: message ? `${message}\n${url}` : url }).catch(() => {});
}

/** Save a photo or video (a signed link) to the phone's gallery, or download it in a browser. */
export async function saveToDevice(url: string, kind: 'image' | 'video') {
  const name = `unimate-${Date.now()}.${kind === 'video' ? 'mp4' : 'jpg'}`;
  try {
    if (Platform.OS === 'web') {
      const blob = await (await fetch(url)).blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = href; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 10000);
      toast(t('تم الحفظ'));
      return;
    }
    const m = mediaLibrary();
    if (!m || (await galleryPermission(true)) !== 'granted') { toast.error(t('اسمح ليونيميت بالحفظ في الصور من الإعدادات.')); return; }
    const file = await File.downloadFileAsync(url, new File(new Directory(Paths.cache), name));
    await m.saveToLibraryAsync(file.uri);
    file.delete();
    toast(t('تم الحفظ في الصور ✓'));
  } catch (e) {
    reportError(e);
    toast.error(t('تعذّر الحفظ، حاول مرة أخرى.'));
  }
}
