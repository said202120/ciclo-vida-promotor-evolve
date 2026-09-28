import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { findUserById } from '@/lib/users';
import { puedeVerAdminCompleta } from '@/lib/admin-permisos';
import UsersAdmin from '@/components/UsersAdmin';

export default async function UsuariosPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  const usuario = await findUserById(session.userId);
  if (!usuario || !puedeVerAdminCompleta(usuario)) redirect('/');
  return <UsersAdmin />;
}
