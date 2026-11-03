import { School } from 'lucide-react-native';
import { View } from 'react-native';

import { Button, Empty, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { C } from '@/lib/theme';
import { t } from '@/lib/i18n';

export default function Unsupported() {
  const { signOut } = useAuth();
  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
        <Empty
          icon={<School size={30} color={C.primary} />}
          title={t('جامعتك لسا مش على يونيميت')}
          body={t('بنضيف الجامعات وحدة وحدة. ادخل بإيميلك الجامعي الرسمي، وإذا جامعتك مش موجودة رح نخبرك أول ما تنضاف.')}
        />
        <Button kind="dark" title={t('ادخل بإيميل ثاني')} onPress={signOut} />
      </View>
    </Screen>
  );
}
