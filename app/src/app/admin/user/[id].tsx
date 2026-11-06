import { useLocalSearchParams } from 'expo-router';

import { AdminScreen } from '@/components/admin/kit';
import { UserDetail } from '@/components/admin/UserDetail';
import { t } from '@/lib/i18n';

/** Admin › one user (the shared UserDetail). */
export default function AdminUser() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <AdminScreen title={t('المستخدم')}>{id ? <UserDetail id={id} /> : null}</AdminScreen>;
}
