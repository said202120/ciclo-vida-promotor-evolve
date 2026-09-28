import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { findUserById } from '@/lib/users';
import { puedeVerAdministracion } from '@/lib/admin-permisos';
import Dashboard from '@/components/Dashboard';

// Padrón de promotores (antes la pantalla principal): ahora vive dentro de
// "Administración", visible solo para quien puedeVerAdministracion — ver
// lib/admin-permisos.ts. Quien entra por URL directa sin permiso vuelve a la
// pantalla principal ("/").
export default async function PadronPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  const usuario = await findUserById(session.userId);
  if (!usuario || !puedeVerAdministracion(usuario)) redirect('/');
  return <Dashboard />;
}
