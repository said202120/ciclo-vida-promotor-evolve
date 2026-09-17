import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { rutaInicioPara } from '@/lib/import-permisos';
import MarcasAdmin from '@/components/MarcasAdmin';

export default async function MarcasPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.rol !== 'gerente') redirect(rutaInicioPara(session.rol));
  return <MarcasAdmin />;
}
