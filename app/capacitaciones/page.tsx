import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { rutaInicioPara } from '@/lib/import-permisos';
import CapacitacionesAdmin from '@/components/CapacitacionesAdmin';

export default async function CapacitacionesPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.rol !== 'gerente') redirect(rutaInicioPara(session.rol));
  return <CapacitacionesAdmin />;
}
