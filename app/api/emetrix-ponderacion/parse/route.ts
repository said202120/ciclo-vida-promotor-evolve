import { NextResponse } from 'next/server';
import { requireGerente } from '@/lib/auth';
import { parseSpreadsheet } from '@/lib/importaciones';
import { ColumnasFaltantesError, armarPreview, calcularMarca, calcularMateriales, calcularMesaControl } from '@/lib/emetrix-ponderacion';

export const dynamic = 'force-dynamic';

const KRS_VALIDOS = ['mesa_control', 'materiales', 'marca'];

// POST /api/emetrix-ponderacion/parse — sube el archivo de un KR, lo
// califica según las reglas de ese KR, decide el universo (padrón de la
// cuenta si existe; si no, headcount manual o promotores únicos del
// archivo) y devuelve el preview para que el gerente lo revise ANTES de
// guardarlo (ver /cargas). No escribe nada en la base de datos.
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

  const universoManualRaw = form?.get('universoManual');
  let universoManual: number | null = null;
  if (typeof universoManualRaw === 'string' && universoManualRaw.trim() !== '') {
    universoManual = parseInt(universoManualRaw, 10);
    if (!Number.isFinite(universoManual) || universoManual <= 0) {
      return NextResponse.json({ error: 'El universo debe ser un número mayor a cero.' }, { status: 400 });
    }
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const { headers, rows } = await parseSpreadsheet(buffer, file.name);

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

    const preview = await armarPreview(marcaId, calculo, universoManual);
    return NextResponse.json(preview);
  } catch (err) {
    if (err instanceof ColumnasFaltantesError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : 'No se pudo leer el archivo.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
