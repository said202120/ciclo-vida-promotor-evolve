export type Promotor = {
  id: string;
  nombre: string;
  rfc: string | null;
  fechaIngreso: string | null; // 'YYYY-MM-DD'
  carta: boolean;
  usuario: boolean;
  contrato: boolean;
  imss: boolean;
  materialesEntregados: number;
  materialesTotal: number;
  /**
   * Checklist de 10 materiales (ver MATERIALES_ENCUESTA) verificado por ambos
   * lados: true solo si sistema (promotor_materiales) Y la respuesta de la
   * encuesta del promotor coinciden en que sí lo recibió, en los 10. null si
   * el promotor todavía no contesta la encuesta — usado por el KPI 2.1.
   */
  materialesVerificados: boolean | null;
  /**
   * Respuesta del promotor a "¿ya te dejaron clara la fecha de entrega de
   * materiales?" en la encuesta de Materiales. null si todavía no contesta
   * esa encuesta — usado por el indicador temprano de visibilidad.
   */
  materialesFechaVisible: boolean | null;
  mod1: boolean;
  mod3: boolean;
  mod6: boolean;
  mod12: boolean;
  /** Supervisor del maestro de marcas asignado a este promotor (Módulo 1 de capacitaciones). null si no tiene. */
  supervisorId: string | null;
};

/** "Materiales completos" para las alertas de materiales: los 13 artículos del catálogo entregados. */
export function materialesCompletos(p: Pick<Promotor, 'materialesEntregados' | 'materialesTotal'>): boolean {
  return p.materialesTotal > 0 && p.materialesEntregados >= p.materialesTotal;
}

export type MaterialCategoria = 'tecnologia' | 'trabajo';

export type MaterialCatalogoItem = {
  id: string;
  categoria: MaterialCategoria;
  nombre: string;
  orden: number;
};

export type MaterialEstado = {
  materialId: string;
  categoria: MaterialCategoria;
  nombre: string;
  orden: number;
  entregado: boolean;
  fechaEntrega: string | null;
};

/** Agregado por artículo contra TODO el padrón (no solo la cohorte del mes) — para el desglose de solo lectura. */
export type MaterialResumenItem = {
  materialId: string;
  categoria: MaterialCategoria;
  nombre: string;
  orden: number;
  entregados: number;
  total: number;
};

/** Resultado crudo de leer el archivo de Aspel: encabezados tal cual vienen y todas las filas de datos como texto. */
export type ImportParseResult = {
  headers: string[];
  rows: string[][];
};

/** A qué campo del promotor corresponde una columna del archivo de Aspel. */
export type ImportCampo = 'rfc' | 'contratoFecha' | 'imssFecha' | 'idEmetrix' | 'idNomina' | 'ignorar';

/** Mapeo columna del archivo (encabezado tal cual) -> campo. Se guarda en importaciones_config. */
export type ImportMapeo = Record<string, ImportCampo>;

/** Resultado de aplicar el sync: cuántos promotores se actualizaron y qué RFC no encontraron dueño. */
export type ImportAplicarResultado = {
  recibidos: number;
  actualizados: number;
  sinMatch: string[];
};

/** Vista mínima del padrón para cruzar por RFC dentro del importador, sin exponer el resto del tablero. */
export type PromotorParaImportar = {
  id: string;
  nombre: string;
  rfc: string | null;
  imss: boolean;
  fechaImss: string | null;
};

/**
 * Un promotor "nuevo ingreso" del mes (mismo criterio que KR1: fecha_ingreso
 * dentro del mes seleccionado), para el checklist de Carta de ingreso /
 * Usuario Emetrix exclusivo de Mesa de Control.
 */
export type IngresoMes = {
  id: string;
  nombre: string;
  fechaIngreso: string;
  carta: boolean;
  usuario: boolean;
};

/** Una fila del historial de corridas del importador, para el "cuándo fue la última vez que sincronicé". */
export type ImportLogEntry = {
  id: string;
  fecha: string;
  actualizados: number;
  noEncontrados: number;
  usuarioNombre: string | null;
};

export type AlertaActiva = {
  promotorId: string;
  nombre: string;
  tipo: 'mes1' | 'mes2';
  enviadaEn: string;
  mensaje: string;
};

// gerente/ejecutivo: acceso completo al tablero de operaciones, sin importador.
// mesa_control/nomina: solo ven la pantalla de importar Aspel, cada uno con
// distintos campos permitidos (se define en una parte posterior).
export type Rol = 'gerente' | 'ejecutivo' | 'mesa_control' | 'nomina';

export type Usuario = {
  id: string;
  nombre: string;
  email: string;
  rol: Rol;
};

export type Modulos = {
  mod1: boolean;
  mod3: boolean;
  mod6: boolean;
  mod12: boolean;
  comprometidos: number;
};

export type KpiId =
  | 'kr1_carta'
  | 'kr1_usuario'
  | 'kr1_contrato'
  | 'kr1_imss'
  | 'kr2_materiales'
  | 'kr3_modulos'
  | 'kr3_completado'
  | 'okr_total'
  | 'kpi_visibilidad_materiales';

export type KpiStatus = 'good' | 'warn' | 'bad' | 'na';

export type KpiResult = {
  kpiId: KpiId;
  num: number | null;
  den: number | null;
  pct: number | null;
  meta: number;
  peso: number;
  status: KpiStatus;
};

export type PipelineStage = {
  label: string;
  sub: string;
  done: boolean;
};

export type Dashboard = {
  mes: string;
  closed: boolean;
  kr1: {
    carta: KpiResult;
    usuario: KpiResult;
    contrato: KpiResult;
    imss: KpiResult;
    score: number | null;
  };
  kr2: {
    materiales: KpiResult;
    score: number | null;
  };
  kr3: {
    modulos: KpiResult;
    completado: KpiResult;
    score: number | null;
  };
  okrTotal: {
    score: number | null;
  };
  pipeline: PipelineStage[];
  /**
   * Indicador temprano, fuera del OKR ponderado (no suma a ningún score):
   * % de nuevos ingresos que ya saben cuándo les toca recibir sus
   * materiales. Universo = promotores dentro de sus primeros 3 días hábiles
   * de ingreso; excluye a quien aún no contesta la encuesta de Materiales.
   */
  visibilidadMateriales: KpiResult;
};

/** Un artículo del checklist de materiales dentro de la encuesta pública (subconjunto del catálogo). */
export type EncuestaMaterialItem = {
  materialId: string;
  nombre: string;
  recibido: boolean;
};

/** Lo que se muestra/precarga en la encuesta pública "Mesa de Control" (/e/{codigo}) — bloques 1 y 2. */
export type EncuestaPublica = {
  promotorNombre: string;
  marca: string;
  puesto: string;
  contratoReportado: boolean | null;
  imssReportado: boolean | null;
  cartaReportada: boolean | null;
  credencialReportada: boolean | null;
  usuarioEmetrixReportado: boolean | null;
};

/** Lo que manda el promotor al enviar la encuesta "Mesa de Control". */
export type EncuestaRespuestaPayload = {
  marca: string;
  puesto: string;
  contratoReportado: boolean;
  imssReportado: boolean;
  cartaReportada: boolean;
  credencialReportada: boolean;
  usuarioEmetrixReportado: boolean;
};

/** Lo que se muestra/precarga en la encuesta pública "Materiales" (/m/{codigo}). */
export type EncuestaMaterialesPublica = {
  promotorNombre: string;
  fechaEntregaComunicada: boolean | null;
  materiales: EncuestaMaterialItem[];
};

/** Lo que manda el promotor al enviar la encuesta "Materiales". El checklist es opcional; la pregunta no. */
export type EncuestaMaterialesPayload = {
  fechaEntregaComunicada: boolean;
  materiales: string[]; // material_id de los artículos marcados como recibidos
};

/**
 * Comparación por promotor: lo que el sistema tiene registrado (padrón /
 * mesa_control / nómina / Aspel) contra lo que el promotor reportó en la
 * encuesta, para detectar discrepancias. `sistema`/`promotor` en null
 * significan "sin dato" (promotor: nunca contestó la encuesta).
 */
export type ComparacionCampo = {
  sistema: boolean | null;
  promotor: boolean | null;
};

export type ComparacionMaterial = {
  nombre: string;
  sistema: boolean;
  promotor: boolean | null;
};

export type ComparacionIngreso = {
  promotorId: string;
  nombre: string;
  fechaIngreso: string | null;
  respondioEncuesta: boolean;
  respondidaEn: string | null;
  contrato: ComparacionCampo;
  imss: ComparacionCampo;
  carta: ComparacionCampo;
  usuarioEmetrix: ComparacionCampo;
  credencial: ComparacionCampo; // sistema siempre null: no existe ese dato fuera de la encuesta
  fechaEntregaComunicada: ComparacionCampo; // sistema siempre null: informativo, solo lo reporta el promotor
  materiales: ComparacionMaterial[];
};

/**
 * Recordatorio visible en el Dashboard: promotores que cumplen 1 mes de
 * ingreso este mes calendario (el real, "hoy" — no depende del selector de
 * mes del tablero). Les toca la ventana de materiales el mes que sigue.
 */
export type RecordatorioMateriales = {
  promotorId: string;
  nombre: string;
  fechaIngreso: string;
};

/** Maestro de marcas/supervisores/ejecutivos, base del Módulo 1 de capacitaciones. */
export type Marca = {
  id: string;
  nombre: string;
};

export type Supervisor = {
  id: string;
  nombre: string;
  marcaId: string;
};

export type Ejecutivo = {
  id: string;
  nombre: string;
  marcaId: string;
};

export type MarcaConDetalle = Marca & {
  supervisores: Supervisor[];
  ejecutivos: Ejecutivo[];
};

/** Supervisor + el nombre de su marca, para poblar el selector de "supervisor asignado" en el padrón. */
export type SupervisorConMarca = Supervisor & {
  marcaNombre: string;
};

/**
 * Examen de capacitación por contenido (distinto de las casillas
 * mod1/mod3/mod6/mod12, que son por antigüedad). "orden" define la
 * secuencia de desbloqueo: el módulo con orden=N requiere haber aprobado el
 * de orden=N-1.
 */
export type CapacitacionModulo = {
  id: string;
  orden: number;
  nombre: string;
  descripcion: string | null;
  umbralAprobacion: number;
};

export type CapacitacionOpcion = {
  id: string;
  texto: string;
  correcta: boolean;
};

/**
 * 'texto': opciones fijas, capturadas a mano en /capacitaciones.
 * 'supervisor_directo' / 'coordinador_cuenta': opciones dinámicas, armadas
 * por promotor a partir del maestro de marcas/supervisores/ejecutivos según
 * su marca (ver lib/capacitaciones.ts) — el admin no captura opciones para
 * estas.
 */
export type CapacitacionPreguntaTipo = 'texto' | 'supervisor_directo' | 'coordinador_cuenta';

export type CapacitacionPregunta = {
  id: string;
  texto: string;
  tipo: CapacitacionPreguntaTipo;
  opciones: CapacitacionOpcion[];
  /** Etiqueta del campo de texto libre opcional bajo la pregunta (p.ej. "¿Cuáles?"), o null si no lleva uno. Nunca califica. */
  campoAbiertoLabel: string | null;
  /** false = pregunta "diagnóstico": no cuenta en el numerador ni el denominador de la calificación, solo se guarda para consulta. */
  califica: boolean;
  /** true = se puede elegir más de una opción (checkboxes). Solo tiene sentido con califica=false. */
  multiSelect: boolean;
};

/** Vista de administración (/capacitaciones, solo gerente): incluye qué opción es correcta. */
export type CapacitacionModuloConPreguntas = CapacitacionModulo & {
  preguntas: CapacitacionPregunta[];
};

/** Resultado más reciente de un promotor en un módulo, para el badge de estatus en el padrón. */
export type CapacitacionResultado = {
  moduloId: string;
  calificacion: number;
  aprobado: boolean;
};

/** Opción pública (sin exponer cuál es la correcta) para el examen en /q/{codigo}. */
export type CapacitacionOpcionPublica = {
  id: string;
  texto: string;
};

export type CapacitacionPreguntaPublica = {
  id: string;
  texto: string;
  opciones: CapacitacionOpcionPublica[];
  /** Etiqueta del campo de texto libre opcional bajo la pregunta (p.ej. "¿Cuáles?"), o null si no lleva uno. */
  campoAbiertoLabel: string | null;
  /** Lo último que el promotor escribió en ese campo abierto, para precargarlo en un reintento. null si nunca contestó. */
  respuestaAbiertaPrevia: string | null;
  /** false = pregunta "diagnóstico": no afecta la calificación, se muestra con un aviso. */
  califica: boolean;
  /** true = elegir varias opciones (checkboxes) en vez de una sola. */
  multiSelect: boolean;
  /** IDs de las opciones que el promotor eligió la última vez en una pregunta de diagnóstico, para precargarlas en un reintento. Vacío si nunca contestó o si la pregunta sí califica. */
  diagnosticoPrevio: string[];
};

/**
 * Datos para pintar el examen público (/q/{codigo}). Si `bloqueado` es true,
 * `preguntas` viene vacío y `razonBloqueo` trae el mensaje a mostrar en vez
 * del examen (puede ser porque falta aprobar el módulo anterior, o porque el
 * promotor todavía no tiene supervisor asignado en el padrón y el módulo
 * tiene preguntas dinámicas que lo necesitan).
 */
export type CapacitacionPublica = {
  promotorNombre: string;
  moduloNombre: string;
  moduloDescripcion: string | null;
  umbralAprobacion: number;
  bloqueado: boolean;
  razonBloqueo: string | null;
  preguntas: CapacitacionPreguntaPublica[];
  resultadoPrevio: { calificacion: number; aprobado: boolean } | null;
};

export type CapacitacionEnvioPayload = {
  /** Preguntas de opción única — calificantes o de diagnóstico, ambas van aquí, una por pregunta. */
  respuestas: Array<{ preguntaId: string; opcionId: string }>;
  /** Preguntas de diagnóstico multi_select: 0 o más opciones elegidas por pregunta. Opcional. */
  respuestasMultiples?: Array<{ preguntaId: string; opcionIds: string[] }>;
  /** Respuestas a los campos abiertos opcionales (ver campoAbiertoLabel) — nunca califican. */
  respuestasAbiertas?: Array<{ preguntaId: string; texto: string }>;
};

export type CapacitacionEnvioResultado = {
  calificacion: number;
  aprobado: boolean;
  umbralAprobacion: number;
};
