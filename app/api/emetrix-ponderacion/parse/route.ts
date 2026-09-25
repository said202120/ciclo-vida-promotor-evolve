import { NextResponse } from 'next/server';
import { requireGerente } from '@/lib/auth';
import { parseSpreadsheet } from '@/lib/importaciones';
import { ColumnasFaltantesError, calcularMarca, calcularMateriales, calcularMesaControl } from '@/lib/emetrix-ponderacion';
import type { EmetrixFilaDetalle } from '@/lib/types';

export const dynamic = 'force-dynamic';

const KRS_VALIDOS = ['mesa_control', 'materiales', 'marca'];

// POST /api/emetrix-ponderacion/parse — sube el archivo de un KR, lo
// califica según las reglas de ese KR, y devuelve el cálculo para que el
// gerente lo revise ANTES de guardarlo (ver /cargas). No escribe nada en la
// base de datos.
export async function POST(request: Request) {
  const auth = await requireGerente();
  if (auth.error) return auth.error;

  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  const kr = form?.get('kr');
  if (!(file instanceof File) || typeof kr !== 'string' || !KRS_VALIDOS.includes(kr)) {
    return NextResponse.json({ error: 'Faltan datos: archivo y KR son obligatorios.' }, { status: 400 });
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

    let resultado: { filas: EmetrixFilaDetalle[]; cumplieron: number };
    if (kr === 'mesa_control') {
      resultado = calcularMesaControl(headers, rows);
    } else if (kr === 'materiales') {
      const incluyeCelularRaw = form?.get('incluyeCelular');
      if (incluyeCelularRaw !== 'true' && incluyeCelularRaw !== 'false') {
        return NextResponse.json({ error: 'Falta indicar si la cuenta incluye celular en el acuerdo comercial.' }, { status: 400 });
      }
      resultado = calcularMateriales(headers, rows, incluyeCelularRaw === 'true');
    } else {
      resultado = calcularMarca(headers, rows);
    }

    // totalFilas = promotores ÚNICOS (ya deduplicados por USUARIO dentro del cálculo), no filas crudas del archivo.
    const totalFilas = resultado.filas.length;
    const universoUsado = universoManual ?? totalFilas;
    const porcentaje = universoUsado > 0 ? Math.round((resultado.cumplieron / universoUsado) * 10000) / 100 : 0;

    return NextResponse.json({
      totalFilas,
      cumplieron: resultado.cumplieron,
      universoUsado,
      universoEsManual: universoManual !== null,
      porcentaje,
      filas: resultado.filas,
    });
  } catch (err) {
    if (err instanceof ColumnasFaltantesError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : 'No se pudo leer el archivo.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
