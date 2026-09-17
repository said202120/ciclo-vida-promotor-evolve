import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import ImportarAspel from '@/components/ImportarAspel';

export default async function ImportarAspelPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  return <ImportarAspel />;
}
