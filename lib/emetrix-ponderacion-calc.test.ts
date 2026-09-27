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
  calcularTotalPonderado,
  construirArbolOkr,
  detectarYConvertirFormatoLargo,
  esPeriodoValido,
  formatPeriodoLabel,
  periodoActual,
} from './emetrix-ponderacion-calc.ts';

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
    contratoFirmadoManual: null,
    imssManual: null,
    modulosPublicadosManual: null,
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
    contratoFirmadoManual: null,
    imssManual: null,
    modulosPublicadosManual: null,
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
    contratoFirmadoManual: null, // pendiente
    imssManual: 60,
    modulosPublicadosManual: null,
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
    contratoFirmadoManual: 100,
    imssManual: 100,
    modulosPublicadosManual: 100,
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
