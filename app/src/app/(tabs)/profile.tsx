import { ProfileView } from '@/components/profile/ProfileView';
import { Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';

/** My profile tab (the shared ProfileView for the signed-in account). */
export default function MyProfile() {
  const { profile } = useAuth();
  return <Screen>{profile && <ProfileView userId={(profile?.id ?? '')} />}</Screen>;
}
