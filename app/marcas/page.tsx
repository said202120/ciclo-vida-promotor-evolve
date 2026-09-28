import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { findUserById } from '@/lib/users';
import { puedeVerAdminCompleta } from '@/lib/admin-permisos';
import MarcasAdmin from '@/components/MarcasAdmin';

export default async function MarcasPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  const usuario = await findUserById(session.userId);
  if (!usuario || !puedeVerAdminCompleta(usuario)) redirect('/');
  return <MarcasAdmin />;
}
