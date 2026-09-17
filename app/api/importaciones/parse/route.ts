import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { parseSpreadsheet } from '@/lib/importaciones';

export const dynamic = 'force-dynamic';

// POST /api/importaciones/parse — sube el archivo de Aspel (.xlsx/.xlsm/.csv)
// y devuelve encabezados + todas las filas de datos ya normalizadas a texto.
// No depende de un formato de columnas fijo: solo asume que la primera fila
// con contenido es el encabezado.
export async function POST(request: Request) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Sube un archivo .xlsx o .csv.' }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const { headers, rows } = await parseSpreadsheet(buffer, file.name);
    return NextResponse.json({ headers, rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudo leer el archivo.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
