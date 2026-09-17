// Dos encuestas públicas de verificación de nuevo ingreso, sin login, cada
// una con su propio link independiente por promotor:
//   - "Mesa de Control" (/e/{codigo}, tipo='mesa_control'): bloques 1 y 2
//     (datos generales + administrativo).
//   - "Materiales" (/m/{codigo}, tipo='materiales'): pregunta de visibilidad
//     de fecha de entrega + checklist opcional de los 10 artículos.
// Alimentan la vista de comparación sistema-vs-promotor.
//
// Separación de datos a propósito: lo que el promotor contesta aquí NUNCA
// sobreescribe carta/usuario/contrato/imss/promotor_materiales — esos siguen
// siendo el dato "oficial" (Aspel/mesa_control/nómina/padrón). Las respuestas
// del promotor se guardan aparte, en encuestas_respuestas /
// encuesta_materiales_respuestas. Las dos encuestas comparten la fila de
// encuestas_respuestas pero cada una solo toca sus propias columnas — nunca
// las de la otra (ver los UPDATE SET de cada función de guardado abajo).

import crypto from 'node:crypto';
import { sql } from '@vercel/postgres';
import type {
  ComparacionIngreso,
  ComparacionMaterial,
  EncuestaMaterialesPayload,
  EncuestaMaterialesPublica,
  EncuestaPublica,
  EncuestaRespuestaPayload,
} from './types';

export type EncuestaTipo = 'mesa_control' | 'materiales';

// La encuesta de materiales solo pregunta por este subconjunto del catálogo de 13 artículos.
export const MATERIALES_ENCUESTA = [
  'Equipo celular',
  'Línea corporativa',
  'Franela Metro',
  'Cortadores',
  'Navajas',
  'Botas Van Vien',
  'Cintas',
  'Guantes',
  'Faja',
  'Marcador Delgado',
];

/** Devuelve el código existente del promotor para esa encuesta, o crea uno nuevo (reintenta si hay colisión, rarísimo). */
export async function getOrCreateEncuestaLink(promotorId: string, tipo: EncuestaTipo): Promise<string> {
  const { rows } = await sql.query('select codigo from encuestas_links where promotor_id = $1 and tipo = $2', [
    promotorId,
    tipo,
  ]);
  if (rows[0]) return rows[0].codigo as string;

  for (let intento = 0; intento < 5; intento++) {
    const codigo = crypto.randomBytes(9).toString('base64url');
    try {
      await sql.query('insert into encuestas_links (promotor_id, codigo, tipo) values ($1, $2, $3)', [
        promotorId,
        codigo,
        tipo,
      ]);
      return codigo;
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && err.code === '23505') continue; // choque de código, reintenta
      throw err;
    }
  }
  throw new Error('No se pudo generar un código único para la encuesta.');
}

/** Datos para pintar la encuesta pública "Mesa de Control": promotor + lo que ya haya contestado antes, si algo. */
export async function fetchEncuestaPorCodigo(codigo: string): Promise<EncuestaPublica | null> {
  const { rows } = await sql.query(
    `select l.promotor_id, p.nombre, p.marca, p.puesto
     from encuestas_links l
     join promotores p on p.id = l.promotor_id
     where l.codigo = $1 and l.tipo = 'mesa_control'`,
    [codigo]
  );
  const row = rows[0];
  if (!row) return null;

  const { rows: respRows } = await sql.query('select * from encuestas_respuestas where promotor_id = $1', [
    row.promotor_id,
  ]);
  const resp = respRows[0];

  return {
    promotorNombre: row.nombre as string,
    marca: (row.marca as string | null) ?? '',
    puesto: (row.puesto as string | null) ?? '',
    contratoReportado: resp ? (resp.contrato_reportado as boolean | null) : null,
    imssReportado: resp ? (resp.imss_reportado as boolean | null) : null,
    cartaReportada: resp ? (resp.carta_reportada as boolean | null) : null,
    credencialReportada: resp ? (resp.credencial_reportada as boolean | null) : null,
    usuarioEmetrixReportado: resp ? (resp.usuario_emetrix_reportado as boolean | null) : null,
  };
}

/**
 * Guarda la respuesta de la encuesta "Mesa de Control". Marca/puesto sí se
 * escriben directo en promotores. El resto (contrato/imss/carta/credencial/
 * usuario Emetrix reportados) se guarda aparte, en encuestas_respuestas —
 * sin tocar fecha_entrega_comunicada ni materiales_respondida_en, que son de
 * la otra encuesta. Regresa false si el código no existe o no es de este tipo.
 */
export async function guardarRespuestaEncuesta(codigo: string, payload: EncuestaRespuestaPayload): Promise<boolean> {
  const { rows } = await sql.query("select promotor_id from encuestas_links where codigo = $1 and tipo = 'mesa_control'", [
    codigo,
  ]);
  const promotorId = rows[0]?.promotor_id as string | undefined;
  if (!promotorId) return false;

  await sql.query('update promotores set marca = $1, puesto = $2 where id = $3', [
    payload.marca,
    payload.puesto,
    promotorId,
  ]);

  await sql.query(
    `insert into encuestas_respuestas (
       promotor_id, contrato_reportado, imss_reportado, carta_reportada,
       credencial_reportada, usuario_emetrix_reportado, respondida_en
     ) values ($1, $2, $3, $4, $5, $6, now())
     on conflict (promotor_id) do update set
       contrato_reportado = excluded.contrato_reportado,
       imss_reportado = excluded.imss_reportado,
       carta_reportada = excluded.carta_reportada,
       credencial_reportada = excluded.credencial_reportada,
       usuario_emetrix_reportado = excluded.usuario_emetrix_reportado,
       respondida_en = excluded.respondida_en`,
    [
      promotorId,
      payload.contratoReportado,
      payload.imssReportado,
      payload.cartaReportada,
      payload.credencialReportada,
      payload.usuarioEmetrixReportado,
    ]
  );

  await sql.query("update encuestas_links set usado_en = coalesce(usado_en, now()) where codigo = $1 and tipo = 'mesa_control'", [
    codigo,
  ]);

  return true;
}

/** Datos para pintar la encuesta pública "Materiales": promotor + lo que ya haya contestado antes, si algo. */
export async function fetchEncuestaMaterialesPorCodigo(codigo: string): Promise<EncuestaMaterialesPublica | null> {
  const { rows } = await sql.query(
    `select l.promotor_id, p.nombre
     from encuestas_links l
     join promotores p on p.id = l.promotor_id
     where l.codigo = $1 and l.tipo = 'materiales'`,
    [codigo]
  );
  const row = rows[0];
  if (!row) return null;

  const promotorId = row.promotor_id as string;

  const [{ rows: respRows }, { rows: matRows }] = await Promise.all([
    sql.query('select fecha_entrega_comunicada from encuestas_respuestas where promotor_id = $1', [promotorId]),
    sql.query(
      `select mc.id, mc.nombre, coalesce(emr.recibido, false) as recibido
       from materiales_catalogo mc
       left join encuestas_respuestas er on er.promotor_id = $1
       left join encuesta_materiales_respuestas emr
         on emr.material_id = mc.id and emr.encuesta_respuesta_id = er.id
       where mc.nombre = any($2::text[])
       order by mc.orden`,
      [promotorId, MATERIALES_ENCUESTA]
    ),
  ]);

  return {
    promotorNombre: row.nombre as string,
    fechaEntregaComunicada: (respRows[0]?.fecha_entrega_comunicada as boolean | null) ?? null,
    materiales: matRows.map((m) => ({
      materialId: m.id as string,
      nombre: m.nombre as string,
      recibido: m.recibido as boolean,
    })),
  };
}

/**
 * Guarda la respuesta de la encuesta "Materiales". Solo toca
 * fecha_entrega_comunicada / materiales_respondida_en y el checklist —
 * nunca los campos de la encuesta "Mesa de Control". El checklist es
 * opcional (puede venir vacío); la pregunta de visibilidad no. Regresa
 * false si el código no existe o no es de este tipo.
 */
export async function guardarRespuestaMateriales(
  codigo: string,
  payload: EncuestaMaterialesPayload
): Promise<boolean> {
  const { rows } = await sql.query("select promotor_id from encuestas_links where codigo = $1 and tipo = 'materiales'", [
    codigo,
  ]);
  const promotorId = rows[0]?.promotor_id as string | undefined;
  if (!promotorId) return false;

  const { rows: upsertRows } = await sql.query(
    `insert into encuestas_respuestas (promotor_id, fecha_entrega_comunicada, materiales_respondida_en)
     values ($1, $2, now())
     on conflict (promotor_id) do update set
       fecha_entrega_comunicada = excluded.fecha_entrega_comunicada,
       materiales_respondida_en = excluded.materiales_respondida_en
     returning id`,
    [promotorId, payload.fechaEntregaComunicada]
  );
  const encuestaId = upsertRows[0].id as string;

  const { rows: catalogoRows } = await sql.query(
    'select id from materiales_catalogo where nombre = any($1::text[])',
    [MATERIALES_ENCUESTA]
  );
  const idsValidos = new Set(catalogoRows.map((r) => r.id as string));
  const recibidos = new Set(payload.materiales.filter((id) => idsValidos.has(id)));

  for (const row of catalogoRows) {
    const materialId = row.id as string;
    await sql.query(
      `insert into encuesta_materiales_respuestas (encuesta_respuesta_id, material_id, recibido)
       values ($1, $2, $3)
       on conflict (encuesta_respuesta_id, material_id) do update set recibido = excluded.recibido`,
      [encuestaId, materialId, recibidos.has(materialId)]
    );
  }

  await sql.query("update encuestas_links set usado_en = coalesce(usado_en, now()) where codigo = $1 and tipo = 'materiales'", [
    codigo,
  ]);

  return true;
}

/** Sistema vs. promotor para los nuevos ingresos del mes — mismo criterio de cohorte que el resto del sistema. */
export async function fetchComparacionIngresos(mes: string): Promise<ComparacionIngreso[]> {
  const [{ rows: baseRows }, { rows: matRows }] = await Promise.all([
    sql.query(
      `select
         p.id, p.nombre, to_char(p.fecha_ingreso, 'YYYY-MM-DD') as fecha_ingreso,
         p.contrato, p.imss, p.carta, p.usuario,
         er.contrato_reportado, er.imss_reportado, er.carta_reportada,
         er.credencial_reportada, er.usuario_emetrix_reportado, er.fecha_entrega_comunicada,
         er.respondida_en
       from promotores p
       left join encuestas_respuestas er on er.promotor_id = p.id
       where to_char(p.fecha_ingreso, 'YYYY-MM') = $1
       order by p.fecha_ingreso, p.nombre`,
      [mes]
    ),
    sql.query(
      `select p.id as promotor_id, mc.nombre, mc.orden,
              coalesce(pm.entregado, false) as sistema,
              emr.recibido as promotor
       from promotores p
       cross join materiales_catalogo mc
       left join promotor_materiales pm on pm.promotor_id = p.id and pm.material_id = mc.id
       left join encuestas_respuestas er on er.promotor_id = p.id
       left join encuesta_materiales_respuestas emr on emr.encuesta_respuesta_id = er.id and emr.material_id = mc.id
       where to_char(p.fecha_ingreso, 'YYYY-MM') = $1
         and mc.nombre = any($2::text[])
       order by p.id, mc.orden`,
      [mes, MATERIALES_ENCUESTA]
    ),
  ]);

  const materialesPorPromotor = new Map<string, ComparacionMaterial[]>();
  for (const m of matRows) {
    const promotorId = m.promotor_id as string;
    const lista = materialesPorPromotor.get(promotorId) ?? [];
    lista.push({
      nombre: m.nombre as string,
      sistema: m.sistema as boolean,
      promotor: (m.promotor as boolean | null) ?? null,
    });
    materialesPorPromotor.set(promotorId, lista);
  }

  return baseRows.map((r) => {
    const respondio = r.respondida_en !== null;
    return {
      promotorId: r.id as string,
      nombre: r.nombre as string,
      fechaIngreso: (r.fecha_ingreso as string | null) ?? null,
      respondioEncuesta: respondio,
      respondidaEn: r.respondida_en ? new Date(r.respondida_en as string).toISOString() : null,
      contrato: { sistema: r.contrato as boolean, promotor: (r.contrato_reportado as boolean | null) ?? null },
      imss: { sistema: r.imss as boolean, promotor: (r.imss_reportado as boolean | null) ?? null },
      carta: { sistema: r.carta as boolean, promotor: (r.carta_reportada as boolean | null) ?? null },
      usuarioEmetrix: { sistema: r.usuario as boolean, promotor: (r.usuario_emetrix_reportado as boolean | null) ?? null },
      credencial: { sistema: null, promotor: (r.credencial_reportada as boolean | null) ?? null },
      fechaEntregaComunicada: { sistema: null, promotor: (r.fecha_entrega_comunicada as boolean | null) ?? null },
      materiales: materialesPorPromotor.get(r.id as string) ?? [],
    };
  });
}

/**
 * Para el KPI 2.1 ("% con materiales entregados dentro del calendario
 * comprometido"): por promotor, si ya contestó la encuesta de MATERIALES y,
 * de los 10 artículos de MATERIALES_ENCUESTA, sistema (promotor_materiales)
 * Y la respuesta del promotor coinciden en que sí lo recibió en TODOS. null
 * si el promotor todavía no contesta esa encuesta — ese caso se excluye del
 * KPI (ni cumple ni no cumple) hasta que lo haga.
 */
export async function fetchMaterialesVerificados(): Promise<Map<string, boolean | null>> {
  const { rows } = await sql.query(
    `select
       p.id as promotor_id,
       (er.materiales_respondida_en is not null) as respondio,
       bool_and(coalesce(pm.entregado, false) and coalesce(emr.recibido, false)) as cumple
     from promotores p
     cross join materiales_catalogo mc
     left join promotor_materiales pm on pm.promotor_id = p.id and pm.material_id = mc.id
     left join encuestas_respuestas er on er.promotor_id = p.id
     left join encuesta_materiales_respuestas emr on emr.encuesta_respuesta_id = er.id and emr.material_id = mc.id
     where mc.nombre = any($1::text[])
     group by p.id, er.materiales_respondida_en`,
    [MATERIALES_ENCUESTA]
  );

  const resultado = new Map<string, boolean | null>();
  for (const row of rows) {
    const promotorId = row.promotor_id as string;
    const respondio = row.respondio as boolean;
    resultado.set(promotorId, respondio ? (row.cumple as boolean) : null);
  }
  return resultado;
}

/**
 * Para el indicador temprano "% con visibilidad de fecha de entrega de
 * materiales": por promotor, su respuesta a esa pregunta en la encuesta de
 * Materiales. null si todavía no contesta esa encuesta.
 */
export async function fetchVisibilidadMateriales(): Promise<Map<string, boolean | null>> {
  const { rows } = await sql.query(
    'select promotor_id, fecha_entrega_comunicada, materiales_respondida_en from encuestas_respuestas'
  );

  const resultado = new Map<string, boolean | null>();
  for (const row of rows) {
    const promotorId = row.promotor_id as string;
    const respondio = row.materiales_respondida_en !== null;
    resultado.set(promotorId, respondio ? (row.fecha_entrega_comunicada as boolean | null) : null);
  }
  return resultado;
}
