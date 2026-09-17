import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { requireSession } from '@/lib/auth';
import { fetchPromotorById } from '@/lib/promotores';

export const dynamic = 'force-dynamic';

const EDITABLE_BOOLEAN_FIELDS = ['carta', 'usuario', 'contrato', 'imss', 'mod1', 'mod3', 'mod6', 'mod12'] as const;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (typeof body.nombre === 'string') {
    sets.push(`nombre = $${i++}`);
    values.push(body.nombre.trim());
  }
  if (typeof body.rfc === 'string') {
    const rfc = body.rfc.trim().toUpperCase();
    sets.push(`rfc = $${i++}`);
    values.push(rfc || null);
  }
  if (typeof body.fechaIngreso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.fechaIngreso)) {
    sets.push(`fecha_ingreso = $${i++}`);
    values.push(body.fechaIngreso);
  }
  for (const field of EDITABLE_BOOLEAN_FIELDS) {
    if (typeof body[field] === 'boolean') {
      sets.push(`${field} = $${i++}`);
      values.push(body[field]);
    }
  }

  if (sets.length === 0) {
    return NextResponse.json({ error: 'No hay campos válidos para actualizar.' }, { status: 400 });
  }

  values.push(id);
  const { rowCount } = await sql.query(`UPDATE promotores SET ${sets.join(', ')} WHERE id = $${i}`, values);

  if (!rowCount) {
    return NextResponse.json({ error: 'Promotor no encontrado.' }, { status: 404 });
  }
  return NextResponse.json(await fetchPromotorById(id));
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  const { id } = await params;
  const { rowCount } = await sql.query('DELETE FROM promotores WHERE id = $1', [id]);
  if (!rowCount) {
    return NextResponse.json({ error: 'Promotor no encontrado.' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
