# Ficha técnica — OKR de Ponderación de Cumplimiento (Plan B)

Pantalla `/emetrix-ponderacion` (solo rol gerente). Respaldo manual del OKR
"Ciclo de vida del promotor" mientras se resuelve la integración automática
con Evolve OS. Implementación: `lib/emetrix-ponderacion.ts`.

**2026-09-27** — la pantalla se rehízo para ser un espejo exacto (mismos
nombres, mismos pesos) del OKR oficial de Carlos que se conecta a EvolveOS,
en vez de un modelo propio de 3 KR con pesos editables. Ver sección 4.

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
directo en la tabla de la pantalla y se guardan en
`emetrix_ponderacion_config` (`contrato_firmado_manual`, `imss_manual`,
`modulos_publicados_manual` — cada uno 0-100 o `null` si está pendiente), vía
`PATCH /api/emetrix-ponderacion/config`
(`updateContratoFirmadoManual`/`updateImssManual`/`updateModulosPublicadosManual`
en `lib/emetrix-ponderacion.ts`).

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
(`lib/emetrix-ponderacion.ts`), que internamente reutiliza
`fetchResultadoCuenta` (para el % de cumplimiento de Materiales/Tu Marca) y
`fetchDetalleCarga('mesa_control')` (para las 2 preguntas puntuales de KR1) —
ninguna regla de cumple/no cumple de esos sondeos cambió.

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
- El resumen "Todas las cuentas" también se rehízo sobre este árbol: columnas
  KR1/KR2/KR3/OKR en vez de Mesa de Control/Materiales/Marca/Total.
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
  del tiempo (varias visitas a tienda).
- Si el promotor contestó la misma pregunta en más de un envío, se usa el de
  **FECHA ENTRADA más reciente** (`compararFechaEntrada`: intenta parsear
  ambas fechas con `parseFlexibleDate`, y si empatan o no se pudieron
  parsear, desempata con el texto crudo completo — así conserva la hora del
  día cuando el archivo la trae).
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
  respaldo.

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
