import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { requireSession } from '@/lib/auth';
import { fetchAllPromotores, fetchPromotorById } from '@/lib/promotores';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  return NextResponse.json(await fetchAllPromotores());
}

export async function POST(request: Request) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : '';
  const fechaIngreso = typeof body.fechaIngreso === 'string' ? body.fechaIngreso : '';

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaIngreso)) {
    return NextResponse.json({ error: 'fechaIngreso es obligatorio (formato YYYY-MM-DD).' }, { status: 400 });
  }

  const { rows } = await sql.query('INSERT INTO promotores (nombre, fecha_ingreso) VALUES ($1, $2) RETURNING id', [
    nombre,
    fechaIngreso,
  ]);
  const created = await fetchPromotorById(rows[0].id as string);
  return NextResponse.json(created, { status: 201 });
}
