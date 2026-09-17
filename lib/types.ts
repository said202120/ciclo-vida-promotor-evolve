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
  mod1: boolean;
  mod3: boolean;
  mod6: boolean;
  mod12: boolean;
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
  | 'okr_total';

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
};

/** Un artículo del checklist de materiales dentro de la encuesta pública (subconjunto del catálogo). */
export type EncuestaMaterialItem = {
  materialId: string;
  nombre: string;
  recibido: boolean;
};

/** Lo que se muestra/precarga en la encuesta pública de verificación (/e/{codigo}). */
export type EncuestaPublica = {
  promotorNombre: string;
  marca: string;
  puesto: string;
  contratoReportado: boolean | null;
  imssReportado: boolean | null;
  cartaReportada: boolean | null;
  credencialReportada: boolean | null;
  usuarioEmetrixReportado: boolean | null;
  fechaEntregaComunicada: boolean | null;
  materiales: EncuestaMaterialItem[];
};

/** Lo que manda el promotor al enviar la encuesta. */
export type EncuestaRespuestaPayload = {
  marca: string;
  puesto: string;
  contratoReportado: boolean;
  imssReportado: boolean;
  cartaReportada: boolean;
  credencialReportada: boolean;
  usuarioEmetrixReportado: boolean;
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
