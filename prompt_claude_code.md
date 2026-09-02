# Prompt de arranque para Claude Code

Copia y pega esto en Claude Code dentro del repositorio recién clonado (adjunta también el archivo `Artefacto_Ciclo_de_Vida_del_Promotor.html` como referencia de la lógica ya validada):

---

Voy a construir una app Next.js desplegada en Vercel con base de datos Postgres (Supabase, ya conectada vía integración de Vercel — usa la variable de entorno POSTGRES_URL). Es un tablero interno para medir el OKR "Ciclo de vida del promotor" de mi equipo de operaciones en una agencia BTL.

Te adjunto un prototipo funcional en HTML (`Artefacto_Ciclo_de_Vida_del_Promotor.html`) que ya tiene toda la lógica de negocio validada conmigo: el padrón de promotores, cómo se calculan los KPIs por cohorte según fecha de ingreso, y el diseño visual (tokens de color, tipografía Space Grotesk / IBM Plex Sans / IBM Plex Mono). Quiero que uses ese archivo como referencia de verdad para la lógica y el diseño, no que lo rediseñes desde cero.

Lo que necesito que cambie respecto al prototipo (que hoy usa `window.storage` del navegador):

1. **Persistencia real en Postgres**, con tres tablas ya definidas en `schema.sql` (adjunto): `promotores`, `modulos_publicados`, `cierres_mensuales`. Ejecuta el schema.sql contra la base si aún no corre.
2. **Patrón de API serverless de Next.js** (rutas en `/api`) para todo el acceso a datos — nunca cliente directo a Postgres desde el navegador, por seguridad. Rutas necesarias:
   - CRUD de promotores (crear, editar casillas, eliminar)
   - Leer/actualizar `modulos_publicados`
   - Leer `cierres_mensuales`
   - **"Cerrar mes"**: una acción que toma el mes seleccionado, calcula el numerador/denominador/porcentaje de cada KPI con la misma lógica de cohortes del prototipo (por fecha de ingreso), y los inserta en `cierres_mensuales`. Una vez cerrado un mes, el tablero para ese mes debe leer de `cierres_mensuales` (fijo) en vez de recalcular en vivo del padrón — así el resultado reportado no cambia si el padrón se sigue editando después.
   - El mes actual (no cerrado) sigue mostrando el cálculo en vivo, igual que el prototipo.
3. **Sin login por ahora** — es una herramienta de un solo usuario (yo), no hace falta el sistema de autenticación que sí tiene mi otro repositorio de KPIs.
4. Mantén el resto de la lógica de cálculo del prototipo tal cual: pesos por KR (57/14/29), pesos por KPI dentro de cada KR, semáforos contra meta, y la barra de "trayecto del promotor".

Empecemos por el schema y las rutas de API, y después migramos la UI del HTML a componentes de Next.js.

---

**Nota:** una vez que tengas el primer deploy funcionando, pruébalo agregando 2-3 promotores con fechas de ingreso reales tuyas, y usa "Cerrar mes" en un mes de prueba para confirmar que el número ya no se mueve aunque edites el padrón después.
