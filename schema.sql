-- Ciclo de vida del promotor — schema Supabase
-- Correr completo en el editor de consultas de Supabase/Vercel

create table if not exists promotores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  fecha_ingreso date not null,
  carta boolean default false,
  usuario boolean default false,
  contrato boolean default false,
  imss boolean default false,
  mod1 boolean default false,
  mod3 boolean default false,
  mod6 boolean default false,
  mod12 boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RFC del promotor: es la llave con la que el importador de Aspel cruza
-- contra el archivo para marcar contrato/IMSS automáticamente.
alter table promotores add column if not exists rfc text;

-- Identificadores de referencia en otros sistemas (Emetrix, Nómina). No se
-- usan para cruzar — el cruce sigue siendo por RFC — solo se guardan como
-- dato adicional cuando el importador de Aspel encuentra el promotor.
alter table promotores add column if not exists id_emetrix text;
alter table promotores add column if not exists id_nomina text;

-- Fecha detectada en el archivo de Aspel para contrato/IMSS. Se llenan solo
-- cuando el importador logra parsear una fecha válida en la columna mapeada
-- a ese campo; el booleano contrato/imss puede quedar en true aunque la
-- fecha no se haya podido interpretar.
alter table promotores add column if not exists fecha_contrato date;
alter table promotores add column if not exists fecha_imss date;

-- Fecha en que Mesa de Control marcó carta de ingreso / usuario Emetrix desde
-- su checklist de nuevos ingresos (/mesa-control) — no vienen del archivo de
-- Aspel, se capturan aparte.
alter table promotores add column if not exists fecha_carta date;
alter table promotores add column if not exists fecha_usuario date;

-- Marca a la que ingresa y puesto, capturados por el propio promotor en la
-- encuesta de verificación de nuevo ingreso (/e/{codigo}).
alter table promotores add column if not exists marca text;
alter table promotores add column if not exists puesto text;

create table if not exists modulos_publicados (
  id int primary key default 1,
  mod1 boolean default false,
  mod3 boolean default false,
  mod6 boolean default false,
  mod12 boolean default false,
  comprometidos int default 0,
  updated_at timestamptz default now()
);
insert into modulos_publicados (id) values (1) on conflict (id) do nothing;

-- Cierres mensuales: una vez que un mes se "cierra", su resultado queda fijo
-- aunque el padrón de promotores se siga editando después.
create table if not exists cierres_mensuales (
  id uuid primary key default gen_random_uuid(),
  mes text not null,            -- formato 'YYYY-MM'
  kpi_id text not null,         -- 'kr1_carta' | 'kr1_usuario' | 'kr1_contrato' | 'kr1_imss'
                                 -- 'kr2_materiales' | 'kr3_modulos' | 'kr3_completado' | 'okr_total'
  numerador numeric,
  denominador numeric,
  porcentaje numeric,
  cerrado_en timestamptz default now(),
  unique (mes, kpi_id)
);

-- Usuarios con acceso al sistema. Cuatro roles:
--   gerente      -> acceso completo al tablero, puede crear usuarios de cualquier rol
--   ejecutivo    -> ve y edita el tablero igual que gerente, recibe alertas de materiales
--   mesa_control -> solo ve la pantalla de importar Aspel (RFC, carta, usuario Emetrix, contrato; IMSS de solo lectura)
--   nomina       -> solo ve la pantalla de importar Aspel (RFC, IMSS únicamente)
create table if not exists usuarios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  email text not null unique,
  password_hash text not null,
  rol text not null check (rol in ('gerente', 'ejecutivo')),
  created_at timestamptz default now()
);

-- Se agregaron mesa_control y nomina: perfiles de captura limitados a la
-- pantalla de importar Aspel, creados a mano por el gerente (sin autoregistro).
alter table usuarios drop constraint if exists usuarios_rol_check;
alter table usuarios add constraint usuarios_rol_check
  check (rol in ('gerente', 'ejecutivo', 'mesa_control', 'nomina'));

-- Catálogo fijo de materiales del checklist de entrega (KR2). El orden
-- controla cómo se listan dentro de cada categoría en el panel del padrón.
create table if not exists materiales_catalogo (
  id uuid primary key default gen_random_uuid(),
  categoria text not null check (categoria in ('tecnologia', 'trabajo')),
  nombre text not null unique,
  orden int not null
);

insert into materiales_catalogo (categoria, nombre, orden) values
  ('tecnologia', 'Equipo celular', 1),
  ('tecnologia', 'Línea corporativa', 2),
  ('trabajo', 'Franela Metro', 3),
  ('trabajo', 'Cortadores', 4),
  ('trabajo', 'Navajas', 5),
  ('trabajo', 'Botas Van Vien', 6),
  ('trabajo', 'Cintas', 7),
  ('trabajo', 'Guantes', 8),
  ('trabajo', 'Faja', 9),
  ('trabajo', 'Marcador Delgado', 10),
  ('trabajo', 'Quita Goma', 11),
  ('trabajo', 'Plumero Avestruz', 12),
  ('trabajo', 'Mochila Royal Swiss', 13)
on conflict (nombre) do nothing;

-- Seguimiento de entrega por promotor y artículo. Si no hay fila para un
-- (promotor_id, material_id), se asume entregado = false — no hace falta
-- insertar nada al crear un promotor nuevo.
create table if not exists promotor_materiales (
  promotor_id uuid not null references promotores(id) on delete cascade,
  material_id uuid not null references materiales_catalogo(id) on delete cascade,
  entregado boolean not null default false,
  fecha_entrega date,
  primary key (promotor_id, material_id)
);

-- Migración: los promotores que ya tenían el viejo checkbox booleano
-- "materiales" en true quedan con los 13 artículos marcados como entregados
-- (sin fecha histórica real que migrar, se usa la fecha de hoy). Guardado en
-- un bloque condicional porque la columna vieja se elimina al final, así el
-- script sigue siendo re-ejecutable sin error contra una base ya migrada.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'promotores' and column_name = 'materiales'
  ) then
    insert into promotor_materiales (promotor_id, material_id, entregado, fecha_entrega)
    select p.id, mc.id, true, current_date
    from promotores p
    cross join materiales_catalogo mc
    where p.materiales = true
    on conflict (promotor_id, material_id) do nothing;

    alter table promotores drop column materiales;
  end if;
end $$;

-- Encuestas de verificación para promotores nuevos: dos encuestas
-- independientes por promotor, cada una con su propio link único sin login
-- (mesa_control -> /e/{codigo}, materiales -> /m/{codigo}). El promotor puede
-- volver a abrir el mismo link y actualizar su respuesta las veces que haga
-- falta — usado_en es solo informativo (primera vez que contestó), no
-- bloquea reenvíos.
create table if not exists encuestas_links (
  id uuid primary key default gen_random_uuid(),
  promotor_id uuid not null references promotores(id) on delete cascade,
  codigo text not null unique,
  created_at timestamptz default now(),
  usado_en timestamptz
);

-- Se agregó `tipo`: antes había un solo link por promotor: ahora hay uno por
-- encuesta. Las filas que ya existían de antes de este cambio son todas de
-- la encuesta "Mesa de Control" (era la única que existía).
alter table encuestas_links add column if not exists tipo text not null default 'mesa_control';
alter table encuestas_links drop constraint if exists encuestas_links_tipo_check;
alter table encuestas_links add constraint encuestas_links_tipo_check
  check (tipo in ('mesa_control', 'materiales'));
alter table encuestas_links drop constraint if exists encuestas_links_promotor_tipo_key;
alter table encuestas_links add constraint encuestas_links_promotor_tipo_key unique (promotor_id, tipo);

-- Respuestas del promotor a las encuestas. Se guardan aparte del padrón a
-- propósito: son lo que el PROMOTOR reporta, no lo que ya registraron
-- mesa_control/nómina/Aspel — para poder comparar ambos lados y detectar
-- discrepancias (ver lib/encuestas.ts). Una fila por promotor — las dos
-- encuestas comparten la fila pero cada una solo toca sus propias columnas,
-- nunca las de la otra. Cada envío nuevo sobreescribe la respuesta anterior
-- de esa encuesta específica.
create table if not exists encuestas_respuestas (
  id uuid primary key default gen_random_uuid(),
  promotor_id uuid not null unique references promotores(id) on delete cascade,
  -- Encuesta "Mesa de Control" (bloques 1 y 2, /e/{codigo})
  contrato_reportado boolean,
  imss_reportado boolean,
  carta_reportada boolean,
  credencial_reportada boolean,
  usuario_emetrix_reportado boolean,
  respondida_en timestamptz,
  -- Encuesta "Materiales" (/m/{codigo}) — independiente de la de arriba
  fecha_entrega_comunicada boolean,
  materiales_respondida_en timestamptz,
  updated_at timestamptz default now()
);

-- Migración: la columna ya existía con default now() y sin la contraparte de
-- materiales; se agrega la nueva y se le quita el default a la vieja (un
-- registro nuevo de la encuesta de materiales ya no debe "contestar" también
-- la de Mesa de Control por default).
alter table encuestas_respuestas add column if not exists materiales_respondida_en timestamptz;
alter table encuestas_respuestas alter column respondida_en drop default;

-- Qué materiales del checklist de la encuesta (bloque 3) dice el promotor
-- que ya recibió, artículo por artículo — mismo catálogo que usa el padrón,
-- aunque la encuesta solo pregunta por un subconjunto de esos artículos.
create table if not exists encuesta_materiales_respuestas (
  encuesta_respuesta_id uuid not null references encuestas_respuestas(id) on delete cascade,
  material_id uuid not null references materiales_catalogo(id) on delete cascade,
  recibido boolean not null default false,
  primary key (encuesta_respuesta_id, material_id)
);

-- Registro de alertas de materiales ya enviadas, para no repetirlas.
--   mes1 -> el promotor cumplió 1 mes desde su ingreso (día exacto)
--   mes2 -> el promotor cayó en la ventana de la semana siguiente a
--           cumplir 2 meses (día 60-67 desde su ingreso)
create table if not exists alertas_enviadas (
  id uuid primary key default gen_random_uuid(),
  promotor_id uuid not null references promotores(id) on delete cascade,
  tipo text not null check (tipo in ('mes1', 'mes2')),
  enviada_en timestamptz default now(),
  unique (promotor_id, tipo)
);

-- Importador de Aspel: no asumimos un formato de columnas fijo, así que el
-- mapeo (qué encabezado del archivo corresponde a qué campo) lo elige el
-- usuario cada vez y se guarda aquí para proponerlo la próxima vez. Un
-- mapeo por rol de captura (mesa_control y nomina trabajan campos distintos
-- de archivos distintos, así que no pueden compartir una sola fila).
create table if not exists importaciones_config (
  id int primary key default 1,
  mapeo jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);
-- Sin insert de bootstrap aquí a propósito: el bloque de migración de abajo
-- y los dos insert finales (uno por rol) ya cubren tanto una base nueva
-- (tabla recién creada, sin filas) como una ya migrada a filas por rol.

-- Migración: de una sola fila global a una fila por rol de captura. El mapeo
-- que ya existía se copia a ambos roles nuevos (cada quien luego solo puede
-- guardar los campos que le correspondan); guardado en un bloque condicional
-- porque la columna vieja `id` se elimina al final, así el script sigue
-- siendo re-ejecutable sin error contra una base ya migrada.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'importaciones_config' and column_name = 'id'
  ) then
    alter table importaciones_config add column if not exists rol text;
    update importaciones_config set rol = 'mesa_control' where id = 1;
    -- Se quita el pkey viejo (sobre id) antes de insertar la segunda fila,
    -- porque su default compartido (id=1) chocaría con la fila que ya existe.
    alter table importaciones_config drop constraint importaciones_config_pkey;
    insert into importaciones_config (rol, mapeo, updated_at)
      select 'nomina', mapeo, updated_at from importaciones_config where rol = 'mesa_control';

    alter table importaciones_config drop column id;
    alter table importaciones_config alter column rol set not null;
    alter table importaciones_config add constraint importaciones_config_pkey primary key (rol);
    alter table importaciones_config add constraint importaciones_config_rol_check
      check (rol in ('mesa_control', 'nomina'));
  end if;
end $$;

insert into importaciones_config (rol) values ('mesa_control') on conflict (rol) do nothing;
insert into importaciones_config (rol) values ('nomina') on conflict (rol) do nothing;

-- Historial de corridas del importador de Aspel, para saber cuándo fue la
-- última sincronización y cuántos RFC no hicieron match.
create table if not exists importaciones_log (
  id uuid primary key default gen_random_uuid(),
  ejecutada_en timestamptz default now(),
  usuario_id uuid references usuarios(id) on delete set null,
  actualizados int not null default 0,
  no_encontrados int not null default 0
);

-- Maestro de marcas/supervisores/ejecutivos, base para el Módulo 1 de
-- capacitaciones. Administrado desde /marcas (solo gerente). Borrar una
-- marca borra también sus supervisores y ejecutivos (se advierte en la UI
-- antes de confirmar).
create table if not exists marcas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  created_at timestamptz default now()
);

create table if not exists supervisores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  marca_id uuid not null references marcas(id) on delete cascade,
  created_at timestamptz default now(),
  unique (nombre, marca_id)
);

create table if not exists ejecutivos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  marca_id uuid not null references marcas(id) on delete cascade,
  created_at timestamptz default now(),
  unique (nombre, marca_id)
);

insert into marcas (nombre) values
  ('SPIN MASTER'), ('HANES'), ('ZURU'), ('AJEMEX'), ('RUZ'),
  ('DISNEY'), ('ADM'), ('COMERCIALIZADORA HISPANA'), ('GIFAN'), ('JUGUETIMAX')
on conflict (nombre) do nothing;

insert into supervisores (nombre, marca_id)
select v.nombre, m.id
from (values
  ('Español Martínez Jorge Luis', 'SPIN MASTER'),
  ('González Peña Martín Alejandro', 'SPIN MASTER'),
  ('Ruiz Cruz Cristian', 'SPIN MASTER'),
  ('Sánchez Ruiz Erika Nallely', 'SPIN MASTER'),
  ('Montes Bermúdez Edith', 'SPIN MASTER'),
  ('Rojo Avelar Verónica', 'SPIN MASTER'),
  ('Olivares Hinojosa Rosa Nely', 'SPIN MASTER'),
  ('Gómez García Osiriz', 'SPIN MASTER'),
  ('Martínez Ledezma Norma Nelly', 'HANES'),
  ('Reyes Rodríguez María Teresa', 'HANES'),
  ('Amador Alcalá Víctor Hugo', 'HANES'),
  ('Gutiérrez Solís Oyuki', 'HANES'),
  ('Menchaca Velasco Angélica Areli', 'RUZ'),
  ('Anguiano Martínez Valeria', 'RUZ'),
  ('González Rosano José Guadalupe', 'RUZ'),
  ('Armenta Lucero Elizabeth', 'ADM'),
  ('Clemente Salazar Jorge Fernando', 'ADM'),
  ('Colín Suárez Patricia', 'ADM'),
  ('Cruz Hernández Edgar Sebastián', 'ADM'),
  ('De la Cruz López Luis Fernando', 'ADM'),
  ('Delgado Montes de Oca Oscar Bernardo', 'ADM'),
  ('Espinosa Pérez Pablo Abel', 'ADM'),
  ('Flores Ramos José de Jesús', 'ADM'),
  ('Gallegos Morales Ana Victoria', 'ADM'),
  ('Martínez Muñoz Israel', 'ADM'),
  ('Mejía Tejeda Luis David', 'ADM'),
  ('Méndez Castillo Alma Teresa', 'ADM'),
  ('Palacios Romero José Arturo', 'ADM'),
  ('Peña Gallegos Bertha Alicia', 'ADM'),
  ('Pinal Sánchez Estrella Guadalupe', 'ADM'),
  ('Quintana Nogueda José de Jesús', 'ADM'),
  ('Tuñón Francisco Marco Polo', 'ADM'),
  ('Souza Raúl', 'GIFAN'),
  ('Juárez David', 'GIFAN'),
  ('Bojórquez Prisciliano', 'GIFAN'),
  ('Bustos Conrado', 'GIFAN'),
  ('Granillo Víctor', 'GIFAN')
) as v(nombre, marca_nombre)
join marcas m on m.nombre = v.marca_nombre
on conflict (nombre, marca_id) do nothing;

insert into ejecutivos (nombre, marca_id)
select v.nombre, m.id
from (values
  ('Ochoa Verónica', 'SPIN MASTER'),
  ('Martínez Fabián', 'HANES'),
  ('Fomperosa Luis', 'ZURU'),
  ('Cruz Valeria', 'AJEMEX'),
  ('Delgadillo Fernando', 'RUZ'),
  ('Obregón Alan', 'DISNEY'),
  ('Pedraza Lizbet', 'ADM'),
  ('Quintanar Fernanda', 'COMERCIALIZADORA HISPANA'),
  ('Quintanar Fernanda', 'GIFAN'),
  ('Sandoval Erick', 'JUGUETIMAX')
) as v(nombre, marca_nombre)
join marcas m on m.nombre = v.marca_nombre
on conflict (nombre, marca_id) do nothing;

-- Supervisor asignado al promotor (Módulo 1 de capacitaciones). Va después
-- de crear la tabla supervisores porque la referencia. Si se borra el
-- supervisor del maestro, el promotor se queda sin asignar (no se borra).
alter table promotores add column if not exists supervisor_id uuid references supervisores(id) on delete set null;

-- Exámenes de capacitación por contenido (distinto de las casillas
-- mod1/mod3/mod6/mod12 del padrón, que son checkboxes de antigüedad, no de
-- contenido). "orden" define la secuencia de desbloqueo: un módulo con
-- orden=N solo se puede presentar si el promotor ya aprobó el de orden=N-1.
-- Administrado desde /capacitaciones (solo gerente); el promotor lo presenta
-- sin login en /q/{codigo}.
create table if not exists capacitacion_modulos (
  id uuid primary key default gen_random_uuid(),
  orden int not null unique,
  nombre text not null,
  descripcion text,
  umbral_aprobacion int not null default 90,
  created_at timestamptz default now()
);

create table if not exists capacitacion_preguntas (
  id uuid primary key default gen_random_uuid(),
  modulo_id uuid not null references capacitacion_modulos(id) on delete cascade,
  orden int not null default 0,
  texto text not null,
  created_at timestamptz default now()
);

-- Preguntas dinámicas: en vez de opciones fijas capturadas a mano, las
-- opciones se arman al vuelo por promotor a partir del maestro de
-- marcas/supervisores/ejecutivos (lib/capacitaciones.ts), según la marca del
-- promotor (derivada de su supervisor_asignado en el padrón):
--   supervisor_directo -> correcta = su supervisor asignado; distractores =
--     otros supervisores de la misma marca.
--   coordinador_cuenta -> correcta = el/los ejecutivo(s) de su marca;
--     distractores = ejecutivos de otras marcas.
-- Una pregunta 'texto' sigue usando capacitacion_opciones normal.
alter table capacitacion_preguntas add column if not exists tipo text not null default 'texto';
alter table capacitacion_preguntas drop constraint if exists capacitacion_preguntas_tipo_check;
alter table capacitacion_preguntas add constraint capacitacion_preguntas_tipo_check
  check (tipo in ('texto', 'supervisor_directo', 'coordinador_cuenta'));

-- Campo de texto libre OPCIONAL debajo de la pregunta (p.ej. "¿Cuáles?" bajo
-- un Sí/No). Informativo, nunca califica. null = esta pregunta no lleva
-- campo abierto.
alter table capacitacion_preguntas add column if not exists campo_abierto_label text;

create table if not exists capacitacion_opciones (
  id uuid primary key default gen_random_uuid(),
  pregunta_id uuid not null references capacitacion_preguntas(id) on delete cascade,
  orden int not null default 0,
  texto text not null,
  correcta boolean not null default false,
  created_at timestamptz default now()
);

-- Un link único por promotor y módulo, sin login, como encuestas_links.
-- Reintentos ilimitados: cada envío nuevo sobreescribe el resultado anterior
-- de ese módulo en capacitacion_resultados (no se guarda historial).
create table if not exists capacitacion_links (
  id uuid primary key default gen_random_uuid(),
  promotor_id uuid not null references promotores(id) on delete cascade,
  modulo_id uuid not null references capacitacion_modulos(id) on delete cascade,
  codigo text not null unique,
  created_at timestamptz default now(),
  unique (promotor_id, modulo_id)
);

create table if not exists capacitacion_resultados (
  promotor_id uuid not null references promotores(id) on delete cascade,
  modulo_id uuid not null references capacitacion_modulos(id) on delete cascade,
  calificacion numeric not null,
  aprobado boolean not null,
  respondido_en timestamptz not null default now(),
  primary key (promotor_id, modulo_id)
);

insert into capacitacion_modulos (orden, nombre, descripcion, umbral_aprobacion) values
  (1, 'Compañía', 'Administración, comunicación y seguridad de Personal', 90)
on conflict (orden) do nothing;

insert into capacitacion_modulos (orden, nombre, descripcion, umbral_aprobacion) values
  (2, 'Marca', 'Conocimiento de marca general', 90)
on conflict (orden) do nothing;

insert into capacitacion_modulos (orden, nombre, descripcion, umbral_aprobacion) values
  (3, 'Pasos Estructurados de una Visita', null, 90)
on conflict (orden) do nothing;

-- Respuestas al campo abierto opcional (ver capacitacion_preguntas.campo_abierto_label):
-- no califican, solo se guardan para consulta. Reintentos ilimitados: cada
-- envío nuevo sobreescribe la respuesta anterior de esa pregunta; si el
-- promotor la deja vacía en un reenvío, se borra (no queda un texto viejo
-- huérfano).
create table if not exists capacitacion_respuestas_abiertas (
  promotor_id uuid not null references promotores(id) on delete cascade,
  pregunta_id uuid not null references capacitacion_preguntas(id) on delete cascade,
  texto text not null,
  respondido_en timestamptz not null default now(),
  primary key (promotor_id, pregunta_id)
);

-- Trigger simple para updated_at en promotores
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_promotores_updated_at on promotores;
create trigger trg_promotores_updated_at
  before update on promotores
  for each row execute function set_updated_at();

drop trigger if exists trg_encuestas_respuestas_updated_at on encuestas_respuestas;
create trigger trg_encuestas_respuestas_updated_at
  before update on encuestas_respuestas
  for each row execute function set_updated_at();
