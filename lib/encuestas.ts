// Encuesta pública de verificación de nuevo ingreso (/e/{codigo}, sin login)
// y la vista de comparación sistema-vs-promotor que alimenta.
//
// Separación de datos a propósito: lo que el promotor contesta aquí NUNCA
// sobreescribe carta/usuario/contrato/imss/promotor_materiales — esos siguen
// siendo el dato "oficial" (Aspel/mesa_control/nómina/padrón). Las respuestas
// del promotor se guardan aparte, en encuestas_respuestas /
// encuesta_materiales_respuestas, precisamente para poder comparar ambos
// lados en fetchComparacionIngresos().

import crypto from 'node:crypto';
import { sql } from '@vercel/postgres';
import type {
  ComparacionIngreso,
  ComparacionMaterial,
  EncuestaPublica,
  EncuestaRespuestaPayload,
} from './types';

// La encuesta solo pregunta por este subconjunto del catálogo de 13 artículos.
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

/** Devuelve el código existente del promotor o crea uno nuevo (reintenta si hay colisión, rarísimo). */
export async function getOrCreateEncuestaLink(promotorId: string): Promise<string> {
  const { rows } = await sql.query('select codigo from encuestas_links where promotor_id = $1', [promotorId]);
  if (rows[0]) return rows[0].codigo as string;

  for (let intento = 0; intento < 5; intento++) {
    const codigo = crypto.randomBytes(9).toString('base64url');
    try {
      await sql.query('insert into encuestas_links (promotor_id, codigo) values ($1, $2)', [promotorId, codigo]);
      return codigo;
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && err.code === '23505') continue; // choque de código, reintenta
      throw err;
    }
  }
  throw new Error('No se pudo generar un código único para la encuesta.');
}

/** Datos para pintar la encuesta pública: promotor + lo que ya haya contestado antes, si algo. */
export async function fetchEncuestaPorCodigo(codigo: string): Promise<EncuestaPublica | null> {
  const { rows } = await sql.query(
    `select l.promotor_id, p.nombre, p.marca, p.puesto
     from encuestas_links l
     join promotores p on p.id = l.promotor_id
     where l.codigo = $1`,
    [codigo]
  );
  const row = rows[0];
  if (!row) return null;

  const promotorId = row.promotor_id as string;

  const [{ rows: respRows }, { rows: matRows }] = await Promise.all([
    sql.query('select * from encuestas_respuestas where promotor_id = $1', [promotorId]),
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
    fechaEntregaComunicada: resp ? (resp.fecha_entrega_comunicada as boolean | null) : null,
    materiales: matRows.map((m) => ({
      materialId: m.id as string,
      nombre: m.nombre as string,
      recibido: m.recibido as boolean,
    })),
  };
}

/**
 * Guarda la respuesta del promotor. Bloque 1 (marca/puesto) sí se escribe
 * directo en promotores — así lo pidió el flujo. Bloques 2 y 3 se guardan
 * aparte, en encuestas_respuestas / encuesta_materiales_respuestas, sin
 * tocar carta/usuario/contrato/imss/promotor_materiales.
 * Regresa false si el código no existe (link inválido).
 */
export async function guardarRespuestaEncuesta(codigo: string, payload: EncuestaRespuestaPayload): Promise<boolean> {
  const { rows } = await sql.query('select promotor_id from encuestas_links where codigo = $1', [codigo]);
  const promotorId = rows[0]?.promotor_id as string | undefined;
  if (!promotorId) return false;

  await sql.query('update promotores set marca = $1, puesto = $2 where id = $3', [
    payload.marca,
    payload.puesto,
    promotorId,
  ]);

  const { rows: upsertRows } = await sql.query(
    `insert into encuestas_respuestas (
       promotor_id, contrato_reportado, imss_reportado, carta_reportada,
       credencial_reportada, usuario_emetrix_reportado, fecha_entrega_comunicada, respondida_en
     ) values ($1, $2, $3, $4, $5, $6, $7, now())
     on conflict (promotor_id) do update set
       contrato_reportado = excluded.contrato_reportado,
       imss_reportado = excluded.imss_reportado,
       carta_reportada = excluded.carta_reportada,
       credencial_reportada = excluded.credencial_reportada,
       usuario_emetrix_reportado = excluded.usuario_emetrix_reportado,
       fecha_entrega_comunicada = excluded.fecha_entrega_comunicada,
       respondida_en = excluded.respondida_en
     returning id`,
    [
      promotorId,
      payload.contratoReportado,
      payload.imssReportado,
      payload.cartaReportada,
      payload.credencialReportada,
      payload.usuarioEmetrixReportado,
      payload.fechaEntregaComunicada,
    ]
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

  await sql.query('update encuestas_links set usado_en = coalesce(usado_en, now()) where codigo = $1', [codigo]);

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
