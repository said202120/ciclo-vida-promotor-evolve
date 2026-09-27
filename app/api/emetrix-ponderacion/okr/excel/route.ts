import ExcelJS from 'exceljs';
import { NextResponse } from 'next/server';
import { requireGerente } from '@/lib/auth';
import { aplanarArbolOkr, fetchResultadoOkrTodasCuentas } from '@/lib/emetrix-ponderacion';

export const dynamic = 'force-dynamic';

const NIVEL_LABEL = { okr: 'OKR', kr: 'KR', kpi: 'KPI' } as const;

function nombreHoja(marcaNombre: string, usados: Set<string>): string {
  let base = marcaNombre.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || 'Cuenta';
  let nombre = base;
  let i = 2;
  while (usados.has(nombre.toLowerCase())) {
    const sufijo = ` (${i})`;
    nombre = base.slice(0, 31 - sufijo.length) + sufijo;
    i++;
  }
  usados.add(nombre.toLowerCase());
  return nombre;
}

// GET /api/emetrix-ponderacion/okr/excel — "Descargar para OKR": un .xlsx con
// una hoja por cuenta cargada, mismas columnas que el archivo oficial de
// Carlos (Nivel, Código, Área, Nombre, Descripción, Capa, Owner, Peso (%),
// % Obtenido, Fuente).
export async function GET() {
  const auth = await requireGerente();
  if (auth.error) return auth.error;

  const cuentas = await fetchResultadoOkrTodasCuentas();

  const workbook = new ExcelJS.Workbook();
  const nombresUsados = new Set<string>();

  if (cuentas.length === 0) {
    workbook.addWorksheet('Sin cargas');
  }

  for (const cuenta of cuentas) {
    const sheet = workbook.addWorksheet(nombreHoja(cuenta.marcaNombre, nombresUsados));
    sheet.columns = [
      { header: 'Nivel', key: 'nivel', width: 8 },
      { header: 'Código', key: 'codigo', width: 10 },
      { header: 'Área', key: 'area', width: 14 },
      { header: 'Nombre', key: 'nombre', width: 42 },
      { header: 'Descripción', key: 'descripcion', width: 55 },
      { header: 'Capa', key: 'capa', width: 12 },
      { header: 'Owner', key: 'owner', width: 16 },
      { header: 'Peso (%)', key: 'peso', width: 10 },
      { header: '% Obtenido', key: 'obtenido', width: 14 },
      { header: 'Fuente', key: 'fuente', width: 55 },
    ];
    sheet.getRow(1).font = { bold: true };

    for (const nodo of aplanarArbolOkr(cuenta.raiz)) {
      const row = sheet.addRow({
        nivel: NIVEL_LABEL[nodo.nivel],
        codigo: nodo.codigo,
        area: nodo.area,
        nombre: nodo.nombre,
        descripcion: nodo.descripcion,
        capa: nodo.capa,
        owner: nodo.owner,
        peso: nodo.peso / 100,
        obtenido: nodo.porcentaje !== null ? nodo.porcentaje / 100 : nodo.pendienteTexto ?? 'Pendiente',
        fuente: nodo.calculadoNota ? `${nodo.fuente} (${nodo.calculadoNota})` : nodo.fuente,
      });
      row.getCell('peso').numFmt = '0%';
      if (nodo.porcentaje !== null) row.getCell('obtenido').numFmt = '0.00%';
      if (nodo.nivel !== 'kpi') row.font = { bold: true };
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="OKR Ciclo de vida del promotor.xlsx"',
    },
  });
}
