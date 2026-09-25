import ExcelJS from 'exceljs';
import { NextResponse } from 'next/server';
import { requireGerente } from '@/lib/auth';
import { fetchDetalleCarga } from '@/lib/emetrix-ponderacion';
import { sql } from '@vercel/postgres';
import type { EmetrixKr } from '@/lib/types';

export const dynamic = 'force-dynamic';

const KRS_VALIDOS: EmetrixKr[] = ['mesa_control', 'materiales', 'marca'];
const KR_LABEL: Record<EmetrixKr, string> = {
  mesa_control: 'Mesa de Control',
  materiales: 'Materiales',
  marca: 'Marca',
};

// GET /api/emetrix-ponderacion/detalle/excel?marcaId=...&kr=... — descarga
// en .xlsx el detalle por promotor de la carga más reciente de ese KR.
export async function GET(request: Request) {
  const auth = await requireGerente();
  if (auth.error) return auth.error;

  const url = new URL(request.url);
  const marcaId = url.searchParams.get('marcaId');
  const kr = url.searchParams.get('kr');
  if (!marcaId || !kr || !KRS_VALIDOS.includes(kr as EmetrixKr)) {
    return NextResponse.json({ error: 'Faltan marcaId y kr, o kr es inválido.' }, { status: 400 });
  }

  const detalle = await fetchDetalleCarga(marcaId, kr as EmetrixKr);
  if (!detalle) {
    return NextResponse.json({ error: 'Esta cuenta todavía no tiene una carga de ese KR.' }, { status: 404 });
  }

  const { rows: marcaRows } = await sql.query('select nombre from marcas where id = $1', [marcaId]);
  const marcaNombre = (marcaRows[0]?.nombre as string | undefined) ?? 'cuenta';

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(KR_LABEL[kr as EmetrixKr]);
  sheet.columns = [
    { header: 'Usuario', key: 'usuario', width: 45 },
    { header: 'Posición', key: 'posicion', width: 18 },
    { header: 'Cumple', key: 'cumple', width: 10 },
    { header: 'Detalle', key: 'detalle', width: 45 },
  ];
  sheet.getRow(1).font = { bold: true };
  for (const f of detalle.filas) {
    sheet.addRow({ usuario: f.usuario, posicion: f.posicion, cumple: f.cumple ? 'Sí' : 'No', detalle: f.detalleFalla ?? '' });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const nombreArchivo = `${marcaNombre} - ${KR_LABEL[kr as EmetrixKr]}.xlsx`.replace(/[\\/:*?"<>|]/g, '_');

  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nombreArchivo}"`,
    },
  });
}
