import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { findUserById } from '@/lib/users';
import { puedeVerAdministracion } from '@/lib/admin-permisos';
import UsersAdmin from '@/components/UsersAdmin';

export default async function UsuariosPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  const usuario = await findUserById(session.userId);
  if (!usuario || !puedeVerAdministracion(usuario)) redirect('/');
  return <UsersAdmin />;
}
