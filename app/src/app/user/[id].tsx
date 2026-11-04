import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { ProfileView } from '@/components/ProfileView';
import { Header, Screen } from '@/components/ui';

export default function UserScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [title, setTitle] = useState('');
  return (
    <Screen>
      <Header title={title} />
      <ProfileView userId={id} onTitle={setTitle} />
    </Screen>
  );
}
