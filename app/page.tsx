import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import EmetrixPonderacionAdmin from '@/components/EmetrixPonderacionAdmin';

// Pantalla principal del portal para TODOS los roles: el árbol OKR "Ciclo de
// vida del promotor" (antes en /emetrix-ponderacion). Cualquier usuario
// autenticado puede VER esta pantalla; los controles para editar datos
// (subir archivo, capturar KPI manual, umbral, headcount) se muestran solo
// si el rol es gerente — ver EmetrixPonderacionAdmin.tsx.
export default async function Home() {
  const session = await getSession();
  if (!session) redirect('/login');
  return <EmetrixPonderacionAdmin />;
}
