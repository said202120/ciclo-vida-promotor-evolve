import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { rutaInicioPara } from '@/lib/import-permisos';
import UsersAdmin from '@/components/UsersAdmin';

export default async function UsuariosPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.rol !== 'gerente') redirect(rutaInicioPara(session.rol));
  return <UsersAdmin />;
}
