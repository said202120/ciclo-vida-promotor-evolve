# Ficha técnica — OKR de Ponderación de Cumplimiento (Plan B)

Pantalla `/emetrix-ponderacion` (solo rol gerente). Respaldo manual del OKR
"Ciclo de vida del promotor" mientras se resuelve la integración automática
con Evolve OS. Implementación: `lib/emetrix-ponderacion.ts`.

## 1. Los 3 KR y sus reglas de cumplimiento

Cada KR se califica por promotor a partir del Excel de su sondeo de Emetrix.
Si un USUARIO aparece más de una vez en el archivo, se usa su respuesta más
reciente (última fila). Las comparaciones de columnas y respuestas son
tolerantes a mayúsculas/minúsculas, espacios y acentos.

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
   aplica por default a los 3 KR (`emetrix_ponderacion_config.headcount_manual`).
3. **Padrón interno** — promotores con supervisor asignado a esa marca,
   cruzados por `id_emetrix` contra el USUARIO del Excel. Solo se usa si la
   cuenta **no** tiene headcount (ni de cuenta ni override). Un promotor del
   padrón que no aparece en el Excel cuenta como "no contestó" (no cumple).
4. **Sin universo** — si no hay headcount ni padrón, el universo queda
   indefinido: el % de cumplimiento se sigue calculando entre quienes
   contestaron, pero el % de respuesta no se puede medir y ese KR siempre
   queda en alerta.

En modo headcount (1 o 2), "contestaron" y "cumplen" salen directo de los
promotores únicos del Excel — **no** se exige que estén en el padrón interno.
Si además existe padrón, el sistema informa internamente qué USUARIO del
Excel no se encontraron en él (para ir corrigiendo el padrón), pero no
excluye a nadie del cálculo.

## 3. Alerta de respuesta insuficiente

Por cada KR se calculan dos porcentajes por separado:

- **% de respuesta** = contestaron ÷ universo — mide cobertura del sondeo.
- **% de cumplimiento** = cumplen ÷ contestaron — mide calidad, **solo**
  entre quienes contestaron.

Un KR queda **en alerta** si:
- no hay universo definido (caso 4 de la sección 2), o
- el % de respuesta es **menor** al umbral configurado para esa cuenta
  (exactamente en el umbral no cuenta como alerta).

El umbral es editable por cuenta (`emetrix_ponderacion_config.umbral_respuesta`,
80% por default) desde la pantalla, vía `PATCH /api/emetrix-ponderacion/config`.

## 4. Pesos y cálculo del OKR

**Pesos default (todas las cuentas, incluye las que se agreguen a futuro):**

| KR | Peso |
|---|---|
| Mesa de Control | 30% |
| Materiales | 40% |
| Tu Marca | 30% |

**Historial de cambios de pesos:**
- Implementación inicial de Plan B: 33.3% cada KR (default provisional, sin
  calibrar).
- **2026-09-26** → 30% / 40% / 30%. Propuesta **"Habilitación"**, aprobada
  por Carlos.

Los pesos son editables por cuenta desde la pantalla (`PATCH
/api/emetrix-ponderacion/pesos`) y se guardan en
`emetrix_ponderacion_pesos` — solo si el gerente los toca explícitamente. El
peso **no se guarda por carga**: se resuelve en el momento de leer el
resultado, tomando el valor explícito de la cuenta si existe o, si no, el
default de arriba. Por eso, cambiar el default (como este cambio a 30/40/30)
aplica de inmediato a todas las cargas ya guardadas, sin volver a subir
ningún Excel.

**Fórmula:**

```
OKR de la cuenta = Σ (% cumplimiento del KR × peso del KR)
                   ────────────────────────────────────────
                   Σ (peso del KR), solo de los KR con carga guardada
```

Usa el **% de cumplimiento** (cumplen ÷ contestaron) de cada KR, no el % de
respuesta. Si a la cuenta le falta algún sondeo, el cálculo usa solo los KR
que sí tienen carga y reparte el peso proporcionalmente entre esos — un KR
sin datos no cuenta como 0%, simplemente queda fuera de la cuenta. La
pantalla marca explícitamente qué sondeo(s) faltan.

Si algún KR queda en alerta (sección 3), el resultado de la cuenta también
se marca en alerta — aunque el número del OKR se sigue calculando igual.

## 5. Dónde ver esto en pantalla

- Cada tarjeta de sondeo (`components/EmetrixPonderacionZona.tsx`) muestra su
  peso junto al nombre (ej. "Materiales · peso 40%"), el % de cumplimiento
  como dato principal, y cuántos contestaron de cuántos promotores. También
  trae una sección colapsable "Ver resultado por pregunta" (ver sección 6).
- El bloque "Resultado por cuenta" (`components/EmetrixPonderacionAdmin.tsx`)
  muestra la línea "Ponderación: Mesa de Control 30% · Materiales 40% · Tu
  Marca 30%" junto al total, y qué sondeo falta cuando corresponde. Debajo
  trae el bloque "Resumen para OKR" (ver sección 7).

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
`validarColumnas` para calificar el KR — no cambia ninguna regla de
cumple/no cumple, es una vista adicional sobre el mismo cálculo. Se guarda
por carga en `emetrix_ponderacion_cargas.preguntas_resumen` (jsonb) al
momento de `guardarCarga`.

**Otras cuentas, redacción distinta:** si ninguna fila trae un valor
reconocible en la columna de una pregunta (nadie contestó "Sí"/"No" en una
pregunta Sí/No, o la columna de una pregunta de opción múltiple viene vacía
en todas las filas), esa pregunta se muestra como "No reconocida en este
archivo" en vez de un 0% — evita que una redacción distinta de la pregunta
en el archivo de otra cuenta se lea como que "nadie cumplió". Esto es un
heurístico sobre columnas ya validadas por `validarColumnas` (si falta una
columna completa, la carga entera se rechaza antes de llegar aquí, con un
mensaje explícito de qué columna no encontró).

## 7. Resumen para OKR

Bloque en el panel de la cuenta (no aparece en "Todas las cuentas") que
traduce los 3 KR del sondeo al lenguaje del OKR oficial "Ciclo de vida del
promotor", con 5 filas fijas:

| Fila del OKR | De dónde sale |
|---|---|
| Carta de acceso y credencial | % de "Sí" en "¿Pudiste entrar a tu tienda el primer día?" (pregunta de Mesa de Control, sección 6) |
| Usuario en Emetrix | % de "Sí" en "¿Tu usuario Emetrix funcionó cuando lo necesitaste?" (pregunta de Mesa de Control) |
| Materiales completos | % de cumplimiento del KR Materiales, tal cual |
| Módulo completado (aproximación) | % de cumplimiento del KR Tu Marca, tal cual |
| Contrato e IMSS | Fijo: "Pendiente (Legal / Nómina)" — no sale de este sondeo, viene del padrón/Aspel |

Las dos primeras filas usan preguntas puntuales de Mesa de Control (no su %
de cumplimiento general, que exige las 4 preguntas a la vez). Si Mesa de
Control no tiene carga, esas dos filas dicen "Falta cargar Mesa de Control";
si la carga existe pero esa pregunta no se reconoció en el archivo (sección
6), dicen "Pregunta no reconocida en este archivo". Si Materiales/Tu Marca no
tienen carga, su fila dice "Falta cargar".

Calculado en `fetchResumenOkr` (`lib/emetrix-ponderacion.ts`), expuesto en
`GET /api/emetrix-ponderacion/resumen-okr?marcaId=...` y descargable en Excel
vía `GET /api/emetrix-ponderacion/resumen-okr/excel?marcaId=...`. El botón
"Copiar" en pantalla copia las 5 filas como texto plano
(`etiqueta: valor`, una por línea).
