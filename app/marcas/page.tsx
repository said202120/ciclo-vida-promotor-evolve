import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { findUserById } from '@/lib/users';
import { puedeVerAdministracion } from '@/lib/admin-permisos';
import MarcasAdmin from '@/components/MarcasAdmin';

export default async function MarcasPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  const usuario = await findUserById(session.userId);
  if (!usuario || !puedeVerAdministracion(usuario)) redirect('/');
  return <MarcasAdmin />;
}
