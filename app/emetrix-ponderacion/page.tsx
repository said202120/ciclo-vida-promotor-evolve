import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { rutaInicioPara } from '@/lib/import-permisos';
import EmetrixPonderacionAdmin from '@/components/EmetrixPonderacionAdmin';

export default async function EmetrixPonderacionPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.rol !== 'gerente') redirect(rutaInicioPara(session.rol));
  return <EmetrixPonderacionAdmin />;
}
