import { NextResponse } from 'next/server';
import { requireGerente } from '@/lib/auth';
import { parseSpreadsheet } from '@/lib/importaciones';
import {
  ColumnasFaltantesError,
  armarPreview,
  calcularMarca,
  calcularMateriales,
  calcularMesaControl,
  detectarYConvertirFormatoLargo,
} from '@/lib/emetrix-ponderacion';

export const dynamic = 'force-dynamic';

const KRS_VALIDOS = ['mesa_control', 'materiales', 'marca'];

// POST /api/emetrix-ponderacion/parse — sube el archivo de un KR, lo
// califica según las reglas de ese KR, decide el universo (padrón de la
// cuenta si existe; si no, el headcount de la cuenta o, si se manda
// `universoOverride`, un headcount puntual solo para esta carga) y devuelve
// el preview para que el gerente lo revise ANTES de guardarlo (ver /cargas).
// No escribe nada en la base de datos.
export async function POST(request: Request) {
  const auth = await requireGerente();
  if (auth.error) return auth.error;

  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  const kr = form?.get('kr');
  const marcaId = form?.get('marcaId');
  if (!(file instanceof File) || typeof kr !== 'string' || !KRS_VALIDOS.includes(kr) || typeof marcaId !== 'string' || !marcaId) {
    return NextResponse.json({ error: 'Faltan datos: archivo, cuenta y KR son obligatorios.' }, { status: 400 });
  }

  const universoOverrideRaw = form?.get('universoOverride');
  let universoOverride: number | null = null;
  if (typeof universoOverrideRaw === 'string' && universoOverrideRaw.trim() !== '') {
    universoOverride = parseInt(universoOverrideRaw, 10);
    if (!Number.isFinite(universoOverride) || universoOverride <= 0) {
      return NextResponse.json({ error: 'El universo debe ser un número mayor a cero.' }, { status: 400 });
    }
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const { headers: headersOriginal, rows: rowsOriginal } = await parseSpreadsheet(buffer, file.name);
    // Algunas cuentas (ej. ADM) exportan el sondeo en formato "largo" (una fila
    // por respuesta) en vez de "ancho" (una fila por promotor, como Spin
    // Master); se convierte a ancho aquí, ANTES de calificar, para que las
    // reglas de cumple/no cumple de abajo corran exactamente igual en ambos
    // casos. No hace nada (regresa igual) si el archivo ya viene ancho.
    const { headers, rows, notaFormatoLargo } = detectarYConvertirFormatoLargo(headersOriginal, rowsOriginal);

    let calculo;
    if (kr === 'mesa_control') {
      calculo = calcularMesaControl(headers, rows);
    } else if (kr === 'materiales') {
      const incluyeCelularRaw = form?.get('incluyeCelular');
      if (incluyeCelularRaw !== 'true' && incluyeCelularRaw !== 'false') {
        return NextResponse.json({ error: 'Falta indicar si la cuenta incluye celular en el acuerdo comercial.' }, { status: 400 });
      }
      calculo = calcularMateriales(headers, rows, incluyeCelularRaw === 'true');
    } else {
      calculo = calcularMarca(headers, rows);
    }
    calculo.diagnostico.formatoLargo = notaFormatoLargo;

    const preview = await armarPreview(marcaId, calculo, universoOverride);
    return NextResponse.json(preview);
  } catch (err) {
    if (err instanceof ColumnasFaltantesError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : 'No se pudo leer el archivo.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
