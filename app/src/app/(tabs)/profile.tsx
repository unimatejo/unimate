import { ProfileView } from '@/components/ProfileView';
import { Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';

export default function MyProfile() {
  const { profile } = useAuth();
  return <Screen>{profile && <ProfileView userId={profile.id} />}</Screen>;
}
