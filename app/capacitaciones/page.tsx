import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { findUserById } from '@/lib/users';
import { puedeVerAdminCompleta } from '@/lib/admin-permisos';
import CapacitacionesAdmin from '@/components/CapacitacionesAdmin';

export default async function CapacitacionesPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  const usuario = await findUserById(session.userId);
  if (!usuario || !puedeVerAdminCompleta(usuario)) redirect('/');
  return <CapacitacionesAdmin />;
}
