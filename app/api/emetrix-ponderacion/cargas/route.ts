import { NextResponse } from 'next/server';
import { requireGerente } from '@/lib/auth';
import { fetchHistorial, guardarCarga } from '@/lib/emetrix-ponderacion';
import type { EmetrixFilaDetalle, EmetrixKr } from '@/lib/types';

export const dynamic = 'force-dynamic';

const KRS_VALIDOS: EmetrixKr[] = ['mesa_control', 'materiales', 'marca'];

// GET /api/emetrix-ponderacion/cargas?marcaId=... — historial de cargas
// (todas las cuentas, o filtrado a una). Más reciente primero.
export async function GET(request: Request) {
  const auth = await requireGerente();
  if (auth.error) return auth.error;

  const marcaId = new URL(request.url).searchParams.get('marcaId') ?? undefined;
  return NextResponse.json(await fetchHistorial(marcaId));
}

// POST /api/emetrix-ponderacion/cargas — guarda una carga ya calculada (ver
// /parse). Cada carga es un registro nuevo, nunca se sobreescribe una
// anterior — así se acumula el historial.
export async function POST(request: Request) {
  const auth = await requireGerente();
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const marcaId = typeof body.marcaId === 'string' ? body.marcaId : '';
  const kr = typeof body.kr === 'string' ? body.kr : '';
  const totalFilas = typeof body.totalFilas === 'number' ? body.totalFilas : null;
  const cumplieron = typeof body.cumplieron === 'number' ? body.cumplieron : null;
  const universoManual = typeof body.universoManual === 'number' ? body.universoManual : null;
  const incluyeCelular = typeof body.incluyeCelular === 'boolean' ? body.incluyeCelular : null;
  const archivoNombre = typeof body.archivoNombre === 'string' ? body.archivoNombre : '';
  const filas: EmetrixFilaDetalle[] = Array.isArray(body.filas)
    ? body.filas.filter(
        (f: unknown): f is EmetrixFilaDetalle =>
          !!f &&
          typeof f === 'object' &&
          typeof (f as EmetrixFilaDetalle).usuario === 'string' &&
          typeof (f as EmetrixFilaDetalle).cumple === 'boolean'
      )
    : [];

  if (!marcaId || !KRS_VALIDOS.includes(kr as EmetrixKr) || totalFilas === null || cumplieron === null) {
    return NextResponse.json({ error: 'Faltan datos para guardar la carga.' }, { status: 400 });
  }

  const carga = await guardarCarga({
    marcaId,
    kr: kr as EmetrixKr,
    totalFilas,
    universoManual,
    cumplieron,
    incluyeCelular,
    archivoNombre,
    cargadoPor: auth.session.userId,
    filas,
  });

  return NextResponse.json(carga, { status: 201 });
}
