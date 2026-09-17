import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { esRolImportador } from '@/lib/import-permisos';
import Dashboard from '@/components/Dashboard';

export default async function Home() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (esRolImportador(session.rol)) redirect('/importar-aspel');
  return <Dashboard />;
}
