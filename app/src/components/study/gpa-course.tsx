import { Minus, Plus, Trash2 } from 'lucide-react-native';
import { memo } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { Row, T, Tap } from '@/components/ui';
import type { ScaleRow } from '@/lib/gpa';
import { C, F } from '@/lib/theme';
import { t } from '@/lib/i18n';

export type Course = {
  id: string; term_label: string; course_name: string; course_code: string | null; credit_hours: number;
  grade: string | null; target_grade: string | null; section_id: string | null; position: number;
};

function GradePill({ g, on, onPress, soft }: { g: string; on: boolean; onPress: () => void; soft?: boolean }) {
  return (
    <Tap onPress={onPress} scale={0.92} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={g}
      style={{ minWidth: 42, height: 34, paddingHorizontal: 10, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
        backgroundColor: on ? (soft ? C.violet : C.inverse) : C.soft }}>
      <Text style={{ fontFamily: on ? F.bodyBold : F.bodyMd, fontSize: 13, color: on ? (soft ? C.white : C.onInverse) : C.ink2, writingDirection: 'ltr' }}>{g}</Text>
    </Tap>
  );
}

/** One course: hours stepper, the grade (or "still studying" + the grade you're aiming for). */
export const CourseRow = memo(function CourseRow({ c, scale, onChange, onDelete }: {
  c: Course; scale: ScaleRow[]; onChange: (patch: Partial<Course>) => void; onDelete: () => void;
}) {
  const planned = c.grade == null;
  const step = (d: number) => onChange({ credit_hours: Math.max(0, Math.min(12, c.credit_hours + d)) });
  return (
    <View style={{ gap: 10, paddingVertical: 12, borderTopWidth: 1, borderTopColor: C.line }}>
      <Row gap={10}>
        <View style={{ flex: 1, gap: 2 }}>
          <T v="bold" numberOfLines={2}>{c.course_name}</T>
          <T v="tiny" color={planned ? C.violetInk : C.muted}>
            {[c.course_code, planned ? t('ما زلت أدرسها') : null].filter(Boolean).join(' · ') || ' '}
          </T>
        </View>
        {/* hours stepper */}
        <Row gap={4} style={{ backgroundColor: C.soft, borderRadius: 12, padding: 3 }}>
          <Tap onPress={() => step(-1)} scale={0.9} accessibilityLabel={t('ساعات أقل')} style={{ width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: C.card }}>
            <Minus size={14} color={C.ink} />
          </Tap>
          <View style={{ minWidth: 34, alignItems: 'center' }}>
            <T v="bold" style={{ fontSize: 15, lineHeight: 18 }}>{c.credit_hours}</T>
            <T v="tiny" color={C.muted} style={{ fontSize: 9, lineHeight: 11 }}>{t('ساعات')}</T>
          </View>
          <Tap onPress={() => step(1)} scale={0.9} accessibilityLabel={t('ساعات أكثر')} style={{ width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: C.card }}>
            <Plus size={14} color={C.ink} />
          </Tap>
        </Row>
        <Tap onPress={onDelete} scale={0.9} accessibilityLabel={t('احذف المادة')} hitSlop={8} style={{ width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' }}>
          <Trash2 size={17} color={C.muted} />
        </Tap>
      </Row>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        <GradePill g={t('لاحقًا')} on={planned} onPress={() => onChange({ grade: null })} />
        {scale.map((s) => <GradePill key={s.g} g={s.g} on={c.grade === s.g} onPress={() => onChange({ grade: s.g })} />)}
        <GradePill g="P" on={c.grade === 'P'} onPress={() => onChange({ grade: 'P' })} />
      </ScrollView>

      {planned && (
        <View style={{ gap: 6 }}>
          <T v="tiny" color={C.violetInk}>{t('العلامة التي تريد الحصول عليها')}</T>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {scale.map((s) => <GradePill key={s.g} soft g={s.g} on={c.target_grade === s.g} onPress={() => onChange({ target_grade: c.target_grade === s.g ? null : s.g })} />)}
          </ScrollView>
        </View>
      )}
    </View>
  );
});
