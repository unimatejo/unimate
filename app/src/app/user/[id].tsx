import { useLocalSearchParams } from 'expo-router';

import { ProfileView } from '@/components/ProfileView';
import { Header, Screen } from '@/components/ui';

export default function UserScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Screen>
      <Header title="" />
      <ProfileView userId={id} />
    </Screen>
  );
}
