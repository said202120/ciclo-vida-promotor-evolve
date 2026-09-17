// Exámenes de capacitación por contenido (Módulo 1 "Compañía", y los que le
// sigan) — distinto de las casillas mod1/mod3/mod6/mod12 del padrón, que son
// checkboxes de antigüedad, no de contenido. Contenido administrado desde
// /capacitaciones (solo gerente); el promotor lo presenta sin login en
// /q/{codigo}, con reintentos ilimitados (cada envío nuevo sobreescribe el
// resultado anterior de ese módulo). "orden" define la secuencia de
// desbloqueo: un módulo con orden=N solo se puede presentar si el promotor
// ya aprobó el de orden=N-1.

import crypto from 'node:crypto';
import { sql } from '@vercel/postgres';
import type {
  CapacitacionModulo,
  CapacitacionModuloConPreguntas,
  CapacitacionOpcionPublica,
  CapacitacionPregunta,
  CapacitacionPreguntaPublica,
  CapacitacionPreguntaTipo,
  CapacitacionPublica,
  CapacitacionResultado,
} from './types';

const SIN_SUPERVISOR_MSG =
  'Todavía no tienes un supervisor asignado en el padrón. Pide a tu ejecutivo que te lo asigne antes de presentar este examen.';

function shuffle<T>(arr: T[]): T[] {
  const copia = [...arr];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

function rowToModulo(row: { id: string; orden: number; nombre: string; descripcion: string | null; umbral_aprobacion: number }): CapacitacionModulo {
  return {
    id: row.id,
    orden: row.orden,
    nombre: row.nombre,
    descripcion: row.descripcion,
    umbralAprobacion: row.umbral_aprobacion,
  };
}

/** Lista básica (sin preguntas) para el padrón: qué módulos existen y su umbral. */
export async function fetchCapacitacionModulosBasico(): Promise<CapacitacionModulo[]> {
  const { rows } = await sql.query(
    'select id, orden, nombre, descripcion, umbral_aprobacion from capacitacion_modulos order by orden'
  );
  return rows.map(rowToModulo);
}

/** Vista completa para /capacitaciones (solo gerente): módulos, preguntas y opciones, incluida cuál es la correcta. */
export async function fetchCapacitacionModulosConPreguntas(): Promise<CapacitacionModuloConPreguntas[]> {
  const [{ rows: modRows }, { rows: pregRows }, { rows: opcRows }] = await Promise.all([
    sql.query('select id, orden, nombre, descripcion, umbral_aprobacion from capacitacion_modulos order by orden'),
    sql.query('select id, modulo_id, texto, tipo from capacitacion_preguntas order by orden, created_at'),
    sql.query(
      `select o.id, o.pregunta_id, o.texto, o.correcta
       from capacitacion_opciones o
       order by o.orden, o.created_at`
    ),
  ]);

  const opcionesPorPregunta = new Map<string, CapacitacionModuloConPreguntas['preguntas'][number]['opciones']>();
  for (const o of opcRows) {
    const preguntaId = o.pregunta_id as string;
    const lista = opcionesPorPregunta.get(preguntaId) ?? [];
    lista.push({ id: o.id as string, texto: o.texto as string, correcta: o.correcta as boolean });
    opcionesPorPregunta.set(preguntaId, lista);
  }

  const preguntasPorModulo = new Map<string, CapacitacionPregunta[]>();
  for (const p of pregRows) {
    const moduloId = p.modulo_id as string;
    const lista = preguntasPorModulo.get(moduloId) ?? [];
    lista.push({
      id: p.id as string,
      texto: p.texto as string,
      tipo: p.tipo as CapacitacionPreguntaTipo,
      opciones: opcionesPorPregunta.get(p.id as string) ?? [],
    });
    preguntasPorModulo.set(moduloId, lista);
  }

  return modRows.map((m) => ({
    ...rowToModulo(m as { id: string; orden: number; nombre: string; descripcion: string | null; umbral_aprobacion: number }),
    preguntas: preguntasPorModulo.get(m.id as string) ?? [],
  }));
}

/** Resultado más reciente por promotor y módulo, para el badge de estatus en el padrón. */
export async function fetchCapacitacionResultados(): Promise<Array<{ promotorId: string } & CapacitacionResultado>> {
  const { rows } = await sql.query('select promotor_id, modulo_id, calificacion, aprobado from capacitacion_resultados');
  return rows.map((r) => ({
    promotorId: r.promotor_id as string,
    moduloId: r.modulo_id as string,
    calificacion: Number(r.calificacion),
    aprobado: r.aprobado as boolean,
  }));
}

export async function createCapacitacionModulo(nombre: string, descripcion: string | null): Promise<CapacitacionModulo> {
  const { rows } = await sql.query(
    `insert into capacitacion_modulos (orden, nombre, descripcion)
     values (coalesce((select max(orden) + 1 from capacitacion_modulos), 1), $1, $2)
     returning id, orden, nombre, descripcion, umbral_aprobacion`,
    [nombre, descripcion]
  );
  return rowToModulo(rows[0] as { id: string; orden: number; nombre: string; descripcion: string | null; umbral_aprobacion: number });
}

export async function updateCapacitacionModulo(
  id: string,
  patch: { nombre?: string; descripcion?: string | null; umbralAprobacion?: number }
): Promise<void> {
  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  if (patch.nombre !== undefined) {
    sets.push(`nombre = $${i++}`);
    values.push(patch.nombre);
  }
  if (patch.descripcion !== undefined) {
    sets.push(`descripcion = $${i++}`);
    values.push(patch.descripcion);
  }
  if (patch.umbralAprobacion !== undefined) {
    sets.push(`umbral_aprobacion = $${i++}`);
    values.push(patch.umbralAprobacion);
  }
  if (sets.length === 0) return;
  values.push(id);
  await sql.query(`update capacitacion_modulos set ${sets.join(', ')} where id = $${i}`, values);
}

export async function deleteCapacitacionModulo(id: string): Promise<void> {
  await sql.query('delete from capacitacion_modulos where id = $1', [id]);
}

export async function createCapacitacionPregunta(
  moduloId: string,
  texto: string,
  tipo: CapacitacionPreguntaTipo = 'texto'
): Promise<CapacitacionPregunta> {
  const { rows } = await sql.query(
    `insert into capacitacion_preguntas (modulo_id, orden, texto, tipo)
     values ($1, coalesce((select max(orden) + 1 from capacitacion_preguntas where modulo_id = $1), 1), $2, $3)
     returning id, texto, tipo`,
    [moduloId, texto, tipo]
  );
  return { id: rows[0].id as string, texto: rows[0].texto as string, tipo: rows[0].tipo as CapacitacionPreguntaTipo, opciones: [] };
}

/** Si `tipo` cambia a uno dinámico, se borran las opciones capturadas a mano (ya no aplican). */
export async function updateCapacitacionPregunta(
  id: string,
  patch: { texto?: string; tipo?: CapacitacionPreguntaTipo }
): Promise<void> {
  if (patch.tipo !== undefined && patch.tipo !== 'texto') {
    await sql.query('delete from capacitacion_opciones where pregunta_id = $1', [id]);
  }
  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  if (patch.texto !== undefined) {
    sets.push(`texto = $${i++}`);
    values.push(patch.texto);
  }
  if (patch.tipo !== undefined) {
    sets.push(`tipo = $${i++}`);
    values.push(patch.tipo);
  }
  if (sets.length === 0) return;
  values.push(id);
  await sql.query(`update capacitacion_preguntas set ${sets.join(', ')} where id = $${i}`, values);
}

export async function deleteCapacitacionPregunta(id: string): Promise<void> {
  await sql.query('delete from capacitacion_preguntas where id = $1', [id]);
}

export async function createCapacitacionOpcion(preguntaId: string, texto: string): Promise<{ id: string; texto: string; correcta: boolean }> {
  const { rows: pregRows } = await sql.query('select tipo from capacitacion_preguntas where id = $1', [preguntaId]);
  if (pregRows[0]?.tipo && pregRows[0].tipo !== 'texto') {
    throw new Error('Esta pregunta usa opciones automáticas; no se pueden agregar a mano.');
  }

  const { rows } = await sql.query(
    `insert into capacitacion_opciones (pregunta_id, orden, texto)
     values ($1, coalesce((select max(orden) + 1 from capacitacion_opciones where pregunta_id = $1), 1), $2)
     returning id, texto, correcta`,
    [preguntaId, texto]
  );
  return { id: rows[0].id as string, texto: rows[0].texto as string, correcta: rows[0].correcta as boolean };
}

export async function updateCapacitacionOpcionTexto(id: string, texto: string): Promise<void> {
  await sql.query('update capacitacion_opciones set texto = $1 where id = $2', [texto, id]);
}

/** Marca esta opción como la correcta y desmarca a las demás de la misma pregunta (una sola correcta por pregunta). */
export async function marcarOpcionCorrecta(preguntaId: string, opcionId: string): Promise<void> {
  await sql.query('update capacitacion_opciones set correcta = (id = $1) where pregunta_id = $2', [opcionId, preguntaId]);
}

export async function deleteCapacitacionOpcion(id: string): Promise<void> {
  await sql.query('delete from capacitacion_opciones where id = $1', [id]);
}

/** Devuelve el código existente del promotor para ese módulo, o crea uno nuevo (reintenta si hay colisión, rarísimo). */
export async function getOrCreateCapacitacionLink(promotorId: string, moduloId: string): Promise<string> {
  const { rows } = await sql.query('select codigo from capacitacion_links where promotor_id = $1 and modulo_id = $2', [
    promotorId,
    moduloId,
  ]);
  if (rows[0]) return rows[0].codigo as string;

  for (let intento = 0; intento < 5; intento++) {
    const codigo = crypto.randomBytes(9).toString('base64url');
    try {
      await sql.query('insert into capacitacion_links (promotor_id, modulo_id, codigo) values ($1, $2, $3)', [
        promotorId,
        moduloId,
        codigo,
      ]);
      return codigo;
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && err.code === '23505') continue; // choque de código, reintenta
      throw err;
    }
  }
  throw new Error('No se pudo generar un código único para el examen.');
}

/**
 * Marca del promotor para las preguntas dinámicas: se deriva de su
 * supervisor_asignado en el padrón (no del campo de texto libre `marca` que
 * llena la encuesta de verificación, que puede no coincidir con el maestro).
 * null si el promotor no tiene supervisor asignado todavía.
 */
async function resolverSupervisorYMarca(
  promotorId: string
): Promise<{ supervisorId: string; supervisorNombre: string; marcaId: string } | null> {
  const { rows } = await sql.query(
    `select p.supervisor_id, s.nombre as supervisor_nombre, s.marca_id
     from promotores p
     join supervisores s on s.id = p.supervisor_id
     where p.id = $1`,
    [promotorId]
  );
  const row = rows[0];
  if (!row) return null;
  return { supervisorId: row.supervisor_id as string, supervisorNombre: row.supervisor_nombre as string, marcaId: row.marca_id as string };
}

/** Opciones dinámicas para "¿Quién es tu supervisor directo?": correcta = su supervisor asignado, distractores = otros supervisores de su misma marca (o de otras si la marca no alcanza). */
async function generarOpcionesSupervisorDirecto(
  promotorId: string
): Promise<{ opciones: CapacitacionOpcionPublica[]; razonBloqueo: string | null }> {
  const contexto = await resolverSupervisorYMarca(promotorId);
  if (!contexto) return { opciones: [], razonBloqueo: SIN_SUPERVISOR_MSG };
  const { supervisorId, supervisorNombre, marcaId } = contexto;

  const { rows: mismaMarca } = await sql.query(
    `select id, nombre from supervisores where marca_id = $1 and id != $2 and nombre != $3 order by random() limit 3`,
    [marcaId, supervisorId, supervisorNombre]
  );
  let distractores = mismaMarca as Array<{ id: string; nombre: string }>;
  if (distractores.length < 3) {
    const excluirIds = [supervisorId, ...distractores.map((d) => d.id)];
    const { rows: otras } = await sql.query(
      `select id, nombre from supervisores where not (id = any($1::uuid[])) and nombre != $2 order by random() limit $3`,
      [excluirIds, supervisorNombre, 3 - distractores.length]
    );
    distractores = [...distractores, ...(otras as Array<{ id: string; nombre: string }>)];
  }

  const opciones = shuffle([
    { id: supervisorId, texto: supervisorNombre },
    ...distractores.map((d) => ({ id: d.id, texto: d.nombre })),
  ]);
  return { opciones, razonBloqueo: null };
}

/** Opciones dinámicas para "¿Quién es tu coordinador/gerente de cuenta?": correctas = ejecutivo(s) de su marca, distractores = ejecutivos de otras marcas. */
async function generarOpcionesCoordinadorCuenta(
  promotorId: string
): Promise<{ opciones: CapacitacionOpcionPublica[]; razonBloqueo: string | null }> {
  const contexto = await resolverSupervisorYMarca(promotorId);
  if (!contexto) return { opciones: [], razonBloqueo: SIN_SUPERVISOR_MSG };
  const { marcaId } = contexto;

  const { rows: correctosRows } = await sql.query('select id, nombre from ejecutivos where marca_id = $1', [marcaId]);
  const correctos = correctosRows as Array<{ id: string; nombre: string }>;
  if (correctos.length === 0) {
    return {
      opciones: [],
      razonBloqueo: 'Tu marca todavía no tiene un coordinador/gerente de cuenta asignado en el maestro. Avisa a tu ejecutivo.',
    };
  }

  const nombresCorrectos = correctos.map((c) => c.nombre);
  const faltan = Math.max(0, 4 - correctos.length);
  let distractores: Array<{ id: string; nombre: string }> = [];
  if (faltan > 0) {
    const { rows: otros } = await sql.query(
      `select id, nombre from ejecutivos where marca_id != $1 and not (nombre = any($2::text[])) order by random() limit $3`,
      [marcaId, nombresCorrectos, faltan]
    );
    distractores = otros as Array<{ id: string; nombre: string }>;
  }

  const opciones = shuffle([
    ...correctos.map((c) => ({ id: c.id, texto: c.nombre })),
    ...distractores.map((d) => ({ id: d.id, texto: d.nombre })),
  ]);
  return { opciones, razonBloqueo: null };
}

/** Datos para pintar el examen público (/q/{codigo}): preguntas sin exponer cuál opción es la correcta. */
export async function fetchCapacitacionPublicaPorCodigo(codigo: string): Promise<CapacitacionPublica | null> {
  const { rows } = await sql.query(
    `select l.promotor_id, l.modulo_id, p.nombre as promotor_nombre,
            m.nombre as modulo_nombre, m.descripcion as modulo_descripcion, m.umbral_aprobacion, m.orden
     from capacitacion_links l
     join promotores p on p.id = l.promotor_id
     join capacitacion_modulos m on m.id = l.modulo_id
     where l.codigo = $1`,
    [codigo]
  );
  const row = rows[0];
  if (!row) return null;

  const promotorId = row.promotor_id as string;
  const moduloId = row.modulo_id as string;
  const orden = row.orden as number;

  let bloqueado = false;
  let razonBloqueo: string | null = null;
  if (orden > 1) {
    const { rows: prevRows } = await sql.query(
      `select m.nombre, cr.aprobado
       from capacitacion_modulos m
       left join capacitacion_resultados cr on cr.modulo_id = m.id and cr.promotor_id = $1
       where m.orden = $2`,
      [promotorId, orden - 1]
    );
    const prev = prevRows[0];
    if (prev && prev.aprobado !== true) {
      bloqueado = true;
      razonBloqueo = `Antes de presentar "${row.modulo_nombre}" necesitas aprobar el módulo "${prev.nombre}". Pide a tu ejecutivo el link de ese módulo.`;
    }
  }

  const { rows: resultRows } = await sql.query(
    'select calificacion, aprobado from capacitacion_resultados where promotor_id = $1 and modulo_id = $2',
    [promotorId, moduloId]
  );
  const resultadoPrevio = resultRows[0]
    ? { calificacion: Number(resultRows[0].calificacion), aprobado: resultRows[0].aprobado as boolean }
    : null;

  let preguntas: CapacitacionPreguntaPublica[] = [];
  if (!bloqueado) {
    const { rows: pregRows } = await sql.query(
      'select id, texto, tipo from capacitacion_preguntas where modulo_id = $1 order by orden, created_at',
      [moduloId]
    );

    const textoIds = pregRows.filter((p) => p.tipo === 'texto').map((p) => p.id as string);
    const opcionesPorPreguntaTexto = new Map<string, CapacitacionOpcionPublica[]>();
    if (textoIds.length > 0) {
      const { rows: opcRows } = await sql.query(
        `select id, pregunta_id, texto from capacitacion_opciones where pregunta_id = any($1::uuid[]) order by orden, created_at`,
        [textoIds]
      );
      for (const o of opcRows) {
        const preguntaId = o.pregunta_id as string;
        const lista = opcionesPorPreguntaTexto.get(preguntaId) ?? [];
        lista.push({ id: o.id as string, texto: o.texto as string });
        opcionesPorPreguntaTexto.set(preguntaId, lista);
      }
    }

    for (const p of pregRows) {
      const tipo = p.tipo as CapacitacionPreguntaTipo;
      if (tipo === 'texto') {
        preguntas.push({ id: p.id as string, texto: p.texto as string, opciones: opcionesPorPreguntaTexto.get(p.id as string) ?? [] });
        continue;
      }
      const generador = tipo === 'supervisor_directo' ? generarOpcionesSupervisorDirecto : generarOpcionesCoordinadorCuenta;
      const resultado = await generador(promotorId);
      if (resultado.razonBloqueo) {
        bloqueado = true;
        razonBloqueo = resultado.razonBloqueo;
        preguntas = [];
        break;
      }
      preguntas.push({ id: p.id as string, texto: p.texto as string, opciones: resultado.opciones });
    }
  }

  return {
    promotorNombre: row.promotor_nombre as string,
    moduloNombre: row.modulo_nombre as string,
    moduloDescripcion: row.modulo_descripcion as string | null,
    umbralAprobacion: row.umbral_aprobacion as number,
    bloqueado,
    razonBloqueo,
    preguntas,
    resultadoPrevio,
  };
}

/** Para no filtrarle a otra ruta si el código no existe: solo promotor_id + modulo_id, o null. */
async function fetchCapacitacionLinkDestino(codigo: string): Promise<{ promotorId: string; moduloId: string } | null> {
  const { rows } = await sql.query('select promotor_id, modulo_id from capacitacion_links where codigo = $1', [codigo]);
  const row = rows[0];
  return row ? { promotorId: row.promotor_id as string, moduloId: row.modulo_id as string } : null;
}

export class RespuestasInvalidasError extends Error {}

/**
 * Califica y guarda el intento. Lanza RespuestasInvalidasError si faltan
 * preguntas por responder o alguna opción no pertenece a su pregunta (el
 * caller debe traducirla a un 400). Devuelve null si el código no existe.
 */
export async function guardarRespuestaCapacitacion(
  codigo: string,
  respuestas: Array<{ preguntaId: string; opcionId: string }>
): Promise<{ calificacion: number; aprobado: boolean; umbralAprobacion: number } | null> {
  const destino = await fetchCapacitacionLinkDestino(codigo);
  if (!destino) return null;
  const { promotorId, moduloId } = destino;

  const { rows: modRows } = await sql.query('select umbral_aprobacion from capacitacion_modulos where id = $1', [moduloId]);
  const umbralAprobacion = modRows[0]?.umbral_aprobacion as number | undefined;
  if (umbralAprobacion === undefined) return null;

  const { rows: pregRows } = await sql.query('select id, tipo from capacitacion_preguntas where modulo_id = $1', [moduloId]);
  if (pregRows.length === 0) {
    throw new RespuestasInvalidasError('Este examen todavía no tiene preguntas configuradas.');
  }
  const tipoPorPreguntaId = new Map(pregRows.map((r) => [r.id as string, r.tipo as CapacitacionPreguntaTipo]));

  const textoPreguntaIds = pregRows.filter((r) => r.tipo === 'texto').map((r) => r.id as string);
  let opcionPorId = new Map<string, { preguntaId: string; correcta: boolean }>();
  if (textoPreguntaIds.length > 0) {
    const { rows: opcRows } = await sql.query(
      `select id, pregunta_id, correcta from capacitacion_opciones where pregunta_id = any($1::uuid[])`,
      [textoPreguntaIds]
    );
    opcionPorId = new Map(
      opcRows.map((r) => [r.id as string, { preguntaId: r.pregunta_id as string, correcta: r.correcta as boolean }])
    );
  }

  const necesitaDinamico = pregRows.some((r) => r.tipo !== 'texto');
  let supervisorIdCorrecto: string | null = null;
  let ejecutivosCorrectos: Set<string> | null = null;
  if (necesitaDinamico) {
    const contexto = await resolverSupervisorYMarca(promotorId);
    if (!contexto) throw new RespuestasInvalidasError(SIN_SUPERVISOR_MSG);
    supervisorIdCorrecto = contexto.supervisorId;
    if (pregRows.some((r) => r.tipo === 'coordinador_cuenta')) {
      const { rows } = await sql.query('select id from ejecutivos where marca_id = $1', [contexto.marcaId]);
      ejecutivosCorrectos = new Set(rows.map((r) => r.id as string));
    }
  }

  const respondidas = new Set<string>();
  let correctas = 0;
  for (const r of respuestas) {
    const tipo = tipoPorPreguntaId.get(r.preguntaId);
    if (!tipo || respondidas.has(r.preguntaId)) {
      throw new RespuestasInvalidasError('Una de las respuestas no es válida.');
    }
    respondidas.add(r.preguntaId);

    if (tipo === 'texto') {
      const opcion = opcionPorId.get(r.opcionId);
      if (!opcion || opcion.preguntaId !== r.preguntaId) {
        throw new RespuestasInvalidasError('Una de las respuestas no es válida.');
      }
      if (opcion.correcta) correctas++;
    } else if (tipo === 'supervisor_directo') {
      if (r.opcionId === supervisorIdCorrecto) correctas++;
    } else if (tipo === 'coordinador_cuenta') {
      if (ejecutivosCorrectos!.has(r.opcionId)) correctas++;
    }
  }
  if (respondidas.size !== pregRows.length) {
    throw new RespuestasInvalidasError('Responde todas las preguntas antes de enviar.');
  }

  const calificacion = Math.round((correctas / pregRows.length) * 10000) / 100;
  const aprobado = calificacion >= umbralAprobacion;

  await sql.query(
    `insert into capacitacion_resultados (promotor_id, modulo_id, calificacion, aprobado, respondido_en)
     values ($1, $2, $3, $4, now())
     on conflict (promotor_id, modulo_id) do update set
       calificacion = excluded.calificacion,
       aprobado = excluded.aprobado,
       respondido_en = excluded.respondido_en`,
    [promotorId, moduloId, calificacion, aprobado]
  );

  return { calificacion, aprobado, umbralAprobacion };
}
