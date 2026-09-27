// Pruebas de lib/emetrix-ponderacion-calc.ts — funciones puras, SIN base de
// datos. Corren con:
//   node --test lib/emetrix-ponderacion-calc.test.ts
// (o `npm test`). No requieren POSTGRES_URL ni ninguna variable de entorno, y
// no crean/leen nada en la base de producción — son datos sintéticos en cada
// prueba. Ver docs/ficha-tecnica-okr-ponderacion.md sección 3-4 y 8 para la
// especificación de las reglas que se están probando aquí.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calcularMarca,
  calcularMateriales,
  calcularMesaControl,
  calcularPendientes,
  calcularTotalPonderado,
  construirArbolOkr,
  construirRespuestaOkrLectura,
  detectarYConvertirFormatoLargo,
  esPeriodoValido,
  formatIndicadorConMeta,
  formatPeriodoLabel,
  periodoActual,
  periodoInicioISO,
  pillEstado,
  validarBaseManual,
} from './emetrix-ponderacion-calc.ts';
import { OKR_OFICIAL } from './okr-oficial.ts';
import type { EmetrixKpiManualBase, EmetrixOkrNodo } from './types';

// KPI manual "sin capturar" (ni base ni el % del formato viejo) — el default
// que usan la mayoría de las pruebas de construirArbolOkr de abajo, que no
// están probando específicamente los 3 KPI de captura manual.
const SIN_CAPTURAR: EmetrixKpiManualBase = { numerador: null, denominador: null, legacyPorcentaje: null };

// ---- Periodo ----

test('periodo: formato YYYY-MM', () => {
  assert.equal(esPeriodoValido('2026-09'), true);
  assert.equal(esPeriodoValido('2026-9'), false);
  assert.equal(esPeriodoValido('09-2026'), false);
  assert.equal(esPeriodoValido('2026-13'), false);
  assert.equal(esPeriodoValido(''), false);
});

test('periodo: periodoActual usa la fecha inyectada', () => {
  assert.equal(periodoActual(new Date(Date.UTC(2026, 8, 26))), '2026-09');
  assert.equal(periodoActual(new Date(Date.UTC(2026, 0, 5))), '2026-01');
});

test('periodo: formatPeriodoLabel muestra el nombre completo del mes', () => {
  assert.equal(formatPeriodoLabel('2026-09'), 'Septiembre 2026');
  assert.equal(formatPeriodoLabel('2026-01'), 'Enero 2026');
});

// ---- Helpers para armar archivos sintéticos de Mesa de Control ----

const MESA_CONTROL_HEADERS = [
  'USUARIO',
  'POSICION',
  '¿Pudiste entrar a tu tienda el primer día?',
  '¿Tu usuario Emetrix funciono cuando lo necesitaste?',
  'El primer día, ¿Quién te acompaño a tienda?',
  '¿Te explicaron que marcas y productos atender?',
  '¿Ya recibiste tu saldo?',
];

function filaMesaControl(usuario: string, valores: { entrada?: string; emetrix?: string; marcas?: string; saldo?: string }): string[] {
  return [usuario, 'Promotor', valores.entrada ?? 'Sí', valores.emetrix ?? 'Sí', 'Gerente', valores.marcas ?? 'Sí', valores.saldo ?? 'Sí'];
}

// ---- Regla: respuesta más reciente ----

test('regla: USUARIO duplicado en archivo ancho usa la última aparición', () => {
  const rows = [
    filaMesaControl('PRO001', { entrada: 'No' }), // primera aparición: no cumple
    filaMesaControl('PRO001', { entrada: 'Sí' }), // segunda (más reciente): sí cumple
  ];
  const calculo = calcularMesaControl(MESA_CONTROL_HEADERS, rows);
  assert.equal(calculo.filas.length, 1, 'debe quedar un solo promotor, no dos');
  assert.equal(calculo.filas[0].estado, 'cumple', 'debe ganar la respuesta más reciente (la última fila)');
});

test('regla: formato largo usa la FECHA ENTRADA más reciente cuando el mismo promotor contesta la misma pregunta dos veces', () => {
  const headers = ['USUARIO', 'NOMBRE', 'PREGUNTA', 'RESPUESTA', 'FECHA ENTRADA'];
  const rows = [
    ['PRO001', 'Juan Pérez', '¿Pudiste entrar a tu tienda el primer día?', 'No', '01/Sep/2026, 08:00am'],
    ['PRO001', 'Juan Pérez', '¿Pudiste entrar a tu tienda el primer día?', 'Sí', '02/Sep/2026, 09:00am'], // más reciente
  ];
  const { headers: anchoHeaders, rows: anchoRows, notaFormatoLargo } = detectarYConvertirFormatoLargo(headers, rows);
  assert.ok(notaFormatoLargo, 'debe detectar formato largo');
  const idxPregunta = anchoHeaders.indexOf('¿Pudiste entrar a tu tienda el primer día?');
  assert.equal(anchoRows[0][idxPregunta], 'Sí', 'debe ganar el envío con FECHA ENTRADA más reciente');
});

test('regla: formato largo junta con ", " las respuestas de un mismo envío (misma fecha) en una pregunta de opción múltiple', () => {
  const headers = ['USUARIO', 'NOMBRE', 'PREGUNTA', 'RESPUESTA', 'FECHA ENTRADA'];
  const rows = [
    ['PRO001', 'Juan Pérez', 'Pregunta multi', 'Opción A', '01/Sep/2026, 08:00am'],
    ['PRO001', 'Juan Pérez', 'Pregunta multi', 'Opción B', '01/Sep/2026, 08:00am'], // mismo envío exacto
  ];
  const { headers: anchoHeaders, rows: anchoRows } = detectarYConvertirFormatoLargo(headers, rows);
  const idx = anchoHeaders.indexOf('Pregunta multi');
  assert.equal(anchoRows[0][idx], 'Opción A, Opción B');
});

// ---- Regla: formato ancho no se toca (no-op) ----

test('regla: un archivo ancho (sin PREGUNTA/RESPUESTA) no se convierte — detectarYConvertirFormatoLargo es no-op', () => {
  const rows = [filaMesaControl('PRO001', {})];
  const { headers, rows: rowsOut, notaFormatoLargo } = detectarYConvertirFormatoLargo(MESA_CONTROL_HEADERS, rows);
  assert.deepEqual(headers, MESA_CONTROL_HEADERS);
  assert.deepEqual(rowsOut, rows);
  assert.equal(notaFormatoLargo, null);
});

// ---- Regla: vacío no es cero ----

test('regla: si ninguna fila trae un valor reconocible en la pregunta, el % de esa pregunta es null (no 0%)', () => {
  const rows = [filaMesaControl('PRO001', { marcas: 'N/A' }), filaMesaControl('PRO002', { marcas: 'N/A' })];
  const calculo = calcularMesaControl(MESA_CONTROL_HEADERS, rows);
  const p = calculo.preguntas.find((x) => x.pregunta === 'Te explicaron las marcas');
  assert.ok(p, 'la pregunta debe seguir apareciendo en el resumen');
  assert.equal(p!.porcentaje, null, '"N/A" en todas las filas no es un valor reconocible ("Sí"/"No") — no debe leerse como 0%');
  assert.equal(p!.contestaron, 0);
});

test('regla: en Tu Marca, si nadie dejó respuesta en una pregunta de opción múltiple, su % es null (no 0%)', () => {
  const headers = [
    'USUARIO',
    'POSICION',
    'Un producto imperdible de tu cuenta no está en anaquel, pero hay piezas en bodega. ¿Qué haces?',
    'Al surtir, ¿cómo acomodas el producto?',
    'Encuentras en anaquel un producto de tu marca con el empaque golpeado o a punto de caducar. ¿Qué haces?',
    'En bodega hay cajas sin acomodar y necesitas tu producto. ¿Cómo lo ubicas?',
    'Un producto de la competencia está ocupando el espacio de tu marca en el anaquel. ¿Qué haces?',
    'Según el planograma, la presentación grande va abajo, pero la encuentras arriba. ¿Qué haces?',
    'El fleje dice $45 y en caja cobran $52. ¿Qué haces?',
    'Un producto tiene 20 piezas en bodega y cero ventas en dos semanas. ¿Qué es?',
    '¿Cómo debe quedar el frente de tu producto en el anaquel?',
    'Te toca armar una exhibición adicional y te falta material POP. ¿Qué haces?',
  ];
  const filaVacia = (usuario: string) => [usuario, 'Promotor', '', '', '', '', '', '', '', '', '', ''];
  const calculo = calcularMarca(headers, [filaVacia('PRO001'), filaVacia('PRO002')]);
  for (const p of calculo.preguntas) {
    assert.equal(p.porcentaje, null, `"${p.pregunta}" sin ninguna respuesta debe ser null, no 0%`);
    assert.equal(p.contestaron, 0);
  }
});

// ---- Regla: cero medido (0% es 'medido', nunca 'sin-medir') ----

const MATERIALES_HEADERS = [
  'USUARIO',
  'POSICION',
  'Uniforme',
  'Botas',
  'Faja',
  'Cintas',
  'Cortador y Navajas',
  'Franela',
  'Casco',
  'Lo que recibiste, ¿te quedó bien y está en buen estado?',
  '¿Firmaste de Recibido tus materiales?',
  '¿Ya recibiste tu celular de trabajo?',
  '¿Tienes Emetrix instalado y funcionando con tu usuario?',
  '¿Firmaste de recibido el equipo?',
];

function filaMateriales(usuario: string, prendas: 'todas' | 'ninguna'): string[] {
  const v = prendas === 'todas' ? 'Sí' : 'No';
  return [usuario, 'Promotor', v, v, v, v, v, v, 'Sí', 'Sí', 'Sí', 'No', 'Sí', 'Sí'];
}

test("regla: cero medido — Materiales con 0% de cumplimiento sigue siendo 'medido', nunca 'sin-medir' (ej. Hanes)", () => {
  const rows = [filaMateriales('PRO001', 'ninguna'), filaMateriales('PRO002', 'ninguna')];
  const calculo = calcularMateriales(MATERIALES_HEADERS, rows, false);
  assert.equal(calculo.cumplieron, 0);

  const raiz = construirArbolOkr({
    materiales: { cumplieron: calculo.cumplieron, respondieron: calculo.filas.length, porcentaje: 0 },
    marca: null,
    mesaControlPreguntas: null,
    contratoFirmado: SIN_CAPTURAR,
    imss: SIN_CAPTURAR,
    modulosPublicados: SIN_CAPTURAR,
  });
  const kr2 = raiz.hijos.find((h) => h.codigo === 'KR2')!;
  const materialesKpi = kr2.hijos.find((h) => h.codigo === 'KR2.1')!;
  assert.equal(materialesKpi.indicador.estado, 'medido');
  assert.equal(materialesKpi.indicador.valor, 0);
  assert.equal(kr2.indicador.estado, 'medido', 'KR2 también debe quedar medido en 0%, no sin-medir');
  assert.equal(kr2.indicador.valor, 0);
});

test('regla: un KPI sin carga en este periodo queda "sin-medir" (nunca 0%)', () => {
  const raiz = construirArbolOkr({
    materiales: null, // no hay carga de Materiales en este periodo
    marca: null,
    mesaControlPreguntas: null,
    contratoFirmado: SIN_CAPTURAR,
    imss: SIN_CAPTURAR,
    modulosPublicados: SIN_CAPTURAR,
  });
  assert.equal(raiz.indicador.estado, 'sin-medir');
  assert.equal(raiz.indicador.valor, null);
  const kr2 = raiz.hijos.find((h) => h.codigo === 'KR2')!;
  assert.equal(kr2.indicador.estado, 'sin-medir');
  const materialesKpi = kr2.hijos.find((h) => h.codigo === 'KR2.1')!;
  assert.match(materialesKpi.indicador.motivo, /Materiales/);
});

// ---- Regla: KR con KPI pendientes (se redistribuye el peso) ----

test('regla: KR1 con un KPI pendiente (Contrato firmado) redistribuye el peso entre los otros 3', () => {
  const preguntasMesaControl = [
    { pregunta: 'Entrada a tienda', porcentaje: 100, numerador: 10, contestaron: 10 },
    { pregunta: 'Emetrix funcionó', porcentaje: 80, numerador: 8, contestaron: 10 },
  ];
  const raiz = construirArbolOkr({
    materiales: null,
    marca: null,
    mesaControlPreguntas: preguntasMesaControl,
    contratoFirmado: SIN_CAPTURAR, // pendiente
    imss: { numerador: null, denominador: null, legacyPorcentaje: 60 }, // formato viejo (antes de la captura con base)
    modulosPublicados: SIN_CAPTURAR,
  });
  const kr1 = raiz.hijos.find((h) => h.codigo === 'KR1')!;
  assert.equal(kr1.indicador.estado, 'medido');
  assert.equal(kr1.indicador.base, '3 de 4 KPI');
  // 3 KPI presentes, pesos iguales (25 cada uno) -> promedio simple de 100, 80, 60
  assert.equal(kr1.indicador.valor, Math.round(((100 + 80 + 60) / 3) * 100) / 100);
  const contrato = kr1.hijos.find((h) => h.codigo === 'KR1.3')!;
  assert.equal(contrato.indicador.estado, 'sin-medir');
  assert.match(contrato.indicador.motivo, /Legal/);
});

// ---- Regla: OKR = KR1×30% + KR2×40% + KR3×30% ----

test('regla: OKR 30/40/30 — con los 3 KR completos, el total es el promedio ponderado exacto', () => {
  const preguntasMesaControl = [
    { pregunta: 'Entrada a tienda', porcentaje: 100, numerador: 10, contestaron: 10 },
    { pregunta: 'Emetrix funcionó', porcentaje: 100, numerador: 10, contestaron: 10 },
  ];
  const raiz = construirArbolOkr({
    materiales: { cumplieron: 8, respondieron: 10, porcentaje: 80 },
    marca: { cumplieron: 9, respondieron: 10, porcentaje: 90 },
    mesaControlPreguntas: preguntasMesaControl,
    contratoFirmado: { numerador: 10, denominador: 10, legacyPorcentaje: null },
    imss: { numerador: 10, denominador: 10, legacyPorcentaje: null },
    modulosPublicados: { numerador: 5, denominador: 5, legacyPorcentaje: null },
  });
  const kr1 = raiz.hijos.find((h) => h.codigo === 'KR1')!;
  const kr2 = raiz.hijos.find((h) => h.codigo === 'KR2')!;
  const kr3 = raiz.hijos.find((h) => h.codigo === 'KR3')!;
  assert.equal(kr1.indicador.valor, 100);
  assert.equal(kr2.indicador.valor, 80);
  // KR3 = módulos publicados (100, peso 50) + Tu Marca (90, peso 50) = 95
  assert.equal(kr3.indicador.valor, 95);

  const esperado = Math.round((kr1.indicador.valor! * 30 + kr2.indicador.valor! * 40 + kr3.indicador.valor! * 30) / 100 * 100) / 100;
  assert.equal(raiz.indicador.valor, esperado);
  assert.equal(raiz.indicador.valor, 90.5);
  assert.equal(raiz.indicador.base, null, 'con los 3 KR medidos, no debe quedar nota de "calculado con X de N"');

  const moduloCompletado = kr3.hijos.find((h) => h.codigo === 'KR3.2')!;
  assert.equal(moduloCompletado.indicador.motivo, 'Aproximación: 9 de 10 aprobaron Tu Marca (8 de 10 correctas).', 'el motivo debe dejar explícito que es una aproximación');
});

// ---- Regla: captura con base (numerador/denominador) de Contrato firmado, Alta IMSS y Módulos publicados ----

test('validarBaseManual: el numerador no puede ser mayor al denominador', () => {
  assert.equal(validarBaseManual(18, 20), null, '18 de 20 es válido');
  assert.equal(validarBaseManual(20, 20), null, 'numerador == denominador es válido');
  assert.equal(validarBaseManual(0, 0), null, '0 de 0 es válido');
  assert.match(validarBaseManual(21, 20)!, /no puede ser mayor/);
  assert.match(validarBaseManual(-1, 5)!, /negativos/);
  assert.equal(validarBaseManual(null, 20), null, 'falta el numerador: no es un error de validación, es una captura incompleta');
  assert.equal(validarBaseManual(18, null), null, 'falta el denominador: no es un error de validación, es una captura incompleta');
});

test('captura con base: "18 de 20" calcula el %, la base y el motivo en palabras', () => {
  const raiz = construirArbolOkr({
    materiales: null,
    marca: null,
    mesaControlPreguntas: null,
    contratoFirmado: { numerador: 18, denominador: 20, legacyPorcentaje: null },
    imss: SIN_CAPTURAR,
    modulosPublicados: SIN_CAPTURAR,
  });
  const contrato = raiz.hijos.find((h) => h.codigo === 'KR1')!.hijos.find((h) => h.codigo === 'KR1.3')!;
  assert.equal(contrato.indicador.estado, 'medido');
  assert.equal(contrato.indicador.valor, 90);
  assert.equal(contrato.indicador.base, '18 de 20');
  assert.equal(contrato.indicador.motivo, '18 de 20 nuevos ingresos firmaron contrato antes de su primer día.');
});

test('captura con base: numerador mayor al denominador no se guarda (se valida antes, en la capa de datos/API, no aquí)', () => {
  // construirArbolOkr es puro y confía en que el numerador/denominador ya se
  // validaron al guardarse (ver updateContratoFirmadoManual/validarBaseManual
  // en lib/emetrix-ponderacion.ts y el PATCH de /api/emetrix-ponderacion/kpi-manual)
  // — esta prueba documenta esa frontera, no que construirArbolOkr valide.
  assert.match(validarBaseManual(25, 20)!, /no puede ser mayor al denominador/);
});

test('captura con base: si está vacío (ambos null y sin % del formato viejo), sigue "Sin medir"', () => {
  const raiz = construirArbolOkr({
    materiales: null,
    marca: null,
    mesaControlPreguntas: null,
    contratoFirmado: SIN_CAPTURAR,
    imss: SIN_CAPTURAR,
    modulosPublicados: SIN_CAPTURAR,
  });
  const contrato = raiz.hijos.find((h) => h.codigo === 'KR1')!.hijos.find((h) => h.codigo === 'KR1.3')!;
  assert.equal(contrato.indicador.estado, 'sin-medir');
  assert.equal(contrato.indicador.valor, null);
});

test('captura con base: si el denominador es 0 (sin nuevos ingresos en el mes), el indicador vale 100%', () => {
  const raiz = construirArbolOkr({
    materiales: null,
    marca: null,
    mesaControlPreguntas: null,
    contratoFirmado: { numerador: 0, denominador: 0, legacyPorcentaje: null },
    imss: { numerador: 0, denominador: 0, legacyPorcentaje: null },
    modulosPublicados: { numerador: 0, denominador: 0, legacyPorcentaje: null }, // "sin módulos programados", motivo distinto
  });
  const kr1 = raiz.hijos.find((h) => h.codigo === 'KR1')!;
  const contrato = kr1.hijos.find((h) => h.codigo === 'KR1.3')!;
  const imss = kr1.hijos.find((h) => h.codigo === 'KR1.4')!;
  const modulos = raiz.hijos.find((h) => h.codigo === 'KR3')!.hijos.find((h) => h.codigo === 'KR3.1')!;
  assert.equal(contrato.indicador.estado, 'medido');
  assert.equal(contrato.indicador.valor, 100);
  assert.equal(contrato.indicador.motivo, 'Sin nuevos ingresos en el periodo.');
  assert.equal(imss.indicador.valor, 100);
  assert.equal(imss.indicador.motivo, 'Sin nuevos ingresos en el periodo.');
  assert.equal(modulos.indicador.valor, 100);
  assert.equal(modulos.indicador.motivo, 'Sin módulos programados en el periodo.', 'módulos publicados usa un motivo propio, no el de "nuevos ingresos"');
});

test('captura con base: sin numerador/denominador este periodo, cae al % del formato viejo (legacyPorcentaje) para no perder cuentas ya capturadas', () => {
  const raiz = construirArbolOkr({
    materiales: null,
    marca: null,
    mesaControlPreguntas: null,
    contratoFirmado: { numerador: null, denominador: null, legacyPorcentaje: 96.5 },
    imss: SIN_CAPTURAR,
    modulosPublicados: SIN_CAPTURAR,
  });
  const contrato = raiz.hijos.find((h) => h.codigo === 'KR1')!.hijos.find((h) => h.codigo === 'KR1.3')!;
  assert.equal(contrato.indicador.estado, 'medido');
  assert.equal(contrato.indicador.valor, 96.5);
  assert.equal(contrato.indicador.base, null, 'el formato viejo no trae "X de Y"');
  assert.match(contrato.indicador.motivo, /Legal/);
});

test('regla: calcularTotalPonderado redistribuye el peso cuando un KR no tiene carga', () => {
  const total = calcularTotalPonderado([
    { porcentaje: 100, peso: 30 },
    { porcentaje: null, peso: 40 }, // sin carga, no cuenta como 0%
    { porcentaje: 50, peso: 30 },
  ]);
  // solo los 2 con dato: (100*30 + 50*30) / 60 = 75
  assert.equal(total, 75);
});

// ---- Confirmación: reglas de cumple/no cumple vigentes (Mesa de Control / Materiales / Marca) sin cambios ----

test('regla vigente: Mesa de Control exige Sí en las 4 preguntas de fondo ("quién te acompañó" no califica)', () => {
  const rows = [filaMesaControl('PRO001', {})];
  const calculo = calcularMesaControl(MESA_CONTROL_HEADERS, rows);
  assert.equal(calculo.filas[0].estado, 'cumple');
});

test('regla vigente: Materiales con incluyeCelular=false ignora celular/Emetrix aunque digan "No"', () => {
  const rows = [filaMateriales('PRO001', 'todas')]; // celular='No' dentro de filaMateriales
  const calculo = calcularMateriales(MATERIALES_HEADERS, rows, false);
  assert.equal(calculo.filas[0].estado, 'cumple', 'sin incluyeCelular, esas 2 preguntas no deben exigirse');
});

// ---- Confirmación: OKR real de cuentas en producción (periodo 2026-09) ----
//
// Fixtures tomados el 2026-09-27 leyendo la base de producción de solo
// lectura (cumplieron/respondieron/porcentaje de cada sondeo, desglose de
// Mesa de Control, y los 3 KPI manuales — ninguno capturado todavía en
// ninguna de las 3 cuentas). Si cambian los datos reales de estas cuentas
// (nueva carga, KPI manual capturado), este fixture queda desactualizado a
// propósito — es una foto fija para confirmar que el cálculo no se rompió,
// no una fuente de verdad viva.

test('confirmación: OKR real de Spin Master (periodo 2026-09) = 65.27%', () => {
  const raiz = construirArbolOkr({
    materiales: { cumplieron: 25, respondieron: 49, porcentaje: 51.02 },
    marca: { cumplieron: 27, respondieron: 51, porcentaje: 52.94 },
    mesaControlPreguntas: [
      { pregunta: 'Entrada a tienda', porcentaje: 97.73, numerador: 43, contestaron: 44 },
      { pregunta: 'Emetrix funcionó', porcentaje: 95.45, numerador: 42, contestaron: 44 },
    ],
    contratoFirmado: SIN_CAPTURAR,
    imss: SIN_CAPTURAR,
    modulosPublicados: SIN_CAPTURAR,
  });
  assert.equal(raiz.indicador.valor, 65.27);
  const kr1 = raiz.hijos.find((h) => h.codigo === 'KR1')!;
  assert.equal(kr1.hijos.find((h) => h.codigo === 'KR1.1')!.indicador.base, '43 de 44');
});

test('confirmación: OKR real de ADM (periodo 2026-09) = 61.49%', () => {
  const raiz = construirArbolOkr({
    materiales: { cumplieron: 52, respondieron: 227, porcentaje: 22.91 },
    marca: { cumplieron: 166, respondieron: 221, porcentaje: 75.11 },
    mesaControlPreguntas: [
      { pregunta: 'Entrada a tienda', porcentaje: 99.09, numerador: 218, contestaron: 220 },
      { pregunta: 'Emetrix funcionó', porcentaje: 99.55, numerador: 222, contestaron: 223 },
    ],
    contratoFirmado: SIN_CAPTURAR,
    imss: SIN_CAPTURAR,
    modulosPublicados: SIN_CAPTURAR,
  });
  assert.equal(raiz.indicador.valor, 61.49);
});

test('confirmación: OKR real de Hanes (periodo 2026-09) = 43.58% — incluye Materiales en 0% medido', () => {
  const raiz = construirArbolOkr({
    materiales: { cumplieron: 0, respondieron: 32, porcentaje: 0 },
    marca: { cumplieron: 15, respondieron: 31, porcentaje: 48.39 },
    mesaControlPreguntas: [
      { pregunta: 'Entrada a tienda', porcentaje: 96.88, numerador: 31, contestaron: 32 },
      { pregunta: 'Emetrix funcionó', porcentaje: 96.88, numerador: 31, contestaron: 32 },
    ],
    contratoFirmado: SIN_CAPTURAR,
    imss: SIN_CAPTURAR,
    modulosPublicados: SIN_CAPTURAR,
  });
  assert.equal(raiz.indicador.valor, 43.58);
  const kr2 = raiz.hijos.find((h) => h.codigo === 'KR2')!;
  assert.equal(kr2.indicador.estado, 'medido');
  assert.equal(kr2.indicador.valor, 0);
});

// ---- Compatibilidad: cargas guardadas antes de que existiera "numerador" en preguntas_resumen ----

// ---- Pastillas: verde >=90, amarillo >=70, rojo abajo, gris "sin-medir" ----

test('pillEstado: verde >=90, amarillo >=70, rojo abajo de 70, gris si sin-medir', () => {
  assert.equal(pillEstado({ estado: 'medido', valor: 100, base: null, motivo: '' }), 'good');
  assert.equal(pillEstado({ estado: 'medido', valor: 90, base: null, motivo: '' }), 'good');
  assert.equal(pillEstado({ estado: 'medido', valor: 89.99, base: null, motivo: '' }), 'warn');
  assert.equal(pillEstado({ estado: 'medido', valor: 70, base: null, motivo: '' }), 'warn');
  assert.equal(pillEstado({ estado: 'medido', valor: 69.99, base: null, motivo: '' }), 'bad');
  assert.equal(pillEstado({ estado: 'medido', valor: 0, base: null, motivo: '' }), 'bad', 'un 0% medido es rojo, no gris');
  assert.equal(pillEstado({ estado: 'sin-medir', valor: null, base: null, motivo: '' }), 'sin-medir');
});

// ---- Pendientes de indicador ----

function nodoIndicador(codigo: string, nombre: string, owner: string, estado: 'medido' | 'sin-medir', valor: number | null = null): EmetrixOkrNodo {
  return {
    nivel: 'kpi',
    codigo,
    area: 'Operaciones',
    nombre,
    nombreOficial: nombre,
    meta: 100,
    kpiCode: null,
    descripcion: '',
    capa: 'Actividad',
    owner,
    peso: 25,
    indicador: { estado, valor, base: null, motivo: '' },
    fuente: '',
    hijos: [],
  };
}

function raizConHojas(hojas: EmetrixOkrNodo[]): EmetrixOkrNodo {
  return {
    nivel: 'okr',
    codigo: 'OKR',
    area: 'Operaciones',
    nombre: 'Ciclo de vida del promotor',
    nombreOficial: 'Ciclo de vida del promotor',
    meta: null,
    kpiCode: null,
    descripcion: '',
    capa: 'Resultado',
    owner: 'Operaciones',
    peso: 100,
    indicador: { estado: 'sin-medir', valor: null, base: null, motivo: '' },
    fuente: '',
    // Las pruebas de calcularPendientes solo leen por código vía aplanarArbolOkr, así que basta con anidar las 7 hojas directo bajo la raíz (no hace falta el KR intermedio real).
    hijos: hojas,
  };
}

const HOJAS_COMPLETAS = () => [
  nodoIndicador('KR1.1', 'Carta de acceso y credencial', 'Mesa de Control', 'medido', 100),
  nodoIndicador('KR1.2', 'Usuario en Emetrix', 'Mesa de Control', 'medido', 100),
  nodoIndicador('KR1.3', 'Contrato firmado', 'Legal', 'medido', 100),
  nodoIndicador('KR1.4', 'Alta ante el IMSS', 'Nómina', 'medido', 100),
  nodoIndicador('KR2.1', 'Materiales completos', 'Operaciones', 'medido', 100),
  nodoIndicador('KR3.1', 'Módulos publicados en Emetrix', 'Capacitación', 'medido', 100),
  nodoIndicador('KR3.2', 'Módulo completado (aproximación)', 'Capacitación', 'medido', 100),
];

test('calcularPendientes: cuenta con todo medido y headcount no aparece en ninguna lista', () => {
  const pendientes = calcularPendientes([
    {
      marcaId: 'm1',
      marcaNombre: 'Completa',
      raiz: raizConHojas(HOJAS_COMPLETAS()),
      sondeosCargadoEn: { mesa_control: '2026-09-01', materiales: '2026-09-01', marca: '2026-09-01' },
      headcountManual: 50,
    },
  ]);
  assert.deepEqual(pendientes.porDato, []);
  assert.deepEqual(pendientes.porCuenta, []);
  assert.deepEqual(pendientes.headcountFaltante, []);
});

test('calcularPendientes: agrupa por dato y responsable ("Falta Contrato firmado: N cuentas · Legal")', () => {
  const hojasSinContrato = HOJAS_COMPLETAS().map((h) => (h.codigo === 'KR1.3' ? nodoIndicador('KR1.3', 'Contrato firmado', 'Legal', 'sin-medir') : h));
  const pendientes = calcularPendientes([
    { marcaId: 'm1', marcaNombre: 'Cuenta A', raiz: raizConHojas(hojasSinContrato), sondeosCargadoEn: { mesa_control: 'x', materiales: 'x', marca: 'x' }, headcountManual: 10 },
    { marcaId: 'm2', marcaNombre: 'Cuenta B', raiz: raizConHojas(hojasSinContrato), sondeosCargadoEn: { mesa_control: 'x', materiales: 'x', marca: 'x' }, headcountManual: 10 },
  ]);
  assert.equal(pendientes.porDato.length, 1);
  assert.equal(pendientes.porDato[0].codigo, 'KR1.3');
  assert.equal(pendientes.porDato[0].owner, 'Legal');
  assert.deepEqual(pendientes.porDato[0].cuentas, ['Cuenta A', 'Cuenta B']);
});

test('calcularPendientes: los indicadores de sondeo se agrupan por sondeo, no por KPI ("Falta subir sondeo Mesa de Control: N cuentas · Ejecutivo de la cuenta")', () => {
  // Mesa de Control no se subió este periodo -> sus 2 KPI hoja (Carta de
  // acceso, Usuario Emetrix) quedan sin-medir, pero deben verse como UN solo
  // hueco ("falta subir el sondeo"), no dos líneas repitiendo la misma cuenta.
  const hojasSinMesaControl = HOJAS_COMPLETAS().map((h) =>
    h.codigo === 'KR1.1' || h.codigo === 'KR1.2' ? { ...h, indicador: { estado: 'sin-medir' as const, valor: null, base: null, motivo: '' } } : h
  );
  const pendientes = calcularPendientes([
    { marcaId: 'm1', marcaNombre: 'Cuenta A', raiz: raizConHojas(hojasSinMesaControl), sondeosCargadoEn: { mesa_control: null, materiales: 'x', marca: 'x' }, headcountManual: 10 },
    { marcaId: 'm2', marcaNombre: 'Cuenta B', raiz: raizConHojas(hojasSinMesaControl), sondeosCargadoEn: { mesa_control: null, materiales: 'x', marca: 'x' }, headcountManual: 10 },
  ]);
  const entradaSondeo = pendientes.porDato.find((d) => d.codigo === 'sondeo:mesa_control');
  assert.ok(entradaSondeo, 'debe existir una entrada agrupada para Mesa de Control');
  assert.equal(entradaSondeo!.nombre, 'subir sondeo Mesa de Control');
  assert.equal(entradaSondeo!.owner, 'Ejecutivo de la cuenta', 'no el área dueña del KPI (Mesa de Control)');
  assert.deepEqual(entradaSondeo!.cuentas, ['Cuenta A', 'Cuenta B']);
  assert.equal(pendientes.porDato.find((d) => d.codigo === 'KR1.1'), undefined, 'ya no debe existir una línea aparte por KPI hoja');
  assert.equal(pendientes.porDato.find((d) => d.codigo === 'KR1.2'), undefined);
});

test('calcularPendientes: los 3 KPI manuales (Contrato, IMSS, Módulos publicados) se siguen agrupando por su área dueña real', () => {
  const hojasSinModulos = HOJAS_COMPLETAS().map((h) => (h.codigo === 'KR3.1' ? { ...h, indicador: { estado: 'sin-medir' as const, valor: null, base: null, motivo: '' } } : h));
  const pendientes = calcularPendientes([
    { marcaId: 'm1', marcaNombre: 'Cuenta A', raiz: raizConHojas(hojasSinModulos), sondeosCargadoEn: { mesa_control: 'x', materiales: 'x', marca: 'x' }, headcountManual: 10 },
  ]);
  const entradaModulos = pendientes.porDato.find((d) => d.codigo === 'KR3.1');
  assert.ok(entradaModulos, 'los KPI manuales siguen agrupados por código de KPI, no por sondeo');
  assert.equal(entradaModulos!.owner, 'Capacitación', 'los KPI manuales conservan su área dueña real, no "Ejecutivo de la cuenta"');
});

test('calcularPendientes: agrupa por cuenta ("Zuru: faltan los 3 sondeos")', () => {
  const sinNada = raizConHojas(HOJAS_COMPLETAS().map((h) => ({ ...h, indicador: { estado: 'sin-medir' as const, valor: null, base: null, motivo: '' } })));
  const pendientes = calcularPendientes([
    { marcaId: 'm1', marcaNombre: 'Zuru', raiz: sinNada, sondeosCargadoEn: { mesa_control: null, materiales: null, marca: null }, headcountManual: null },
  ]);
  assert.equal(pendientes.porCuenta.length, 1);
  assert.deepEqual(pendientes.porCuenta[0].sondeosFaltantes, ['Mesa de Control', 'Materiales', 'Marca']);
  assert.deepEqual(pendientes.porCuenta[0].kpisManualesFaltantes, ['Contrato firmado', 'Alta ante el IMSS', 'Módulos publicados en Emetrix']);
  assert.equal(pendientes.porCuenta[0].headcountFaltante, true);
  assert.deepEqual(pendientes.headcountFaltante, ['Zuru']);
});

test('compatibilidad: preguntas_resumen histórico sin "numerador" no rompe el motivo (se reconstruye desde porcentaje/contestaron)', () => {
  const raiz = construirArbolOkr({
    materiales: null,
    marca: null,
    // @ts-expect-error — simula un registro histórico guardado antes de agregar `numerador` al tipo.
    mesaControlPreguntas: [{ pregunta: 'Entrada a tienda', porcentaje: 99.09, contestaron: 220 }],
    contratoFirmado: SIN_CAPTURAR,
    imss: SIN_CAPTURAR,
    modulosPublicados: SIN_CAPTURAR,
  });
  const kr1_1 = raiz.hijos.find((h) => h.codigo === 'KR1')!.hijos.find((h) => h.codigo === 'KR1.1')!;
  assert.equal(kr1_1.indicador.base, '218 de 220');
  assert.doesNotMatch(kr1_1.indicador.motivo, /undefined/);
});

// ---- Nombres oficiales del OKR (lib/okr-oficial.ts) en cada nodo del árbol ----

function raizDeEjemplo(): EmetrixOkrNodo {
  return construirArbolOkr({
    materiales: { cumplieron: 8, respondieron: 10, porcentaje: 80 },
    marca: { cumplieron: 9, respondieron: 10, porcentaje: 90 },
    mesaControlPreguntas: [
      { pregunta: 'Entrada a tienda', porcentaje: 100, numerador: 10, contestaron: 10 },
      { pregunta: 'Emetrix funcionó', porcentaje: 100, numerador: 10, contestaron: 10 },
    ],
    contratoFirmado: { numerador: 18, denominador: 20, legacyPorcentaje: null },
    imss: SIN_CAPTURAR,
    modulosPublicados: SIN_CAPTURAR,
  });
}

test('nombres oficiales: el árbol trae el texto LITERAL de lib/okr-oficial.ts en cada nodo, y la meta solo en los 7 KPI hoja', () => {
  const raiz = raizDeEjemplo();
  assert.equal(raiz.nombreOficial, OKR_OFICIAL.nombreOficial);
  assert.equal(raiz.meta, null, 'el OKR agregado no tiene meta individual propia');

  const kr1 = raiz.hijos.find((h) => h.codigo === 'KR1')!;
  assert.equal(kr1.nombreOficial, OKR_OFICIAL.krs[0].nombreOficial);
  assert.equal(kr1.meta, null, 'un KR agregado no tiene meta individual propia');

  const contrato = kr1.hijos.find((h) => h.codigo === 'KR1.3')!;
  assert.equal(contrato.nombreOficial, '% de nuevos ingresos con contrato firmado antes del primer día');
  assert.equal(contrato.meta, 100);
  assert.equal(contrato.kpiCode, null, 'pendiente de Dirección');
  assert.notEqual(contrato.nombreOficial, contrato.nombre, 'el nombre corto en pantalla sigue siendo distinto al oficial');

  const moduloCompletado = raiz.hijos.find((h) => h.codigo === 'KR3')!.hijos.find((h) => h.codigo === 'KR3.2')!;
  assert.equal(moduloCompletado.nombreOficial, '% de promotores con el módulo que les toca por antigüedad completado');
  assert.equal(moduloCompletado.meta, 90, 'meta oficial de Módulo completado es 90%, no 100%');
});

// ---- Metas: "97.73% · 43 de 44 · meta 100%" ----

test('formatIndicadorConMeta: junta %, base y meta con " · "', () => {
  assert.equal(formatIndicadorConMeta({ estado: 'medido', valor: 97.73, base: '43 de 44', motivo: '' }, 100), '97.73% · 43 de 44 · meta 100%');
  assert.equal(formatIndicadorConMeta({ estado: 'medido', valor: 75.11, base: '166 de 221', motivo: '' }, 90), '75.11% · 166 de 221 · meta 90%');
  assert.equal(formatIndicadorConMeta({ estado: 'medido', valor: 50, base: null, motivo: '' }, null), '50%', 'sin base ni meta (nodo agregado) solo el %');
  assert.equal(formatIndicadorConMeta({ estado: 'sin-medir', valor: null, base: null, motivo: 'x' }, 100), 'Sin medir', 'sin-medir nunca muestra base ni meta');
});

// ---- periodoInicioISO ----

test('periodoInicioISO: "2026-09" -> "2026-09-01"', () => {
  assert.equal(periodoInicioISO('2026-09'), '2026-09-01');
});

// ---- Lectura para EvolveOS: GET /api/okr-resultados ----

test('construirRespuestaOkrLectura: formato de la guía — okr, periodo y un indicador por cuenta × KPI hoja', () => {
  const respuesta = construirRespuestaOkrLectura('2026-09', [{ marcaNombre: 'Spin Master', raiz: raizDeEjemplo() }]);
  assert.equal(respuesta.okr, 'Ciclo de vida del promotor');
  assert.deepEqual(respuesta.periodo, { tipo: 'MES', inicio: '2026-09-01' });
  assert.equal(respuesta.indicadores.length, 7, 'un indicador por cada uno de los 7 KPI hoja');

  const contrato = respuesta.indicadores.find((i) => i.indicador.includes('contrato firmado'))!;
  assert.equal(contrato.indicador, 'Spin Master — % de nuevos ingresos con contrato firmado antes del primer día');
  assert.equal(contrato.medible, true);
  assert.equal(contrato.valor, 90);
  assert.equal(contrato.base, '18 de 20');
  assert.equal(contrato.kpi_code, null);
});

test('construirRespuestaOkrLectura: lo "sin medir" va con medible:false, valor:null y su motivo — nunca como 0', () => {
  const raiz = construirArbolOkr({
    materiales: null, // no hay carga de Materiales en este periodo
    marca: null,
    mesaControlPreguntas: null,
    contratoFirmado: SIN_CAPTURAR,
    imss: SIN_CAPTURAR,
    modulosPublicados: SIN_CAPTURAR,
  });
  const respuesta = construirRespuestaOkrLectura('2026-09', [{ marcaNombre: 'Zuru', raiz }]);
  for (const i of respuesta.indicadores) {
    assert.equal(i.medible, false);
    assert.equal(i.valor, null);
    assert.ok(i.motivo.length > 0, 'siempre debe traer un motivo, aunque sea sin-medir');
  }
});

test('construirRespuestaOkrLectura: un 0% medido (ej. Hanes Materiales) va con medible:true y valor:0, nunca sin-medir', () => {
  const raiz = construirArbolOkr({
    materiales: { cumplieron: 0, respondieron: 32, porcentaje: 0 },
    marca: null,
    mesaControlPreguntas: null,
    contratoFirmado: SIN_CAPTURAR,
    imss: SIN_CAPTURAR,
    modulosPublicados: SIN_CAPTURAR,
  });
  const respuesta = construirRespuestaOkrLectura('2026-09', [{ marcaNombre: 'Hanes', raiz }]);
  const materiales = respuesta.indicadores.find((i) => i.indicador.includes('materiales entregados'))!;
  assert.equal(materiales.medible, true);
  assert.equal(materiales.valor, 0);
  assert.equal(materiales.base, '0 de 32');
});
