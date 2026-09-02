import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { requireSession } from '@/lib/auth';
import { fetchModulos } from '@/lib/modulos';

export const dynamic = 'force-dynamic';

const BOOL_FIELDS = ['mod1', 'mod3', 'mod6', 'mod12'] as const;

export async function GET() {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  return NextResponse.json(await fetchModulos());
}

export async function PATCH(request: Request) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  for (const field of BOOL_FIELDS) {
    if (typeof body[field] === 'boolean') {
      sets.push(`${field} = $${i++}`);
      values.push(body[field]);
    }
  }
  if (typeof body.comprometidos === 'number' && Number.isFinite(body.comprometidos)) {
    const c = Math.max(0, Math.min(4, Math.round(body.comprometidos)));
    sets.push(`comprometidos = $${i++}`);
    values.push(c);
  }

  if (sets.length === 0) {
    return NextResponse.json({ error: 'No hay campos válidos para actualizar.' }, { status: 400 });
  }

  sets.push('updated_at = now()');
  await sql.query(`UPDATE modulos_publicados SET ${sets.join(', ')} WHERE id = 1`, values);
  return NextResponse.json(await fetchModulos());
}
