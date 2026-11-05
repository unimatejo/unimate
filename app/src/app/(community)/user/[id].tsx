import { useLocalSearchParams } from 'expo-router';

import { ProfileView } from '@/components/profile/ProfileView';
import { Screen } from '@/components/ui';

export default function UserScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Screen><ProfileView userId={id} back /></Screen>;
}
