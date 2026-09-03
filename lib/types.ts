export type Promotor = {
  id: string;
  nombre: string;
  fechaIngreso: string | null; // 'YYYY-MM-DD'
  carta: boolean;
  usuario: boolean;
  contrato: boolean;
  imss: boolean;
  materialesEntregados: number;
  materialesTotal: number;
  mod1: boolean;
  mod3: boolean;
  mod6: boolean;
  mod12: boolean;
};

/** "Materiales completos" para el KPI 2.1 y las alertas: los 13 artículos del catálogo entregados. */
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

export type AlertaActiva = {
  promotorId: string;
  nombre: string;
  tipo: 'mes1' | 'mes2';
  enviadaEn: string;
  mensaje: string;
};

export type Rol = 'gerente' | 'ejecutivo';

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
