import { School } from 'lucide-react-native';
import { View } from 'react-native';

import { Button, Empty, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { C } from '@/lib/theme';
import { t } from '@/lib/i18n';

/** Shown when the signed-in email belongs to a university that is not on UniMate yet. */
export default function Unsupported() {
  const { signOut } = useAuth();
  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
        <Empty
          icon={<School size={30} color={C.primary} />}
          title={t('جامعتك ليست على يونيميت بعد')}
          body={t('نضيف الجامعات تباعاً. سجّل الدخول ببريدك الجامعي الرسمي، وإذا لم تكن جامعتك متاحة فسنبلغك فور إضافتها.')}
        />
        <Button kind="dark" title={t('سجّل الدخول ببريد إلكتروني آخر')} onPress={signOut} />
      </View>
    </Screen>
  );
}
