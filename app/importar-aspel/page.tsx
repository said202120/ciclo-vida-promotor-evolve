import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { esRolImportador } from '@/lib/import-permisos';
import ImportarAspel from '@/components/ImportarAspel';

export default async function ImportarAspelPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!esRolImportador(session.rol)) redirect('/');
  return <ImportarAspel />;
}
