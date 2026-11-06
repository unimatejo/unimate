import { router, useFocusEffect } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Platform, ScrollView, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

import { Avatar, T, Tap } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { setStoryDraft } from '@/lib/storyDraft';
import { pickMedia } from '@/lib/upload';
import { supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';
import { t } from '@/lib/i18n';

type Group = { author_id: string; name: string; avatar_url: string | null; seen: boolean };

function Ring({ seen, children }: { seen: boolean; children: React.ReactNode }) {
  // a still gradient ring, like Instagram (it used to spin)
  const s = {};
  return (
    <View style={{ width: 66, height: 66, alignItems: 'center', justifyContent: 'center' }}>
      {seen ? <View style={{ position: 'absolute', inset: 0, borderRadius: 24, backgroundColor: C.line }} /> : (
        <Animated.View style={[{ position: 'absolute', width: 66, height: 66, borderRadius: 24, overflow: 'hidden' }, s]}>
          <LinearGradient colors={[C.primary, C.pink, '#FFB020', C.primary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }} />
        </Animated.View>
      )}
      <View style={{ padding: 3, borderRadius: 21, backgroundColor: C.bg }}>{children}</View>
    </View>
  );
}

/** "+": on the web the photo picker opens right from the tap (browsers need that), then the story editor; phones open the story camera. */
async function addStory() {
  if (Platform.OS !== 'web') { router.push({ pathname: '/post/new', params: { mode: 'story' } }); return; }
  const p = await pickMedia({ video: true, maxSec: 180 });
  if (!p) return;
  setStoryDraft(p);
  router.push({ pathname: '/post/new', params: { mode: 'story' } });
}

export function StoriesRow() {
  const { profile } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [mineCount, setMineCount] = useState(0);

  const load = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase.from('stories')
      .select('id, author_id, created_at, author:profiles!stories_author_id_fkey(full_name, avatar_url), views:story_views(viewer_id)')
      .gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(200);
    const map = new Map<string, Group>();
     
    for (const s of (data ?? []) as any[]) {
      const seen = (s.views ?? []).some((v: { viewer_id: string }) => v.viewer_id === (profile?.id ?? ''));
      const g = map.get(s.author_id);
      if (!g) map.set(s.author_id, { author_id: s.author_id, name: s.author?.full_name ?? '', avatar_url: s.author?.avatar_url ?? null, seen });
      else if (!seen) g.seen = false;
    }
    setMineCount((data ?? []).filter((x) => x.author_id === profile?.id).length);
    const list = [...map.values()].filter((g) => g.author_id !== (profile?.id ?? '')).sort((a, b) => Number(a.seen) - Number(b.seen));
    setGroups(list);
  }, [profile]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 18 }}>
      {/* like Instagram: your photo with a "+"; tap it to see your story, or to add one when you have none */}
      <View style={{ alignItems: 'center', gap: 6, width: 68 }}>
        <Tap onPress={() => (mineCount > 0 ? router.push({ pathname: '/story/[id]', params: { id: profile?.id ?? '' } }) : addStory())}
          accessibilityLabel={mineCount > 0 ? t('شوف قصتك') : t('ضيف قصة')}>
          {mineCount > 0
            ? <Ring seen={false}><Avatar id={profile?.id} name={profile?.full_name} url={profile?.avatar_url} size={56} radius={19} /></Ring>
            : <View style={{ width: 66, height: 66, alignItems: 'center', justifyContent: 'center' }}><Avatar id={profile?.id} name={profile?.full_name} url={profile?.avatar_url} size={60} radius={21} /></View>}
        </Tap>
        <Tap onPress={addStory} accessibilityLabel={t('ضيف قصة')} hitSlop={10}
          style={{ position: 'absolute', top: 44, left: 0, width: 26, height: 26, borderRadius: 13, backgroundColor: C.primary, borderWidth: 2.5, borderColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
          <Plus size={15} color={C.onPrimary} strokeWidth={3} />
        </Tap>
        <T v="tiny">{t('قصتك')}</T>
      </View>
      {groups.map((g) => (
        <Tap key={g.author_id} onPress={() => router.push({ pathname: '/story/[id]', params: { id: g.author_id } })} style={{ alignItems: 'center', gap: 6, width: 68 }}>
          <Ring seen={g.seen}><Avatar id={g.author_id} name={g.name} url={g.avatar_url} size={56} radius={19} /></Ring>
          <T v="tiny" numberOfLines={1}>{g.name.split(' ')[0]}</T>
        </Tap>
      ))}
    </ScrollView>
  );
}
