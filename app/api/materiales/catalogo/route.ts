import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { fetchCatalogo } from '@/lib/materiales';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  return NextResponse.json(await fetchCatalogo());
}
