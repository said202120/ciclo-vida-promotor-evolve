# Ficha técnica — OKR de Ponderación de Cumplimiento (Plan B)

Pantalla `/emetrix-ponderacion` (solo rol gerente). Respaldo manual del OKR
"Ciclo de vida del promotor" mientras se resuelve la integración automática
con Evolve OS. Implementación: `lib/emetrix-ponderacion.ts` (acceso a base de
datos) + `lib/emetrix-ponderacion-calc.ts` (toda la matemática, funciones
puras — ver sección 9).

**2026-09-27 (vistas de indicadores)** — 3 vistas nuevas sobre la guía de
indicadores de Operaciones: "Cómo va cada cuenta", "Pendientes de
indicador" y "Captura rápida del mes" (sección 10). De paso se corrigió un
error del cambio anterior: los 3 KPI de captura manual (Contrato firmado,
Alta ante el IMSS, Módulos publicados) también son POR PERIODO — se movieron
de `emetrix_ponderacion_config` a `emetrix_ponderacion_kpi_manual` (una fila
por marca+periodo). Ninguna regla de cumple/no cumple ni ningún peso cambió.

**2026-09-27 (periodo e indicador)** — cada carga ahora pertenece a un
periodo ("mes") y toda la pantalla/descarga se filtra a un solo periodo a la
vez (sección 1-bis); el árbol OKR expone un "indicador" explícito por nodo
(`{estado, valor, base, motivo}`, sección 4-bis) en vez de campos sueltos; y
toda la matemática se movió a un módulo puro con sus propias pruebas
(sección 9). Ninguna regla de cumple/no cumple ni ningún peso cambió.

**2026-09-27 (antes)** — la pantalla se rehízo para ser un espejo exacto
(mismos nombres, mismos pesos) del OKR oficial de Carlos que se conecta a
EvolveOS, en vez de un modelo propio de 3 KR con pesos editables. Ver
sección 4.

## 1. Los 3 sondeos y sus reglas de cumplimiento

Cada sondeo se califica por promotor a partir del Excel que sube el gerente.
Si un USUARIO aparece más de una vez, se usa su respuesta más reciente. Las
comparaciones de columnas y respuestas son tolerantes a mayúsculas/minúsculas,
espacios y acentos. El archivo puede venir en formato "ancho" (una fila por
promotor, ej. Spin Master) o "largo" (una fila por respuesta, ej. ADM) — se
detecta y convierte automáticamente antes de calificar, ver sección 8.

### Mesa de Control

Cumple si contesta "Sí" a las 4 preguntas:
- ¿Pudiste entrar a tu tienda el primer día?
- ¿Tu usuario Emetrix funcionó cuando lo necesitaste?
- ¿Te explicaron qué marcas y productos atender?
- ¿Ya recibiste tu saldo?

"El primer día, ¿Quién te acompañó a tienda?" es solo informativa, no
califica.

### Materiales

Cumple si contesta "Sí" a las 6 prendas obligatorias: Uniforme, Botas, Faja,
Cintas, Cortador y Navajas, Franela. Casco **no** se exige.

Si la cuenta incluye celular en su acuerdo comercial (`incluyeCelular=true`,
capturado al subir el archivo y recordado por cuenta), además exige "Sí" en:
- ¿Ya recibiste tu celular de trabajo?
- ¿Tienes Emetrix instalado y funcionando con tu usuario?

Si la cuenta no incluye celular, esas dos preguntas se ignoran por completo.

### Tu Marca

10 preguntas de opción múltiple sobre manejo de marca en anaquel (ver
`MARCA_PREGUNTAS` en el código para el texto exacto de cada una y la
respuesta correcta). Cumple si acierta **8 de 10 o más**.

## 1-bis. Periodo (a qué mes pertenece una carga)

Cada carga (una fila de `emetrix_ponderacion_cargas`) pertenece a un mes,
columna `periodo` en formato `"YYYY-MM"` (ej. `"2026-09"`) — mismo formato
que ya usa el resto de la app (`/api/meses`). El gerente lo elige al subir un
sondeo (default: el mes actual, `periodoActual()` en
`lib/emetrix-ponderacion-calc.ts`); la pantalla muestra el label completo
("Septiembre 2026", `formatPeriodoLabel`).

Un selector de periodo arriba de `/emetrix-ponderacion`
(`components/EmetrixPonderacionAdmin.tsx`) controla TODA la pantalla: el
árbol OKR de la cuenta, las 3 vistas de "todas las cuentas" (sección 10), la
vista cruzada, el historial de cargas y el botón "Descargar para OKR" —
todos filtran por el periodo seleccionado. Ninguna consulta mezcla cargas de
dos periodos distintos en un mismo cálculo (`fetchResultadoCuenta`,
`fetchDetalleCarga`, `fetchHistorial`, `fetchVistaCruzada`,
`fetchResultadoOkrCuenta` y `fetchKpiManual` en `lib/emetrix-ponderacion.ts`
reciben `periodo` y lo usan en el `where` de cada consulta).
`fetchResultadoOkrTodasCuentas` trae TODAS las marcas registradas (no solo
las que ya tienen carga ese mes) — las que no tienen nada quedan "sin-medir"
en todo el árbol, para poder verlas en las vistas de pendientes (sección 10)
en vez de desaparecer de la lista.

Los 3 KPI de captura manual del OKR (Contrato firmado, Alta ante el IMSS,
Módulos publicados en Emetrix — sección 4) **SÍ están periodizados**, igual
que los 3 sondeos: un indicador es de una cuenta y UN mes, así que se
capturan mes con mes. Viven en `emetrix_ponderacion_kpi_manual` (una fila
por marca+periodo, `fetchKpiManual`/`updateContratoFirmadoManual`/
`updateImssManual`/`updateModulosPublicadosManual` en
`lib/emetrix-ponderacion.ts`). El **headcount** de la cuenta
(`emetrix_ponderacion_config.headcount_manual`) es la única excepción: NO es
por periodo, aplica igual sin importar qué mes esté seleccionado.

**Corrección 2026-09-27:** la primera versión de la periodización (más
arriba en este changelog) dejó los 3 KPI manuales sin periodizar por error,
guardados en `emetrix_ponderacion_config` (una fila por cuenta). Al momento
de corregirlo ninguna cuenta tenía capturado ningún valor ahí, así que no
hubo nada que migrar — esas 3 columnas quedan como código muerto histórico
en `emetrix_ponderacion_config` (mismo tratamiento que
`emetrix_ponderacion_pesos`, sección 4), sin borrarse de la base.

`GET /api/emetrix-ponderacion/periodos` regresa `{ periodos, actual }`:
todos los periodos con al menos una carga guardada (de cualquier cuenta) más
el mes actual (aunque no tenga cargas todavía, para poder elegirlo al subir
el primer sondeo de un mes nuevo), más recientes primero.

Las cargas guardadas antes de que existiera esta columna (todo lo capturado
hasta el 2026-09-27) se anclaron a `"2026-09"` en la migración de
`schema.sql` — no se perdió ni se recalculó ningún dato histórico.

## 2. Universo (a quién se mide)

Prioridad, de mayor a menor:

1. **Override puntual** — un headcount capturado solo para esa carga en
   particular, si el gerente lo indica al subir el archivo.
2. **Headcount de la cuenta** — uno solo, capturado una vez por cuenta,
   aplica por default a los 3 sondeos (`emetrix_ponderacion_config.headcount_manual`).
3. **Padrón interno** — promotores con supervisor asignado a esa marca,
   cruzados por `id_emetrix` contra el USUARIO del Excel. Solo se usa si la
   cuenta **no** tiene headcount (ni de cuenta ni override). Un promotor del
   padrón que no aparece en el Excel cuenta como "no contestó" (no cumple).
4. **Sin universo** — si no hay headcount ni padrón, el universo queda
   indefinido: el % de cumplimiento se sigue calculando entre quienes
   contestaron, pero el % de respuesta no se puede medir y ese sondeo siempre
   queda en alerta.

En modo headcount (1 o 2), "contestaron" y "cumplen" salen directo de los
promotores únicos del Excel — **no** se exige que estén en el padrón interno.
Si además existe padrón, el sistema informa internamente qué USUARIO del
Excel no se encontraron en él (para ir corrigiendo el padrón), pero no
excluye a nadie del cálculo.

## 3. Alerta de respuesta insuficiente

Por cada sondeo se calculan dos porcentajes por separado:

- **% de respuesta** = contestaron ÷ universo — mide cobertura del sondeo.
- **% de cumplimiento** = cumplen ÷ contestaron — mide calidad, **solo**
  entre quienes contestaron.

Un sondeo queda **en alerta** si:
- no hay universo definido (caso 4 de la sección 2), o
- el % de respuesta es **menor** al umbral configurado para esa cuenta
  (exactamente en el umbral no cuenta como alerta).

El umbral es editable por cuenta (`emetrix_ponderacion_config.umbral_respuesta`,
80% por default) desde la pantalla, vía `PATCH /api/emetrix-ponderacion/config`.
Este `enAlerta` (y el umbral) se conservan a nivel de cuenta en
`EmetrixOkrResultadoCuenta` aunque la estructura de KR/KPI de abajo ya no sea
la de estos 3 sondeos — es independiente de la sección 4.

## 4. El árbol OKR oficial y sus pesos

Espejo exacto (mismos nombres, mismos pesos) del OKR "Ciclo de vida del
promotor" del archivo de Carlos que se conecta a EvolveOS:

```
OKR Ciclo de vida del promotor = KR1×30% + KR2×40% + KR3×30%
```

| KR | Peso | KPI (peso dentro del KR) | De dónde sale |
|---|---|---|---|
| **KR1** Kit administrativo entregado a tiempo | 30% | Carta de acceso y credencial (25%) | % de "Sí" en "¿Pudiste entrar a tu tienda el primer día?" (Mesa de Control) |
| | | Usuario en Emetrix (25%) | % de "Sí" en "¿Tu usuario Emetrix funcionó cuando lo necesitaste?" (Mesa de Control) |
| | | Contrato firmado (25%) | Captura manual (dueño Legal) — "Pendiente (Legal)" si no se ha capturado |
| | | Alta ante el IMSS (25%) | Captura manual (dueño Nómina) — "Pendiente (Nómina)" si no se ha capturado |
| **KR2** Materiales de campo entregados en calendario | 40% | Materiales completos (100%) | % de cumplimiento del sondeo Materiales (regla de la sección 1, sin cambios) |
| **KR3** Capacitación en módulos | 30% | Módulos publicados en Emetrix (50%) | Captura manual (dueño Capacitación) — "Pendiente (Capacitación)" si no se ha capturado |
| | | Módulo completado, aproximación (50%) | % de cumplimiento del sondeo Tu Marca (8 de 10, regla de la sección 1, sin cambios) |

Los 3 KPI de captura manual (Contrato firmado, Alta ante el IMSS, Módulos
publicados en Emetrix) no salen de ningún sondeo de Emetrix — se capturan
directo en la tabla de la pantalla (o en "Captura rápida del mes", sección
10) y se guardan en `emetrix_ponderacion_kpi_manual` (una fila por
marca+periodo: `contrato_firmado_manual`, `imss_manual`,
`modulos_publicados_manual` — cada uno 0-100 o `null` si está pendiente ESE
MES), vía `PATCH /api/emetrix-ponderacion/kpi-manual`
(`updateContratoFirmadoManual`/`updateImssManual`/`updateModulosPublicadosManual`
en `lib/emetrix-ponderacion.ts`, las 3 reciben `periodo`).

**Ningún KPI pendiente cuenta como 0%.** El % de un KR es el promedio
ponderado SOLO de los KPI que sí tienen dato, redistribuyendo el peso entre
esos (`agregarNodoOkr` en el código); si ninguno tiene dato, el KR queda
`null` ("Sin datos"). Si no todos los KPI tienen dato, se agrega la nota
"Calculado con X de N KPI". El % del OKR aplica exactamente la misma lógica
un nivel arriba, sobre sus 3 KR (si un KR entero queda sin datos, se excluye
y su peso se redistribuye entre los otros dos).

Los pesos son **fijos** (no editables por cuenta) — a diferencia del modelo
anterior (33.3% → 30/40/30 editable con `emetrix_ponderacion_pesos`), ya que
ahora reflejan el OKR oficial tal cual. La tabla `emetrix_ponderacion_pesos`
y su lógica (`PESO_DEFAULT`, usada solo dentro de `fetchResultadoCuenta` para
el modelo de sondeos que sigue existiendo como pieza interna) quedan como
código muerto histórico, no se borraron de la base de datos.

Calculado en `fetchResultadoOkrCuenta`/`fetchResultadoOkrTodasCuentas`
(`lib/emetrix-ponderacion.ts`, ambas reciben `periodo`), que internamente
reutiliza `fetchResultadoCuenta` (para el % de cumplimiento de
Materiales/Tu Marca EN ESE PERIODO) y `fetchDetalleCarga('mesa_control',
periodo)` (para las 2 preguntas puntuales de KR1 de la carga de ese mismo
periodo) — ninguna regla de cumple/no cumple de esos sondeos cambió. Esas dos
funciones solo obtienen los datos; el cálculo del árbol en sí vive en
`construirArbolOkr` (pura, sección 9).

### 4-bis. El indicador: `{estado, valor, base, motivo}`

El nivel más bajo del árbol OKR es el **indicador** = una cuenta × un KPI (o
un KR/el OKR, agregados) × un periodo. Cada nodo del árbol (`EmetrixOkrNodo`
en `lib/types.ts`) trae un campo `indicador: EmetrixIndicador`:

```ts
type EmetrixIndicador = {
  estado: 'medido' | 'sin-medir';
  valor: number | null;   // el %, solo si estado='medido'
  base: string | null;    // "43 de 44" — el "X de Y" que sustenta el valor
  motivo: string;         // explicación en texto plano, siempre presente
};
```

Ejemplos reales del árbol:
- `{ estado: 'medido', valor: 97.73, base: '43 de 44', motivo: '43 de 44
  promotores contestaron "Sí" a "¿Pudiste entrar a tu tienda el primer
  día?".' }` — KPI "Carta de acceso y credencial" (KR1.1).
- `{ estado: 'sin-medir', valor: null, base: null, motivo: 'Falta el dato de
  Legal (fecha de firma de contrato).' }` — KPI "Contrato firmado" (KR1.3)
  sin capturar.
- `{ estado: 'medido', valor: 0, base: '0 de 12', motivo: '0 de 12
  promotores que contestaron Materiales cumplieron los requisitos.' }` — un
  0% **medido** (ej. Hanes Materiales), nunca `'sin-medir'`: la diferencia
  entre "no hay dato" y "el dato es cero" es intencional en todo el árbol.

En un nodo agregado (KR u OKR), `motivo` es "Calculado con X de N KPI/KR
(los demás están pendientes y no cuentan como 0%)" cuando no todos sus hijos
están medidos (mismo mecanismo que antes se llamaba `calculadoNota`), o la
descripción de cómo se agrega (ej. "Promedio ponderado de sus 3 KR") cuando
todos sus hijos tienen dato. `motivo` **siempre** tiene texto, medido o no —
la pantalla lo muestra en chico debajo del número (`ArbolOkrTabla` en
`components/EmetrixPonderacionAdmin.tsx`). El campo `fuente` (que ya existía)
sigue describiendo de qué sondeo/pregunta/captura sale el nodo, para la
columna "Fuente" de la tabla y del Excel — `indicador.motivo` es un texto
distinto y complementario (la explicación matemática del número), no un
duplicado.

Los campos viejos `porcentaje`/`pendienteTexto`/`calculadoNota` de
`EmetrixOkrNodo` se eliminaron — todo lo que antes leían pasó a
`indicador.valor`/`indicador.estado`/`indicador.motivo`.

## 5. Dónde ver esto en pantalla

- Cada tarjeta de sondeo (`components/EmetrixPonderacionZona.tsx`) muestra
  el % de cumplimiento como dato principal y cuántos contestaron de cuántos
  promotores, más una sección colapsable "Ver resultado por pregunta" (ver
  sección 6).
- El bloque "OKR — Ciclo de vida del promotor"
  (`components/EmetrixPonderacionAdmin.tsx`) muestra una sola tabla con el
  árbol OKR → KR → KPI (columnas Peso, % Obtenido, Fuente), con los 3 KPI de
  captura manual editables directo ahí. Reemplaza a las tablas "Resultado por
  cuenta" y "Resumen para OKR" del modelo anterior.
- Con "Todas las cuentas" seleccionado, en vez de un resumen simple se
  muestran las 3 vistas de la guía de indicadores de Operaciones: "Cómo va
  cada cuenta", "Pendientes de indicador" y "Captura rápida del mes" — ver
  sección 10.
- Botón "Descargar para OKR" (junto al selector de cuenta, visible siempre):
  ver sección 7.

## 6. Desglose por pregunta

Cada tarjeta de sondeo trae una sección colapsable "Ver resultado por
pregunta" con el % de "Sí" (Mesa de Control / Materiales) o de respuesta
correcta (Tu Marca) de cada pregunta — sobre quienes la contestaron con un
valor reconocible (Sí/No, o alguna opción), no sobre el universo completo.
Disponible tanto en el preview (recién subido el archivo, antes de guardar)
como en la carga ya guardada (`fetchDetalleCarga`/`fetchDetalleEmetrixPonderacion`,
mismo lazy-load que "Ver detalle por promotor").

Se calcula en `lib/emetrix-ponderacion.ts` (`resumenPreguntaSiNo` /
`resumenPreguntaOpcion`), a partir de las MISMAS columnas que ya exige
`validarColumnas` para calificar el sondeo — no cambia ninguna regla de
cumple/no cumple, es una vista adicional sobre el mismo cálculo. Se guarda
por carga en `emetrix_ponderacion_cargas.preguntas_resumen` (jsonb) al
momento de `guardarCarga`. Esta misma tabla alimenta los KPI de KR1 (sección
4) que salen de Mesa de Control.

**Otras cuentas, redacción distinta:** si ninguna fila trae un valor
reconocible en la columna de una pregunta (nadie contestó "Sí"/"No" en una
pregunta Sí/No, o la columna de una pregunta de opción múltiple viene vacía
en todas las filas), esa pregunta se muestra como "No reconocida en este
archivo" en vez de un 0% — evita que una redacción distinta de la pregunta
en el archivo de otra cuenta se lea como que "nadie cumplió". Esto es un
heurístico sobre columnas ya validadas por `validarColumnas` (si falta una
columna completa, la carga entera se rechaza antes de llegar aquí, con un
mensaje explícito de qué columna no encontró).

## 7. Descarga en formato OKR

Botón "Descargar para OKR" (siempre visible, junto al selector de cuenta —
no depende de qué cuenta esté seleccionada): genera un `.xlsx` con **una
hoja por cada cuenta que ya tiene al menos una carga**, mismas columnas que
el archivo oficial de Carlos:

| Nivel | Código | Área | Nombre | Descripción | Capa | Owner | Peso (%) | % Obtenido | Fuente |
|---|---|---|---|---|---|---|---|---|---|

Una fila por nodo del árbol (OKR, luego sus 3 KR, luego los KPI de cada uno —
`aplanarArbolOkr` en preorden). Peso y % Obtenido se escriben como fracción
(ej. `0.3`) con formato de celda de porcentaje, para que Excel los muestre
como "30%"/"96.59%" tal cual. Cuando un KPI está pendiente, la celda de %
Obtenido trae el texto explicativo ("Pendiente (Legal)", "Falta cargar Tu
Marca", etc.) en vez de un número. La columna Fuente es la misma que se ve
en pantalla, con la nota "Calculado con X de N KPI/KR" cuando aplica.

Implementado en `GET /api/emetrix-ponderacion/okr/excel`
(`fetchResultadoOkrTodasCuentas` + `aplanarArbolOkr`, sin parámetros — trae
TODAS las cuentas cargadas en un solo archivo). El árbol de una sola cuenta
(para la tabla en pantalla) sale de `GET /api/emetrix-ponderacion/okr?marcaId=...`.

**Nota sobre Código/Área/Capa/Owner:** estos valores (`KR1`, `KR1.1`,
"Operaciones", "Resultado"/"Actividad", "Mesa de Control"/"Legal"/"Nómina"/
"Capacitación"/"Operaciones") son una convención razonable definida en el
código (`fetchResultadoOkrCuenta`), no un mapeo 1:1 confirmado contra el
archivo original de Carlos — si ese archivo trae códigos/áreas/capas propios,
hay que ajustar las constantes ahí.

## 8. Formato largo vs. ancho

Algunas cuentas (ej. ADM) exportan el sondeo de Emetrix en formato **largo**:
una fila por respuesta, con columnas `USUARIO`, `NOMBRE`, `PREGUNTA`,
`RESPUESTA`, `FECHA ENTRADA` (y otras informativas como `POSICION`, `GRUPO`,
`CADENA`, `PUNTO`, `FECHA SALIDA`, `BOOL` — se ignoran). Otras (ej. Spin
Master) lo traen **ancho**: una fila por promotor, una columna por pregunta —
el formato que ya esperan `calcularMesaControl`/`Materiales`/`Marca`.

`detectarYConvertirFormatoLargo` (`lib/emetrix-ponderacion.ts`) detecta el
formato largo (trae columnas `PREGUNTA` y `RESPUESTA`) y lo convierte a ancho
**antes** de calificar — todo lo de abajo (validación de columnas, reglas de
cumple/no cumple, desglose por pregunta) corre exactamente igual que con un
archivo ancho, sin duplicar ninguna regla. Si el archivo ya viene ancho, la
función regresa los datos tal cual (no-op).

Reglas del pivote:
- Un **envío** = una combinación (usuario, pregunta, FECHA ENTRADA) — el
  mismo promotor puede tener varios envíos de la misma pregunta a lo largo
  del tiempo (varias visitas a tienda). Acepta tanto `FECHA ENTRADA` como
  `FECHA DE ENTRADA` (`valorAlias`, prueba las dos, usa la que exista).
- Si el promotor contestó la misma pregunta en más de un envío, se usa el de
  **FECHA ENTRADA más reciente** (`compararFechaEntrada`). Primero intenta
  `parseFechaConHora` — formato "DD/Mon/YYYY, hh:mmam" con mes en 3+ letras
  (español o inglés) y hora de 12h (ej. "24/Sep/2026, 08:33am", visto en
  Hanes) — que da precisión de minuto y es el más confiable para desempatar
  envíos del mismo día. Si no coincide con ese formato, cae a
  `parseFlexibleDate` (YYYY-MM-DD, DD/MM/YYYY, seriales de Excel) y, si
  empatan o no se pudieron parsear, al texto crudo completo como último
  desempate.
- Si esa pregunta es de opción múltiple (Tu Marca), las respuestas que
  comparten el mismo envío (mismo USUARIO+PREGUNTA+FECHA ENTRADA exacta) se
  juntan con `", "` — igual que ya se escriben las selecciones múltiples en
  un archivo ancho (`contieneOpcion` ya las separa por coma).
- Una pregunta que el promotor nunca contestó queda **ausente** (celda
  vacía) en la fila pivotada — nunca se rellena con "No". Por eso el %
  reportado por pregunta (sección 6) es sobre quienes sí la contestaron, no
  sobre el total de promotores.
- `POSICION` (columna que exige `validarColumnas` en los 3 sondeos, solo
  informativa) se toma del archivo si existe; si no, se usa `NOMBRE` como
  respaldo (a menos que `NOMBRE` ya se haya usado como USUARIO, ver abajo).

### Columna USUARIO con otro nombre (ej. Hanes)

Algunas cuentas no traen una columna llamada `USUARIO` — usan otro nombre
(ej. Hanes usa `NOMBRE`) para el código de promotor (tipo `HANPRO029`).
`normalizarColumnaUsuario` (`lib/emetrix-ponderacion.ts`) corre ANTES que
todo lo demás (antes del pivote de formato largo, antes de calificar): si no
hay columna `USUARIO`, busca cuál otra columna tiene, en al menos 90% de sus
valores no vacíos, forma de código de promotor (`/^[A-Za-z]+[0-9]+$/` —
letras seguidas de números, sin espacios) y la renombra a `USUARIO` — el
resto del pipeline nunca se entera de que originalmente se llamaba distinto.
Nunca elige columnas ya reservadas (`PREGUNTA`, `RESPUESTA`, `FECHA
ENTRADA`/`FECHA DE ENTRADA`, `FECHA SALIDA`, `BOOL`, `POSICION`).

Diagnóstico: `EmetrixDiagnosticoArchivo.columnaUsuario` trae `'No se
encontró columna USUARIO; se usó "NOMBRE" (sus valores parecen código de
promotor).'` (o `null` si el archivo ya traía `USUARIO`), visible en "Ver
detalle técnico" del preview.

Verificado 2026-09-28 con un archivo sintético (mismo patrón que Hanes: sin
USUARIO, código en NOMBRE, `FECHA DE ENTRADA` en formato "DD/Mon/YYYY,
hh:mmam", dos visitas el mismo día para un promotor) y releyendo Spin Master
y ADM reales para confirmar que sus números (OKR 65.27% y 61.49%) no
cambiaron.

**Importante — precisión de fecha/hora:** `cellToDisplay`
(`lib/importaciones.ts`, compartida con el importador de Aspel) antes
truncaba TODA fecha de Excel a `YYYY-MM-DD`. Se ajustó para conservar la hora
completa cuando la celda trae una de verdad (fecha pura a medianoche UTC
sigue truncándose igual que siempre, sin afectar al importador de Aspel) —
sin esto, dos visitas del mismo promotor el mismo día quedaban con la misma
FECHA ENTRADA truncada y sus respuestas se juntaban por error con `", "`,
rompiendo el reconocimiento de "Sí"/"No" (ver sección 6, "No reconocida").

Diagnóstico: cuando se detecta formato largo, la carga muestra "Formato largo
detectado: X filas → Y promotores (Z con más de un envío, se usó el más
reciente)" en `EmetrixDiagnosticoArchivo.formatoLargo` (visible en "Ver
detalle técnico" del preview; no se persiste en el historial de cargas).

Verificado 2026-09-27 contra el archivo real de ADM (Mesa de Control, 1958
filas, formato largo): 223 promotores únicos, Carta de acceso 99.09% (220
contestaron), Usuario en Emetrix 99.55% (223 contestaron) — coincide exacto
con lo esperado.

## 9. Cálculo separado y probado

Toda la matemática (parseo de columnas, reglas de cumple/no cumple de los 3
sondeos, desglose por pregunta, formato largo↔ancho, y el árbol OKR con sus
indicadores) vive en **`lib/emetrix-ponderacion-calc.ts`** — funciones puras:
ningún import de `@vercel/postgres`, ninguna llamada a `fetch`, nada de
pantalla. `lib/emetrix-ponderacion.ts` solo hace las consultas a la base
(la carga más reciente de un KR en un periodo, el padrón, la config de la
cuenta) y le pasa esos datos ya obtenidos a las funciones puras — la
pantalla (`components/EmetrixPonderacionZona.tsx`,
`components/EmetrixPonderacionAdmin.tsx`), la descarga en Excel
(`app/api/emetrix-ponderacion/*/excel/route.ts`) y cualquier envío futuro
(a EvolveOS, por ejemplo) usan exactamente esas mismas funciones — no hay
una segunda copia de ninguna regla.

Piezas puras clave (todas exportadas desde `lib/emetrix-ponderacion-calc.ts`,
y re-exportadas también desde `lib/emetrix-ponderacion.ts` para que las rutas
existentes no cambien su import):

- `calcularMesaControl` / `calcularMateriales` / `calcularMarca` — reglas de
  cumple/no cumple de los 3 sondeos (sección 1).
- `detectarYConvertirFormatoLargo` / `normalizarColumnaUsuario` — formato
  largo↔ancho y columna USUARIO renombrada (sección 8).
- `calcularPorcentajes` / `calcularPorcentajeRespuesta` /
  `calcularTotalPonderado` — % de respuesta vs. % de cumplimiento
  (sección 3) y el promedio ponderado redistribuyendo pesos.
- `construirArbolOkr` — arma el árbol OKR → KR → KPI completo (sección 4),
  incluyendo el `indicador` de cada nodo (sección 4-bis), a partir de datos
  ya obtenidos (no toca la base).
- `esPeriodoValido` / `periodoActual` / `formatPeriodoLabel` — periodo
  (sección 1-bis).
- `indicadoresPlanos` / `pillEstado` / `calcularPendientes` — las 3 vistas
  de indicadores (sección 10): aplanar el árbol por código, decidir el color
  de la pastilla (verde/amarillo/rojo/sin-medir) y calcular qué falta por
  dato/cuenta/headcount.

### Pruebas

`lib/emetrix-ponderacion-calc.test.ts` — corren con el test runner nativo de
Node, **sin tocar la base de datos** (no requieren `POSTGRES_URL` ni ninguna
variable de entorno; usan archivos/datos sintéticos armados en cada prueba,
nunca cuentas reales de producción):

```
npm test
# o directamente:
node --test lib/emetrix-ponderacion-calc.test.ts
```

Una prueba por regla, entre otras:
- **Respuesta más reciente**: un USUARIO duplicado en un archivo ancho, y un
  mismo envío repetido en formato largo con distinta `FECHA ENTRADA`, deben
  resolverse con la aparición/envío más reciente.
- **Vacío no es cero**: si ninguna fila trae un valor reconocible en una
  pregunta (Sí/No u opción), su `%` debe ser `null`, nunca `0`.
- **Cero medido**: un sondeo con 0% de cumplimiento real (ej. Materiales en
  Hanes) debe quedar `estado: 'medido'` con `valor: 0`, nunca `'sin-medir'`.
- **KR con KPI pendientes**: un KR con un KPI sin capturar debe redistribuir
  el peso entre los que sí tienen dato (no contar el pendiente como 0%).
- **OKR 30/40/30**: con los 3 KR medidos, el total debe ser exactamente el
  promedio ponderado `KR1×30% + KR2×40% + KR3×30%`.
- **Formato largo y ancho**: un archivo ancho no se toca (no-op), y uno largo
  se pivotea correctamente (incluye selección múltiple con `", "`).
- **Pastillas**: verde ≥90, amarillo ≥70, rojo abajo de 70, y `sin-medir`
  siempre gris (nunca rojo) aunque `valor` fuera 0 en otro contexto.
- **Pendientes**: agrupación por dato/responsable ("Falta Contrato firmado:
  N cuentas · Legal"), por cuenta ("Zuru: faltan los 3 sondeos") y headcount
  faltante, con datos sintéticos por nodo.

Esta misma suite es el punto de referencia para futuros cambios: antes de
tocar `lib/emetrix-ponderacion-calc.ts`, correr `npm test` y no romper
ninguna de estas pruebas. No crear cuentas ni cargas de prueba en la base de
producción para verificar una regla — para eso son estas pruebas.

## 10. Vistas de la guía de indicadores de Operaciones

Con "Todas las cuentas" seleccionado en `/emetrix-ponderacion`, en vez del
resumen simple anterior se muestran 3 vistas — las tres para el periodo
seleccionado arriba, y las tres con scroll horizontal para verse bien en
celular (`.emetrix-tabla-scroll` en `app/globals.css`):

### Cómo va cada cuenta

Tabla con un renglón por cuenta (TODAS las marcas registradas, no solo las
que ya cargaron algo este mes) y una columna por indicador hoja del árbol
OKR: Carta de acceso, Usuario Emetrix, Contrato, Alta IMSS, Materiales,
Módulos publicados, Módulo completado, y el OKR al final
(`components/EmetrixComoVaCadaCuenta.tsx`). Cada celda es una pastilla con el
número grande y el motivo en chico debajo:

- **Verde** si `indicador.valor >= 90`.
- **Amarillo** si `indicador.valor >= 70`.
- **Rojo** si `indicador.valor < 70`.
- **"Sin medir"**, gris con borde punteado, si `indicador.estado ===
  'sin-medir'` — nunca se ve como incumplimiento (rojo), es un hueco de
  datos, no un mal resultado.

Colores calculados por `pillEstado` (`lib/emetrix-ponderacion-calc.ts`,
pura). No hay cálculo nuevo en esta vista — lee directo el árbol OKR que ya
trae `fetchResultadoOkrTodasCuentas`.

### Pendientes de indicador

Qué falta para que cada hueco deje de serlo
(`components/EmetrixPendientesIndicador.tsx`, cálculo en `calcularPendientes`
— pura), en 3 columnas:

1. **Por dato y responsable**: por cada uno de los 7 indicadores hoja, si
   alguna cuenta lo tiene `sin-medir`, una línea "Falta {nombre}: N cuentas ·
   {owner}" con la lista de cuentas debajo.
2. **Por cuenta**: por cada cuenta con al menos un hueco, una línea
   "{cuenta}: faltan los 3 sondeos" (o la lista puntual de qué sondeo/KPI
   manual falta, y "sin headcount" si aplica).
3. **Headcount faltante**: lista simple de cuentas sin
   `emetrix_ponderacion_config.headcount_manual` capturado (no es por
   periodo — afecta el % de respuesta de los 3 sondeos, se muestra aparte de
   los huecos de indicador puntuales).

Si no hay ningún hueco, la vista muestra "✓ Ningún hueco pendiente este
periodo." en vez de 3 columnas vacías.

### Captura rápida del mes

Una sola tabla con todas las cuentas y las columnas que se capturan a mano
(Contrato firmado, Alta IMSS, Módulos publicados — DE ESTE PERIODO — y
Headcount, que NO es por periodo), para llenarlas de corrido como en Excel
sin entrar cuenta por cuenta (`components/EmetrixCapturaRapida.tsx`). Cada
celda guarda al salir del campo (`onBlur`), igual que la tabla del árbol OKR
de una sola cuenta — mismas funciones `updateContratoFirmadoManual`/
`updateImssManual`/`updateModulosPublicadosManual`/`updateHeadcountManual`,
sin una segunda copia de la lógica de guardado.
