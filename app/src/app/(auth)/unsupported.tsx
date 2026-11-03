import { School } from 'lucide-react-native';
import { View } from 'react-native';

import { Button, Empty, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { C } from '@/lib/theme';

export default function Unsupported() {
  const { signOut } = useAuth();
  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
        <Empty
          icon={<School size={30} color={C.primary} />}
          title="جامعتك لسا مش على يونيميت"
          body="بنضيف الجامعات وحدة وحدة. ادخل بإيميلك الجامعي الرسمي، وإذا جامعتك مش موجودة رح نخبرك أول ما تنضاف."
        />
        <Button kind="dark" title="ادخل بإيميل ثاني" onPress={signOut} />
      </View>
    </Screen>
  );
}
