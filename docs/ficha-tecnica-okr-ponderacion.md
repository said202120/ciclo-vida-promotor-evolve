# Ficha técnica — OKR de Ponderación de Cumplimiento (Plan B)

Pantalla principal del portal, `/` (cualquier usuario autenticado puede
verla; solo gerente puede editar — ver la entrada de reorganización de
pantallas más abajo). `/emetrix-ponderacion` redirige a `/` — se conserva por
compatibilidad con enlaces guardados. Más `GET /api/okr-resultados` (lectura
para EvolveOS, sección 11). Respaldo manual del OKR "Ciclo de vida del
promotor" mientras se resuelve la integración automática completa con Evolve
OS. Implementación: `lib/emetrix-ponderacion.ts` (acceso a base de datos) +
`lib/emetrix-ponderacion-calc.ts` (toda la matemática, funciones puras — ver
sección 9) + `lib/okr-oficial.ts` (nombres, metas y códigos LITERALES del OKR
oficial de Dirección, archivo de datos sin lógica — ver sección 4-ter).

**2026-09-30 (corrección: calificación de Tu Marca — P2/P7 "contiene", el
resto "exacto")** — el sondeo Tu Marca (sección 1) mostraba una diferencia
contra la plataforma de Dirección. Dos correcciones, sin tocar el umbral de
aprobación (8/10) ni ninguna otra regla:

1. **`modo` de 6 preguntas estaba invertido.** Solo P2 y P7 son de selección
   múltiple (correctas si la respuesta INCLUYE la opción correcta); las
   otras 8 exigen la opción EXACTA. Antes, 6 de esas 8 (P1, P3, P4, P5, P6,
   P10 — todas menos P8 y P9, que ya estaban bien) tenían `modo: 'contiene'`
   por error, aceptando de más selecciones múltiples que Dirección califica
   como incorrectas.
2. **`contieneOpcion` no podía acertar P2 en absoluto.** El texto de la
   opción correcta de P2 ("Lo que caduca antes, al frente") trae una coma
   propia; la función partía CUALQUIER valor por coma antes de comparar, así
   que una selección única de esa opción (sin marcar ninguna otra) se
   fragmentaba en dos pedazos que nunca calzaban con el texto completo —
   P2 quedaba matemáticamente imposible de acertar. Se agregó una
   comparación directa del valor completo contra la opción buscada, antes de
   partir por coma (sección 1).

"Una pregunta sin contestar cuenta como no correcta, pero no descalifica al
promotor" ya funcionaba correctamente (`cumple = aciertos >= 8` sobre las 10
preguntas fijas, sin ningún gate adicional por preguntas sin contestar) — se
agregaron pruebas que lo confirman explícitamente, para que quede blindado.

Confirmado con datos sintéticos que reproducen la estructura del archivo
real de Zuru (`TU_MARCA_ZURU.xlsx`, `lib/emetrix-ponderacion-calc.test.ts`):
47 contestaron, 30 aprueban (63.83%), con el desglose real por pregunta (P1
39/40, P2 20/45, P3 40/43, P4 43/43, P5 17/41, P6 41/42, P7 32/40, P8 39/40,
P9 36/37, P10 36/38). Ningún peso ni el umbral de 8/10 cambiaron. `npm test`
(48 pruebas) verde, `npx tsc --noEmit` y `npm run build` sin errores.

**2026-09-30 (corrección: envíos vacíos y "más reciente" por fecha, no por
orden del archivo)** — dos errores en cómo se elige el envío de cada
promotor en los 3 sondeos, en ambos formatos (ancho y largo). Ninguna regla
de cumple/no cumple ni ningún peso cambió — solo QUÉ FILA se usa como la
respuesta del promotor. Ver sección 8 ("Envíos vacíos y 'más reciente' por
fecha") para el detalle completo:

1. **Envíos vacíos no cuentan.** Un envío (fila, ya en formato ancho) sin
   ninguna respuesta reconocible en las preguntas que califican el sondeo se
   ignora por completo al elegir el envío del promotor — antes, un envío así
   podía "ganar" la elección (si era el último del archivo, o el de fecha
   más reciente) y el promotor terminaba contando como "contestó, no
   cumple" en vez de quedar fuera del cálculo. Si un promotor solo tiene
   envíos vacíos, ya no cuenta como "contestó". Nuevo campo
   `EmetrixDiagnosticoArchivo.enviosVacios`, mostrado como "X envíos sin
   ninguna respuesta no se contaron (vacío no es cero)" en "Ver detalle
   técnico" del preview, y persistido por carga (`filas_envios_vacios`,
   migración en `schema.sql`) para el historial.
2. **Más reciente por FECHA ENTRADA, no por orden del archivo.** En un
   archivo ANCHO, cuando un USUARIO aparece más de una vez, `deduplicarPorUsuario`
   ahora compara `FECHA ENTRADA`/`FECHA DE ENTRADA` (mismo `compararFechaEntrada`
   que ya usaba el pivote de formato largo) en vez de quedarse ciegamente con
   la última fila — antes, un envío más viejo que por casualidad quedaba
   después en el archivo le ganaba a uno más reciente. Si el archivo no trae
   esa columna, sigue usando el orden del archivo (sin cambio de
   comportamiento para esos casos). En formato LARGO, la selección del envío
   más reciente por (usuario, pregunta) (`esEnvioMasReciente`) ahora también
   ignora los envíos vacíos primero — una visita posterior en la que el
   promotor no contestó ESA pregunta ya no borra una respuesta real de una
   visita anterior, sin importar cuál sea más reciente.

Ambos ajustes viven en `deduplicarPorUsuario` y
`detectarYConvertirFormatoLargo` (`lib/emetrix-ponderacion-calc.ts`); las 3
funciones de cálculo (`calcularMesaControl`/`calcularMateriales`/`calcularMarca`)
ahora pasan sus propias preguntas calificables como `columnasRelevantes` para
decidir si un envío está vacío (Materiales incluye celular/Emetrix
condicionalmente, igual que ya exige `incluyeCelular` para cumplir).

Confirmado con datos sintéticos que reproducen la estructura del archivo
real de Zuru (`lib/emetrix-ponderacion-calc.test.ts`): Materiales
(celular=Sí) pasa a 47 contestaron/35 cumplen = 74.47%; Mesa de Control
Carta de acceso 48 de 49 = 97.96%, Usuario Emetrix 46 de 47 = 97.87%. Los
fixtures de Spin Master/ADM/Hanes (sección 9) NO se tocaron a ciegas: sus
pruebas alimentan `construirArbolOkr` directo con `{cumplieron, respondieron,
porcentaje}` ya agregados — no pasan por `deduplicarPorUsuario` ni por
`detectarYConvertirFormatoLargo` — así que el cambio de código no les afecta
por construcción; si sus archivos reales tenían envíos vacíos o el problema
de "más viejo gana", sus números sí podrían moverse al volver a subir esos
archivos, pero eso requiere releer los archivos reales (no se guardan en la
base — solo el resultado ya calculado) y no se hizo aquí. `npm test` (43
pruebas) verde, `npx tsc --noEmit` y `npm run build` sin errores.

**Nota — cargas ya guardadas:** la base de datos NO guarda el Excel
original, solo el resultado ya calculado (`cumplieron`/`porcentaje`/detalle
por promotor); no hay forma de "recalcular" una carga guardada sin volver a
subir su mismo archivo. Para corregir el historial de una cuenta/periodo ya
cargado, hay que volver a subir el mismo archivo desde la pantalla — con la
corrección ya en producción, se calculará bien la próxima vez.

**2026-09-28 (ajuste de permisos de Administración)** — dentro del menú
"Administración" (entrada anterior), mesa_control/nomina ahora SOLO ven
"Padrón" (con Importar Aspel) — Usuarios, Marcas y Exámenes quedan
exclusivos del usuario de Omar Said. Dos niveles en `lib/admin-permisos.ts`:
`puedeVerAdministracion` (Padrón: Omar Said + mesa_control/nomina, sin
cambio) y el nuevo `puedeVerAdminCompleta` (Usuarios/Marcas/Exámenes: SOLO
Omar Said, por email). `lib/auth.ts` agrega `requireAdminCompleta()` junto a
`requireAdministracion()` — las rutas de Usuarios (`/api/usuarios`), Marcas
(`/api/marcas*`, `/api/ejecutivos*`) y Exámenes (`/api/capacitacion-modulos`,
`/api/capacitacion-preguntas*`, `/api/capacitacion-opciones*`) pasan a
`requireAdminCompleta`; las de Padrón (promotores, módulos, alertas, meses,
kpis, materiales, comparación de ingresos, recordatorios,
`/api/capacitacion-modulos/basico`, `/api/capacitaciones/resultados`) se
quedan en `requireAdministracion`. Caso especial: `/api/supervisores` (GET,
selector de "supervisor asignado" del padrón) sigue en `requireAdministracion`
porque lo usa Padrón; crear/renombrar/borrar un supervisor (POST/PATCH/DELETE,
parte de la pantalla Marcas) pasa a `requireAdminCompleta`. `SiteHeader.tsx`
muestra "Padrón" en el dropdown si `puedeVerAdministracion`, y
Usuarios/Marcas/Exámenes solo si además `puedeVerAdminCompleta`. Las 3
páginas (`app/usuarios`, `app/marcas`, `app/capacitaciones/page.tsx`)
redirigen a `/` si `!puedeVerAdminCompleta`, igual que antes. Ninguna regla
de cumple/no cumple ni ningún cálculo del OKR cambió — `npm test` (38
pruebas) sigue confirmando Spin Master 65.27%, ADM 61.49% y Hanes 43.58%
para 2026-09.

**2026-09-28 (reorganización de pantallas del portal)** — "Ciclo de vida del
promotor" (antes `/emetrix-ponderacion`, exclusivo de gerente) es ahora la
pantalla principal del portal en `/`, visible para CUALQUIER usuario
autenticado — solo gerente puede editar (subir archivos, capturar KPI manual,
umbral, headcount); los demás roles la ven en solo lectura
(`EmetrixPonderacionAdmin.tsx` calcula `puedeEditar` con `fetchMe()` y lo pasa
a `EmetrixPonderacionZona`/`EmetrixKpiBaseInputs`/`EmetrixCapturaRapida`; las
rutas GET de `/api/emetrix-ponderacion/*` pasaron de `requireGerente` a
`requireSession`, las de escritura — POST/PATCH — siguen exigiendo gerente).
`/emetrix-ponderacion` ahora solo redirige a `/`. Encabezado con el logo de
Evolve y una banda decorativa del trayecto del promotor
(`components/TrayectoBanda.tsx`, Ingreso → Kit admin. → Materiales →
Módulos, sin datos — puramente visual). "Plan B" y "Volver al tablero"
desaparecieron de toda la interfaz.

La pantalla anterior (roster de promotores, Importar Aspel, materiales,
módulos — SIN el círculo de "Resultado OKR" ni las 3 franjas KR1/KR2/KR3 de
`lib/calc.ts`, que se quitaron de esta vista para que el único resultado
OKR oficial sea el de "/") vive ahora en `/padron`, dentro de un menú
discreto "Administración" (junto con `/usuarios`, `/marcas` y
`/capacitaciones`) visible SOLO para el usuario de Omar Said (por email,
`lib/admin-permisos.ts`) y para los roles `mesa_control`/`nomina` — ni
gerente ni ejecutivo la ven por su rol. Quien entra por URL directa sin
permiso vuelve a "/" (`redirect('/')` en cada `page.tsx` de Administración).
Las rutas de esas 4 pantallas (antes `requireGerente`/`requireDashboard`)
ahora usan `requireAdministracion()` (`lib/auth.ts`), que exige sesión +
`puedeVerAdministracion`. "Cerrar mes" se ocultó de `/padron`: solo escribía
en `cierres_mensuales`, tabla que ya no lee ninguna otra pantalla — el botón
y sus rutas (`/api/cierres`, `/api/cierres/cerrar`) se dejaron sin tocar
(código vivo pero sin UI que lo dispare), no se borró nada. `ModuleToggles`
(publicar mod1-mod4 + comprometidos) también se dejó de mostrar ahí por la
misma razón (alimentaba el % de KR3 de `lib/calc.ts`); su tabla y su API
(`/api/modulos`) siguen intactas.

Menú simple para todos los roles (`components/SiteHeader.tsx`, en todas las
pantallas autenticadas): "Ciclo de vida del promotor" (→ `/`), "Cambiar
contraseña" y "Cerrar sesión"; "Administración ▾" se agrega como dropdown
discreto solo si `puedeVerAdministracion`.

Ninguna regla de cumple/no cumple, ningún peso ni ningún cálculo del OKR
oficial cambió — confirmado con `npm test` (38 pruebas), que sigue dando
Spin Master 65.27%, ADM 61.49% y Hanes 43.58% para 2026-09. Verificado
`npx tsc --noEmit` y `npm run build` sin errores tras el reacomodo de rutas.

**2026-09-27 (diseño homologado de la guía de Operaciones)** — `/emetrix-ponderacion`
adopta la paleta y tipografía de la guía de indicadores de Operaciones. Es un
cambio puramente visual, aplicado SOLO a esta pantalla:

- Los colores viven como variables CSS (`--bg`, `--surface`, `--surface-2`,
  `--border`, `--text`, `--text-dim`, `--text-mute`, `--accent`, `--accent-2`,
  `--navy`, `--ok`, `--warn`, `--danger`) definidas dentro de `.emetrix-tema`
  (`app/globals.css`), que se pone en el `.wrap` raíz de
  `EmetrixPonderacionAdmin.tsx`. El truco: casi todo el CSS compartido
  (`.roster`, `.pill`, `.roster-table`, `.add-row`, `.emetrix-*`) ya usa
  `var(--ink)`/`var(--panel)`/`var(--line)`/`var(--good)`/`var(--bad)`/
  `var(--accent)`, así que remapear esas variables dentro de `.emetrix-tema`
  (`--ink: var(--text)`, etc.) basta para que todo el árbol adopte la paleta
  nueva sin tocar un solo selector existente y sin afectar ninguna otra
  pantalla (que sigue leyendo `:root`).
- Tipografía Inter en toda la pantalla (Google Font agregada en
  `app/layout.tsx`, con respaldo `-apple-system, 'Segoe UI', sans-serif`).
- Fondo liso `--bg` en vez del degradado ambiental compartido: `body:has(.emetrix-tema)`
  pinta encima del fondo global, y `AmbientBackground.tsx` deja de renderizar
  los orbes cuando `pathname` empieza con `/emetrix-ponderacion`.
- Tarjetas (`.roster`, `.emetrix-preview`, `.month-bar`) con radio 12-14px,
  número de cumplimiento en 30px/800 con la etiqueta "Cumplimiento" arriba
  (`.emetrix-kpi-label`) y la línea de contexto ("Contestaron X de Y
  promotores") debajo, ya existente.
- Pastillas: verde ≥90/amarillo ≥70/rojo abajo (regla sin cambios, sección
  10), motivo en 11px gris (`.emetrix-indicador-motivo`), "Sin medir" gris con
  borde punteado (`.pill.sin-medir`, ya existía). La alerta de respuesta baja
  (`.emetrix-nota`) pasa a ámbar en vez de rojo — es un hueco de cobertura, no
  un mal resultado.
- Tablas (`table.roster-table` dentro de `.emetrix-tema`): encabezado
  `--navy` con texto blanco, 13px, renglones alternados tenues, scroll
  horizontal en celular (clases `.emetrix-tabla-scroll`/
  `.emetrix-detalle-tabla-wrap`, ya existentes).
- Barra superior (`.emetrix-cuenta-bar`) con título, selector de periodo y
  cuenta, botón "Descargar para OKR" en `--accent`; en celular (380px) se
  envuelve en varias líneas en vez de desbordar (`flex-wrap: wrap`).

Ninguna regla de cumple/no cumple, ningún peso ni ningún cálculo cambió —
confirmado con `npm test` (38 pruebas), que sigue dando Spin Master 65.27%,
ADM 61.49% y Hanes 43.58% para 2026-09.

**2026-09-27 (nombres oficiales, metas y lectura para EvolveOS)** — los
nombres LITERALES del OKR oficial "Ciclo de vida del promotor" (copiados
exactamente de Dirección, con su meta y un `kpiCode` vacío pendiente de
Dirección) viven ahora en un solo archivo de datos sin lógica,
`lib/okr-oficial.ts` — toda la app los toma de ahí, nunca hay una segunda
copia del texto (sección 4-ter). Cada número en pantalla ahora muestra su
base y su meta oficial, ej. "97.73% · 43 de 44 · meta 100%"
(`formatIndicadorConMeta`). Se agregó `GET /api/okr-resultados` (sección 11),
protegido con `Authorization: Bearer <OKR_LECTURA_TOKEN>`, para que EvolveOS
lea los resultados en el formato de la guía — reutiliza exactamente
`fetchResultadoOkrTodasCuentas`/`construirArbolOkr`, sin una segunda copia del
cálculo; el token todavía no se generó (queda pendiente de que Dirección lo
pida). Se confirmó que `.env.local` está en `.gitignore` y que ningún secreto
está en el código ni en el historial de git. Ninguna regla de cumple/no
cumple ni ningún peso cambió — confirmado con `npm test`, que sigue dando
Spin Master 65.27%, ADM 61.49% y Hanes 43.58% para 2026-09.

**2026-09-27 (captura con base)** — los 3 KPI de captura manual (Contrato
firmado, Alta ante el IMSS, Módulos publicados) dejaron de capturarse como un
solo %: ahora se capturan dos números por cuenta y periodo (numerador y
denominador, ej. "18 de 20") y el sistema calcula el %, la base y el motivo en
palabras (sección 4-bis). Los indicadores que salen de sondeo (Carta de
acceso, Usuario Emetrix, Materiales, Módulo completado) ahora se agrupan por
sondeo en "Pendientes de indicador", con "Ejecutivo de la cuenta" como
responsable en vez del área dueña del KPI (sección 10). El motivo de "Módulo
completado" ahora deja explícito que es una aproximación. Ninguna regla de
cumple/no cumple ni ningún peso cambió — confirmado con `npm test`, que sigue
dando Spin Master 65.27%, ADM 61.49% y Hanes 43.58% para 2026-09 (esas 3
cuentas no tenían capturado ningún KPI manual, ni con el formato viejo ni con
el nuevo, así que su OKR no se mueve).

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
Si un USUARIO aparece más de una vez, se usa su envío más reciente por FECHA
ENTRADA (o el último del archivo si no hay esa columna) — un envío sin
ninguna respuesta a las preguntas del sondeo no cuenta (ver sección 8,
"Envíos vacíos y 'más reciente' por fecha"). Las comparaciones de columnas y
respuestas son tolerantes a mayúsculas/minúsculas,
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

10 preguntas sobre manejo de marca en anaquel (ver `MARCA_PREGUNTAS` en el
código para el texto exacto de cada una y la respuesta correcta). Regla
oficial confirmada contra la plataforma de Dirección (2026-09-30):

- **P2 y P7** (selección múltiple): correcta si la respuesta del promotor
  **INCLUYE** la opción correcta, aunque haya marcado más de una
  (`modo: 'contiene'`).
- **P1, P3, P4, P5, P6, P8, P9, P10** (opción única): correcta **solo** si
  eligió **EXACTAMENTE** la opción correcta — marcar varias es incorrecta
  aunque incluyan la correcta (`modo: 'exacto'`).
- Una pregunta sin contestar cuenta como no correcta, pero **no descalifica**
  al promotor — solo resta hacia el total de aciertos.
- Cumple si acierta **8 de 10 o más** (`aciertos >= 8`, sobre las 10
  preguntas fijas, contestadas o no).

`contieneOpcion` (comparación de P2/P7) primero compara el valor completo
contra la opción buscada antes de partir por coma — necesario porque el
texto de la opción correcta de P2 ("Lo que caduca antes, al frente") trae
una coma propia; partir a ciegas fragmentaría una selección única (sin
ninguna otra opción marcada) en dos pedazos que nunca calzarían con la
opción completa, dejando esa pregunta imposible de acertar.

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
| | | Contrato firmado (25%) | Captura manual con base (dueño Legal) — "Sin medir" si no se ha capturado |
| | | Alta ante el IMSS (25%) | Captura manual con base (dueño Nómina) — "Sin medir" si no se ha capturado |
| **KR2** Materiales de campo entregados en calendario | 40% | Materiales completos (100%) | % de cumplimiento del sondeo Materiales (regla de la sección 1, sin cambios) |
| **KR3** Capacitación en módulos | 30% | Módulos publicados en Emetrix (50%) | Captura manual con base (dueño Capacitación) — "Sin medir" si no se ha capturado |
| | | Módulo completado, aproximación (50%) | % de cumplimiento del sondeo Tu Marca (8 de 10, regla de la sección 1, sin cambios) |

Los 3 KPI de captura manual (Contrato firmado, Alta ante el IMSS, Módulos
publicados en Emetrix) no salen de ningún sondeo de Emetrix. **Desde
2026-09-27 se capturan con base**: en vez de un solo %, el gerente captura dos
números por cuenta y periodo (numerador y denominador) directo en la tabla de
la pantalla o en "Captura rápida del mes" (sección 10):

| KPI | Numerador | Denominador |
|---|---|---|
| Contrato firmado | Firmados antes del ingreso | Nuevos ingresos del mes |
| Alta ante el IMSS | Altas antes del ingreso | Nuevos ingresos del mes |
| Módulos publicados en Emetrix | Publicados | Programados a la fecha |

El sistema calcula el indicador `{estado, valor, base, motivo}` (sección
4-bis) a partir de esos dos números — ver `validarBaseManual`/
`construirArbolOkr` en `lib/emetrix-ponderacion-calc.ts`:

- Si falta cualquiera de los dos números, el indicador sigue **"Sin medir"**
  (no cuenta como 0%).
- Se valida que el **numerador no sea mayor al denominador**
  (`validarBaseManual`, corre en el PATCH antes de guardar — un numerador
  mayor nunca llega a la base de datos).
- Si el **denominador es 0** (no hubo nuevos ingresos en el mes, o no hay
  módulos programados), el indicador vale **100%** con un motivo explícito
  ("Sin nuevos ingresos en el periodo."/"Sin módulos programados en el
  periodo.") en vez de quedar "Sin medir" o dividir entre cero.
- Con ambos números, `valor` = numerador/denominador, `base` = "18 de 20" y
  `motivo` es una frase en palabras (ej. "18 de 20 nuevos ingresos firmaron
  contrato antes de su primer día.").

Se guardan en `emetrix_ponderacion_kpi_manual` (una fila por marca+periodo):
`contrato_firmados_antes`/`contrato_nuevos_ingresos`,
`imss_altas_antes`/`imss_nuevos_ingresos`,
`modulos_publicados_count`/`modulos_programados_count` — cada uno numérico o
`null` si está pendiente ESE MES — vía `PATCH /api/emetrix-ponderacion/kpi-manual`
(`updateContratoFirmadoManual`/`updateImssManual`/`updateModulosPublicadosManual`
en `lib/emetrix-ponderacion.ts`, las 3 reciben `periodo` + numerador +
denominador). Las 3 columnas `_manual` (`contrato_firmado_manual`, etc.) del
formato anterior a este cambio **no se borraron y se siguen leyendo**: si una
cuenta/periodo no tiene numerador/denominador capturado pero sí tiene ese %
viejo, el indicador lo sigue mostrando tal cual (`legacyPorcentaje` en
`EmetrixKpiManualBase`, `lib/types.ts`) — ninguna captura ya hecha se pierde
ni cambia de valor por este cambio. Ya no se escribe en esas 3 columnas viejas
desde el PATCH; quedan como respaldo de lectura únicamente.

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
- `{ estado: 'medido', valor: 90, base: '18 de 20', motivo: '18 de 20 nuevos
  ingresos firmaron contrato antes de su primer día.' }` — KPI "Contrato
  firmado" (KR1.3) con captura con base (sección 4).
- `{ estado: 'medido', valor: 100, base: '0 de 0', motivo: 'Sin nuevos
  ingresos en el periodo.' }` — Contrato firmado o Alta IMSS cuando el
  denominador (nuevos ingresos del mes) es 0.
- `{ estado: 'medido', valor: 75.11, base: '166 de 221', motivo:
  'Aproximación: 166 de 221 aprobaron Tu Marca (8 de 10 correctas).' }` — KPI
  "Módulo completado (aproximación)" (KR3.2): el motivo deja explícito que es
  una aproximación (no una medición directa de "módulo completado").

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

### 4-ter. Nombres oficiales y metas (`lib/okr-oficial.ts`)

Los nombres LITERALES del OKR oficial "Ciclo de vida del promotor" —
copiados exactamente como los entregó Dirección, con su meta oficial y un
`kpiCode` (código de EvolveOS, pendiente de que Dirección lo defina) — viven
en **`lib/okr-oficial.ts`**: un archivo de **datos, sin lógica** (ninguna
función, ningún cálculo, ningún import de otro módulo de la app). Es la
única fuente de este texto en todo el proyecto — la pantalla, la descarga en
Excel y la lectura para EvolveOS (sección 11) lo toman de ahí, nunca hay una
copia propia escrita a mano en otro archivo.

```ts
export const OKR_OFICIAL = {
  nombreOficial: 'Ciclo de vida del promotor',
  kpiCode: null,
  krs: [
    {
      codigo: 'KR1',
      nombreOficial: 'Kit administrativo entregado a tiempo',
      kpiCode: null,
      kpis: [
        { codigo: 'KR1.1', nombreOficial: '% de nuevos ingresos con carta de acceso y credencial entregadas antes del primer día', meta: 100, kpiCode: null },
        // ... KR1.2, KR1.3, KR1.4
      ],
    },
    // ... KR2, KR3
  ],
};
```

`codigo` es el mismo código interno que ya usa el árbol OKR (`KR1`, `KR1.1`,
etc.) — así se cruza este archivo de datos contra el árbol sin repetir texto.
`construirArbolOkr` (`lib/emetrix-ponderacion-calc.ts`) arma, a partir de
`OKR_OFICIAL`, un mapa código → `{nombreOficial, meta, kpiCode}`
(`OKR_OFICIAL_POR_CODIGO`/`oficialDe`) y lo mezcla en CADA nodo del árbol al
construirlo — `nodoAgregado` para OKR/KR y las 4 funciones que arman un KPI
(`kpiDeMesaControl`/`kpiManualBase`/`kpiDeSondeo`). Por eso `EmetrixOkrNodo`
trae 3 campos nuevos junto a los que ya tenía:

- **`nombreOficial: string`** — el texto literal. En OKR y KR ya coincide
  exactamente con el `nombre` corto que se mostraba antes (son el mismo
  texto, ej. KR2 = "Materiales de campo entregados en calendario" en ambos
  campos) — el cambio real está en los 7 KPI hoja, donde `nombre` sigue
  siendo la etiqueta corta ("Contrato firmado") y `nombreOficial` es la
  oración completa de Dirección ("% de nuevos ingresos con contrato firmado
  antes del primer día"). **En pantalla se sigue usando el nombre corto**,
  con el oficial en chico debajo (`ArbolOkrTabla`,
  `.emetrix-nombre-oficial` en `app/globals.css`) — nunca se reemplaza la
  etiqueta corta por la oración completa en la columna Nombre.
- **`meta: number | null`** — la meta oficial del KPI (100% en 6 de los 7
  KPI, 90% en "Módulo completado"). `null` en los nodos OKR/KR agregados, que
  no tienen una meta individual propia (la meta es del indicador puntual, no
  de su promedio ponderado).
- **`kpiCode: string | null`** — el código que use EvolveOS para ese
  indicador. `null` en los 3 niveles hasta que Dirección lo entregue — no se
  inventó ningún código propio para no chocar con el que EvolveOS vaya a
  usar.

**Metas en pantalla:** cada número medido se muestra junto a su base y su
meta con `formatIndicadorConMeta` (`lib/emetrix-ponderacion-calc.ts`, pura),
ej. `"97.73% · 43 de 44 · meta 100%"` — sin base ni meta (nodo agregado o sin
meta propia) queda solo `"97.73%"`; `"Sin medir"` nunca trae base ni meta. Se
usa en la columna "% Obtenido" de `ArbolOkrTabla`
(`components/EmetrixPonderacionAdmin.tsx`); en los 3 KPI de captura manual
(que muestran los 2 inputs de numerador/denominador en vez de texto) la meta
se agrega aparte, en una línea "Meta: 100%" debajo de los inputs. La vista
"Cómo va cada cuenta" (sección 10) no se tocó — sus pastillas siguen
mostrando solo `%` + motivo, sin meta, para no saturar una tabla de 8
columnas × todas las cuentas.

**Descarga en Excel** (sección 7): la columna "Descripción" de un KPI ahora
es el `nombreOficial` literal (antes era una paráfrasis propia); en OKR/KR
sigue siendo el resumen propio, porque su `nombreOficial` ya es idéntico a la
columna "Nombre" (mostrarlo dos veces sería redundante). La columna "Fuente"
ahora agrega `· meta X%` al final cuando el nodo tiene meta propia
(`app/api/emetrix-ponderacion/okr/excel/route.ts`).

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

### Envíos vacíos y "más reciente" por fecha (corrección 2026-09-30)

Aplica a los 3 sondeos, en ambos formatos (ancho y largo) — dos reglas sobre
CUÁL fila se usa como la respuesta de cada promotor, sin tocar ninguna regla
de cumple/no cumple ni ningún peso:

- **Un envío sin ninguna respuesta no cuenta ("vacío no es cero" aplicado al
  envío completo, no solo a una pregunta).** En archivo ANCHO,
  `deduplicarPorUsuario` (`lib/emetrix-ponderacion-calc.ts`) recibe las
  columnas que califican ese sondeo (`columnasRelevantes` — las 4 preguntas
  de Mesa de Control, las 6-8 de Materiales según `incluyeCelular`, las 10 de
  Marca) e ignora, antes de elegir el envío de cada USUARIO, cualquier fila
  donde TODAS esas columnas vienen vacías. Un envío vacío nunca gana la
  elección aunque sea el más reciente o el último del archivo; si TODOS los
  envíos de un promotor están vacíos, ese promotor no entra a `filas` — no
  cuenta como "contestó". En formato LARGO, el mismo principio se aplica al
  elegir el envío más reciente por (usuario, pregunta) dentro de
  `detectarYConvertirFormatoLargo` (`esEnvioMasReciente`): un envío sin
  ninguna `RESPUESTA` nunca le gana a uno con respuesta, sin importar su
  `FECHA ENTRADA` — así una visita posterior en la que el promotor no
  contestó esa pregunta puntual no borra la respuesta real de una visita
  anterior.
- **El envío más reciente se elige por FECHA ENTRADA, no por el orden del
  archivo — también en formato ANCHO.** Antes, si un USUARIO aparecía más de
  una vez en un archivo ancho, `deduplicarPorUsuario` se quedaba ciegamente
  con la última fila leída, sin mirar ninguna fecha (el formato largo ya
  comparaba fechas vía `compararFechaEntrada` para elegir por pregunta, pero
  el ancho no). Ahora, si el archivo trae `FECHA ENTRADA`/`FECHA DE ENTRADA`,
  se usa el mismo `compararFechaEntrada` para quedarse con el envío (no
  vacío) de fecha más reciente entre los duplicados de un USUARIO. Si el
  archivo no trae esa columna, sigue usando el orden del archivo (el último
  no vacío gana) — mismo comportamiento que antes para esos casos.

Diagnóstico: `EmetrixDiagnosticoArchivo.enviosVacios` cuenta cuántos envíos
(filas, ya en formato ancho) se ignoraron por estar vacíos — mostrado como
"X envíos sin ninguna respuesta no se contaron (vacío no es cero)" en "Ver
detalle técnico" del preview (`EmetrixPonderacionZona.tsx`) cuando es mayor a
0, y sumado al total de filas "descartadas" ahí y en la columna "Filas
leídas / descartadas" del historial (`EmetrixPonderacionAdmin.tsx`).
Persistido por carga en `emetrix_ponderacion_cargas.filas_envios_vacios`
(migración en `schema.sql`, `alter table ... add column if not exists`); las
cargas guardadas antes de esta corrección quedan con este campo en `null`
(se muestra como 0 — el dato no se puede reconstruir retroactivamente sin
volver a subir el archivo original, que no se guarda en la base).

Pruebas en `lib/emetrix-ponderacion-calc.test.ts` (sección 9): un envío
vacío se ignora y, si son todos los de un promotor, no cuenta como
"contestó"; en archivo ancho el envío más reciente por fecha le gana al
último del archivo; en formato largo un envío posterior sin respuesta no
borra la respuesta real de uno anterior; y dos pruebas de confirmación con
datos sintéticos que reproducen la estructura real de Zuru: Materiales
(celular=Sí) 47 contestaron/35 cumplen (74.47%), Mesa de Control Carta de
acceso 48 de 49 (97.96%) y Usuario Emetrix 46 de 47 (97.87%).

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
pantalla (sí importa `lib/okr-oficial.ts`, que a su vez es puro archivo de
datos — sección 4-ter). `lib/emetrix-ponderacion.ts` solo hace las consultas
a la base (la carga más reciente de un KR en un periodo, el padrón, la config
de la cuenta) y le pasa esos datos ya obtenidos a las funciones puras — la
pantalla (`components/EmetrixPonderacionZona.tsx`,
`components/EmetrixPonderacionAdmin.tsx`), la descarga en Excel
(`app/api/emetrix-ponderacion/*/excel/route.ts`) y la lectura para EvolveOS
(`GET /api/okr-resultados`, sección 11) usan exactamente esas mismas
funciones — no hay una segunda copia de ninguna regla.

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
- `validarBaseManual` — valida que el numerador no sea mayor al denominador
  en la captura con base de Contrato firmado/Alta IMSS/Módulos publicados
  (sección 4); la usan tanto `construirArbolOkr` como el PATCH de
  `/api/emetrix-ponderacion/kpi-manual` antes de guardar.
- `esPeriodoValido` / `periodoActual` / `formatPeriodoLabel` — periodo
  (sección 1-bis).
- `indicadoresPlanos` / `pillEstado` / `calcularPendientes` — las 3 vistas
  de indicadores (sección 10): aplanar el árbol por código, decidir el color
  de la pastilla (verde/amarillo/rojo/sin-medir) y calcular qué falta por
  dato/cuenta/headcount.
- `oficialDe` — mezcla `{nombreOficial, meta, kpiCode}` de `lib/okr-oficial.ts`
  en cada nodo del árbol al construirlo (sección 4-ter); `formatIndicadorConMeta`
  — texto "97.73% · 43 de 44 · meta 100%" para mostrar un indicador junto a su
  meta.
- `construirRespuestaOkrLectura` / `periodoInicioISO` — arman la respuesta de
  `GET /api/okr-resultados` (sección 11) a partir del árbol OKR ya calculado
  de cada cuenta — ninguna regla ni cálculo nuevo, solo el formato de salida
  que espera EvolveOS.

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
- **Envíos vacíos y "más reciente" por fecha (2026-09-30)**: un envío sin
  ninguna respuesta se ignora al elegir el envío de un promotor, y si todos
  los suyos están vacíos no cuenta como "contestó"; en archivo ancho, el
  envío más reciente por `FECHA ENTRADA` le gana al último del archivo
  aunque sea más viejo; en formato largo, un envío posterior sin respuesta
  no borra la respuesta real de uno anterior. Dos pruebas de confirmación
  con datos sintéticos que reproducen la estructura real de Zuru: Materiales
  (celular=Sí) 47 contestaron/35 cumplen (74.47%), Mesa de Control Carta de
  acceso 48 de 49 (97.96%) y Usuario Emetrix 46 de 47 (97.87%).
- **Calificación de Tu Marca — P2/P7 "contiene", el resto "exacto"
  (2026-09-30)**: P2 y P7 (selección múltiple) cuentan como correctas si la
  respuesta incluye la opción correcta aunque marque más de una; las otras 8
  (opción única) exigen la opción EXACTA — marcar varias es incorrecto
  aunque incluyan la correcta. Una pregunta sin contestar no descalifica
  (con 8+ correctas entre las contestadas, aprueba), pero sí resta hacia el
  umbral de 8 si faltan demasiadas. Prueba de confirmación con datos
  sintéticos que reproducen la estructura real de Zuru
  (`TU_MARCA_ZURU.xlsx`): 47 contestaron, 30 aprueban (63.83%), con el
  desglose real de las 10 preguntas.
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
- **Pendientes**: agrupación por dato/responsable — los 3 KPI manuales por
  KPI individual y área dueña real ("Falta Contrato firmado: N cuentas ·
  Legal"), los 4 indicadores de sondeo agrupados **por sondeo** con "Ejecutivo
  de la cuenta" como responsable ("Falta subir sondeo Mesa de Control: N
  cuentas · Ejecutivo de la cuenta", sin repetir una línea por Carta de
  acceso Y Usuario Emetrix) —, por cuenta ("Zuru: faltan los 3 sondeos") y
  headcount faltante, con datos sintéticos por nodo.
- **Captura con base**: `validarBaseManual` rechaza numerador > denominador;
  "18 de 20" calcula el %/base/motivo correctos; ambos números vacíos (y sin
  % del formato viejo) sigue "Sin medir"; denominador en 0 da 100% con el
  motivo de "sin nuevos ingresos"/"sin módulos programados" (motivo distinto
  para Módulos publicados); y sin numerador/denominador este periodo cae al
  `legacyPorcentaje` del formato anterior a este cambio, para no perder
  ninguna cuenta que ya lo hubiera capturado así.
- **Aproximación**: el motivo de "Módulo completado" siempre empieza con
  "Aproximación: ".
- **Nombres oficiales**: cada nodo del árbol trae el `nombreOficial` LITERAL
  de `lib/okr-oficial.ts` (no el `nombre` corto); solo los 7 KPI hoja traen
  `meta` (los nodos OKR/KR agregados quedan en `null`); `kpiCode` siempre
  `null` (pendiente de Dirección).
- **Metas**: `formatIndicadorConMeta` arma "97.73% · 43 de 44 · meta 100%";
  sin base ni meta queda solo el %; `'sin-medir'` nunca muestra base ni meta.
- **Lectura para EvolveOS**: `construirRespuestaOkrLectura` arma el formato
  exacto de la guía (`okr`, `periodo.tipo`/`periodo.inicio`, un indicador por
  cuenta × KPI hoja); lo "sin medir" siempre va con `medible: false`,
  `valor: null` y su `motivo` (nunca `0`); un 0% medido (ej. Materiales en
  Hanes) va con `medible: true` y `valor: 0`.

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

1. **Por dato y responsable**, dos tipos de línea (`calcularPendientes`,
   `lib/emetrix-ponderacion-calc.ts`):
   - Los 4 indicadores hoja que salen de sondeo (Carta de acceso, Usuario
     Emetrix, Materiales, Módulo completado) se agrupan **por sondeo**, no por
     KPI — basta un archivo de Mesa de Control para resolver Carta de acceso Y
     Usuario Emetrix a la vez, así que se ven como un solo hueco: "Falta subir
     sondeo {Mesa de Control/Materiales/Marca}: N cuentas · **Ejecutivo de la
     cuenta**" (no el área dueña del KPI — quien sube el sondeo es el
     ejecutivo, no Legal/Nómina/Capacitación). Se dispara con
     `sondeosCargadoEn[kr] === null` de esa cuenta en este periodo, igual que
     "Por cuenta" abajo.
   - Los 3 KPI de captura manual (Contrato firmado, Alta ante el IMSS,
     Módulos publicados) se siguen agrupando **por KPI individual**, con su
     área dueña real: "Falta {nombre}: N cuentas · {Legal/Nómina/
     Capacitación}".
   
   Ambos tipos traen la lista de cuentas debajo.
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
(Contrato firmado, Alta IMSS, Módulos publicados — DE ESTE PERIODO, cada uno
con sus dos campos de numerador/denominador (sección 4) — y Headcount, que NO
es por periodo), para llenarlas de corrido como en Excel sin entrar cuenta por
cuenta (`components/EmetrixCapturaRapida.tsx`, inputs de
`components/EmetrixKpiBaseInputs.tsx` — mismo componente que usa la tabla del
árbol OKR de una sola cuenta, sin una segunda copia). Las columnas de captura
manual son más anchas que el resto de la tabla (`.emetrix-captura-rapida-col`
en `app/globals.css`) para que se lea completo el nombre de cada campo
("Firmados antes del ingreso", "Nuevos ingresos del mes", etc.) y el número
que se está capturando. Cada celda guarda al salir del campo (`onBlur`) —
manda siempre los dos números juntos (el que se acaba de editar y el otro tal
cual está en pantalla), porque el % solo se puede calcular/validar con ambos a
la vez — mismas funciones `updateContratoFirmadoManual`/`updateImssManual`/
`updateModulosPublicadosManual`/`updateHeadcountManual` que usa la tabla del
árbol OKR, sin una segunda copia de la lógica de guardado.

## 11. Lectura para EvolveOS (`GET /api/okr-resultados`)

Endpoint de solo lectura, pensado para que EvolveOS (u otro sistema
autorizado) consulte los resultados del OKR sin pasar por la pantalla de
gerente — **no** usa la sesión de gerente (`requireGerente`), es
autenticación de máquina a máquina aparte.

### Autenticación

Cada solicitud debe traer:

```
Authorization: Bearer <OKR_LECTURA_TOKEN>
```

`OKR_LECTURA_TOKEN` es una variable de entorno — **nunca vive en el código ni
se sube a git** (mismo patrón que `CRON_SECRET`, que ya protege
`/api/cron/check-alertas` contra el scheduler de Vercel). Si la variable no
está configurada en el proyecto, el endpoint queda completamente cerrado:
regresa `401` a cualquier solicitud, incluso con el header bien formado,
porque nunca hay nada contra qué comparar (`autorizado` en
`app/api/okr-resultados/route.ts`). El token **todavía no se generó** — la
ficha solo documenta el mecanismo; en cuanto Dirección lo pida, se genera con
`openssl rand -base64 32`, se configura como `OKR_LECTURA_TOKEN` en Vercel
(Production/el ambiente que corresponda) y se le entrega a EvolveOS por un
canal seguro, nunca por código ni por commit — ver `.env.local.example` para
el mismo patrón ya documentado con `CRON_SECRET`.

### Petición y respuesta

```
GET /api/okr-resultados?periodo=2026-09
Authorization: Bearer <OKR_LECTURA_TOKEN>
```

`periodo` es opcional (default: el mes actual, `periodoActual()`); debe tener
formato `YYYY-MM` o regresa `400`.

```json
{
  "okr": "Ciclo de vida del promotor",
  "periodo": { "tipo": "MES", "inicio": "2026-09-01" },
  "indicadores": [
    {
      "kpi_code": null,
      "indicador": "Spin Master — % de nuevos ingresos con contrato firmado antes del primer día",
      "medible": true,
      "valor": 90,
      "base": "18 de 20",
      "motivo": "18 de 20 nuevos ingresos firmaron contrato antes de su primer día."
    }
  ]
}
```

- **`okr`** y el texto de `indicador` (después del "— ") son los nombres
  LITERALES de `lib/okr-oficial.ts` (sección 4-ter) — `indicador` es
  `"<Cuenta> — <nombre oficial del KPI>"`.
- **`indicadores`** trae un elemento por cada cuenta REAL registrada × cada
  uno de los 7 KPI hoja del árbol (nunca cuentas ni cargas de prueba — sale
  de `fetchResultadoOkrTodasCuentas`, la misma consulta que usa "Todas las
  cuentas" en pantalla).
- **`medible: false`** cuando el indicador está `'sin-medir'` — `valor` va en
  `null` y `motivo` trae la explicación (igual que en pantalla), **nunca**
  se manda como `0`.
- **`medible: true`** con `valor: 0` para un 0% REAL medido (ej. Materiales
  en Hanes) — la diferencia entre "no hay dato" y "el dato es cero" (sección
  4-bis) se preserva también aquí.
- **`kpi_code`** sale de `lib/okr-oficial.ts` — `null` en los 3 niveles hasta
  que Dirección lo defina (no se inventó ningún código propio).

Implementado en `app/api/okr-resultados/route.ts`, que solo hace
`fetchResultadoOkrTodasCuentas(periodo)` (obtiene los datos) y le pasa el
resultado a **`construirRespuestaOkrLectura`**
(`lib/emetrix-ponderacion-calc.ts`, pura, con sus propias pruebas en
`lib/emetrix-ponderacion-calc.test.ts`) — la misma función de cálculo del
árbol OKR que usa la pantalla (`construirArbolOkr`), sin una segunda copia de
ninguna regla.

### Seguridad (confirmado 2026-09-27)

- `.env.local` está en `.gitignore` (`.env*`, con excepción explícita solo de
  `.env.local.example`) y nunca se subió a git — verificado con
  `git log --all` sobre ese archivo.
- Ninguna llave, contraseña ni token está escrita a mano en el código
  (`git grep` sobre los nombres de las variables de entorno) ni aparece en el
  historial completo de git (`git log --all -p` contra los patrones típicos
  de credenciales) — lo único que aparece es el placeholder genérico de
  `.env.local.example` (`postgres://usuario:password@host:5432/postgres`),
  que nunca fue una credencial real.
