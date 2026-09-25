import { NextResponse } from 'next/server';
import { requireGerente } from '@/lib/auth';
import { fetchHistorial, guardarCarga } from '@/lib/emetrix-ponderacion';
import type { EmetrixCargaPreview, EmetrixEstado, EmetrixFilaDetalle, EmetrixKr, EmetrixUniversoFuente } from '@/lib/types';

export const dynamic = 'force-dynamic';

const KRS_VALIDOS: EmetrixKr[] = ['mesa_control', 'materiales', 'marca'];
const FUENTES_VALIDAS: EmetrixUniversoFuente[] = ['padron', 'manual', 'archivo'];
const ESTADOS_VALIDOS: EmetrixEstado[] = ['cumple', 'no_cumple', 'no_contesto'];

// GET /api/emetrix-ponderacion/cargas?marcaId=... — historial de cargas
// (todas las cuentas, o filtrado a una). Más reciente primero.
export async function GET(request: Request) {
  const auth = await requireGerente();
  if (auth.error) return auth.error;

  const marcaId = new URL(request.url).searchParams.get('marcaId') ?? undefined;
  return NextResponse.json(await fetchHistorial(marcaId));
}

function validarPreview(body: unknown): EmetrixCargaPreview | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (typeof b.universoUsado !== 'number' || typeof b.cumplieron !== 'number' || typeof b.porcentaje !== 'number') return null;
  if (typeof b.universoFuente !== 'string' || !FUENTES_VALIDAS.includes(b.universoFuente as EmetrixUniversoFuente)) return null;
  if (!Array.isArray(b.filas)) return null;
  const filas = b.filas.filter(
    (f: unknown): f is EmetrixFilaDetalle =>
      !!f &&
      typeof f === 'object' &&
      typeof (f as EmetrixFilaDetalle).usuario === 'string' &&
      typeof (f as EmetrixFilaDetalle).estado === 'string' &&
      ESTADOS_VALIDOS.includes((f as EmetrixFilaDetalle).estado)
  );
  const d = b.diagnostico as Record<string, unknown> | undefined;
  return {
    universoUsado: b.universoUsado,
    universoFuente: b.universoFuente as EmetrixUniversoFuente,
    cumplieron: b.cumplieron,
    porcentaje: b.porcentaje,
    respondieron: typeof b.respondieron === 'number' ? b.respondieron : null,
    usuariosNoEncontrados: Array.isArray(b.usuariosNoEncontrados) ? b.usuariosNoEncontrados.filter((u) => typeof u === 'string') : [],
    diagnostico: {
      filasLeidas: typeof d?.filasLeidas === 'number' ? d.filasLeidas : 0,
      filasSinUsuario: typeof d?.filasSinUsuario === 'number' ? d.filasSinUsuario : 0,
      filasDuplicadas: typeof d?.filasDuplicadas === 'number' ? d.filasDuplicadas : 0,
    },
    filas,
  };
}

// POST /api/emetrix-ponderacion/cargas — guarda una carga ya calculada (ver
// /parse: el preview que devuelve se manda tal cual aquí). Cada carga es un
// registro nuevo, nunca se sobreescribe una anterior — así se acumula el
// historial.
export async function POST(request: Request) {
  const auth = await requireGerente();
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const marcaId = typeof body.marcaId === 'string' ? body.marcaId : '';
  const kr = typeof body.kr === 'string' ? body.kr : '';
  const incluyeCelular = typeof body.incluyeCelular === 'boolean' ? body.incluyeCelular : null;
  const archivoNombre = typeof body.archivoNombre === 'string' ? body.archivoNombre : '';
  const preview = validarPreview(body.preview);

  if (!marcaId || !KRS_VALIDOS.includes(kr as EmetrixKr) || !preview) {
    return NextResponse.json({ error: 'Faltan datos para guardar la carga.' }, { status: 400 });
  }

  const carga = await guardarCarga({
    marcaId,
    kr: kr as EmetrixKr,
    preview,
    incluyeCelular,
    archivoNombre,
    cargadoPor: auth.session.userId,
  });

  return NextResponse.json(carga, { status: 201 });
}
