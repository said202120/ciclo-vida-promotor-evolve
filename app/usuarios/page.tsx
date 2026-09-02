import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import UsersAdmin from '@/components/UsersAdmin';

export default async function UsuariosPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.rol !== 'gerente') redirect('/');
  return <UsersAdmin />;
}
