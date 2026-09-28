import ExcelJS from 'exceljs';
import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { esPeriodoValido, fetchDetalleCarga, periodoActual } from '@/lib/emetrix-ponderacion';
import { formatPeriodoLabel } from '@/lib/emetrix-ponderacion-calc';
import { sql } from '@vercel/postgres';
import type { EmetrixEstado, EmetrixKr } from '@/lib/types';

export const dynamic = 'force-dynamic';

const KRS_VALIDOS: EmetrixKr[] = ['mesa_control', 'materiales', 'marca'];
const KR_LABEL: Record<EmetrixKr, string> = {
  mesa_control: 'Mesa de Control',
  materiales: 'Materiales',
  marca: 'Marca',
};
const ESTADO_LABEL: Record<EmetrixEstado, string> = {
  cumple: 'Cumple',
  no_cumple: 'No cumple',
  no_contesto: 'No contestó',
};

// GET /api/emetrix-ponderacion/detalle/excel?marcaId=...&kr=...&periodo=YYYY-MM
// — descarga en .xlsx el detalle por promotor de la carga más reciente de
// ese KR EN ESE PERIODO. Si la carga usó el padrón como universo, agrega una
// segunda hoja con los USUARIO del Excel que no se pudieron cruzar (para
// corregir el padrón). `periodo` default al mes actual si no se manda.
export async function GET(request: Request) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  const url = new URL(request.url);
  const marcaId = url.searchParams.get('marcaId');
  const kr = url.searchParams.get('kr');
  if (!marcaId || !kr || !KRS_VALIDOS.includes(kr as EmetrixKr)) {
    return NextResponse.json({ error: 'Faltan marcaId y kr, o kr es inválido.' }, { status: 400 });
  }
  const periodo = url.searchParams.get('periodo') ?? periodoActual();
  if (!esPeriodoValido(periodo)) {
    return NextResponse.json({ error: 'periodo inválido (debe tener formato YYYY-MM).' }, { status: 400 });
  }

  const detalle = await fetchDetalleCarga(marcaId, kr as EmetrixKr, periodo);
  if (!detalle) {
    return NextResponse.json({ error: 'Esta cuenta todavía no tiene una carga de ese KR en este periodo.' }, { status: 404 });
  }

  const { rows: marcaRows } = await sql.query('select nombre from marcas where id = $1', [marcaId]);
  const marcaNombre = (marcaRows[0]?.nombre as string | undefined) ?? 'cuenta';

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(KR_LABEL[kr as EmetrixKr]);
  sheet.columns = [
    { header: 'Usuario', key: 'usuario', width: 45 },
    { header: 'Posición', key: 'posicion', width: 18 },
    { header: 'Estado', key: 'estado', width: 14 },
    { header: 'Detalle', key: 'detalle', width: 45 },
  ];
  sheet.getRow(1).font = { bold: true };
  for (const f of detalle.filas) {
    sheet.addRow({ usuario: f.usuario, posicion: f.posicion, estado: ESTADO_LABEL[f.estado], detalle: f.detalleFalla ?? '' });
  }

  if (detalle.universoFuente === 'padron' && detalle.usuariosNoEncontrados.length > 0) {
    const sheetNoEnc = workbook.addWorksheet('No encontrados en padrón');
    sheetNoEnc.columns = [{ header: 'USUARIO en el Excel (sin match en el padrón)', key: 'usuario', width: 55 }];
    sheetNoEnc.getRow(1).font = { bold: true };
    for (const usuario of detalle.usuariosNoEncontrados) {
      sheetNoEnc.addRow({ usuario });
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const nombreArchivo = `${marcaNombre} - ${KR_LABEL[kr as EmetrixKr]} - ${formatPeriodoLabel(periodo)}.xlsx`.replace(/[\\/:*?"<>|]/g, '_');

  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nombreArchivo}"`,
    },
  });
}
