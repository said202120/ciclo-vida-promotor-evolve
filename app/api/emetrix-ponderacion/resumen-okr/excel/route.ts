import ExcelJS from 'exceljs';
import { NextResponse } from 'next/server';
import { requireGerente } from '@/lib/auth';
import { fetchResumenOkr } from '@/lib/emetrix-ponderacion';

export const dynamic = 'force-dynamic';

// GET /api/emetrix-ponderacion/resumen-okr/excel?marcaId=... — descarga en
// .xlsx el "Resumen para OKR" de esta cuenta.
export async function GET(request: Request) {
  const auth = await requireGerente();
  if (auth.error) return auth.error;

  const marcaId = new URL(request.url).searchParams.get('marcaId');
  if (!marcaId) {
    return NextResponse.json({ error: 'Falta marcaId.' }, { status: 400 });
  }

  const resumen = await fetchResumenOkr(marcaId);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Resumen OKR');
  sheet.columns = [
    { header: 'KR', key: 'etiqueta', width: 40 },
    { header: 'Valor', key: 'valor', width: 30 },
  ];
  sheet.getRow(1).font = { bold: true };
  for (const fila of resumen.filas) {
    sheet.addRow({ etiqueta: fila.etiqueta, valor: fila.valor });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const nombreArchivo = `${resumen.marcaNombre} - Resumen OKR.xlsx`.replace(/[\\/:*?"<>|]/g, '_');

  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nombreArchivo}"`,
    },
  });
}
