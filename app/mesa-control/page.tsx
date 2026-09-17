import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { rutaInicioPara } from '@/lib/import-permisos';
import MesaControlIngresos from '@/components/MesaControlIngresos';

export default async function MesaControlPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.rol !== 'mesa_control') redirect(rutaInicioPara(session.rol));
  return <MesaControlIngresos />;
}
