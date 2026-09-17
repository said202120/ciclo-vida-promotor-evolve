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

-- Fecha detectada en el archivo de Aspel para contrato/IMSS. Se llenan solo
-- cuando el importador logra parsear una fecha válida en la columna mapeada
-- a ese campo; el booleano contrato/imss puede quedar en true aunque la
-- fecha no se haya podido interpretar.
alter table promotores add column if not exists fecha_contrato date;
alter table promotores add column if not exists fecha_imss date;

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

-- Usuarios con acceso al tablero. Dos roles:
--   gerente   -> acceso completo, puede crear usuarios ejecutivos
--   ejecutivo -> ve y edita el tablero igual que gerente, recibe alertas de materiales
create table if not exists usuarios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  email text not null unique,
  password_hash text not null,
  rol text not null check (rol in ('gerente', 'ejecutivo')),
  created_at timestamptz default now()
);

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
-- usuario cada vez y se guarda aquí para proponerlo la próxima vez. Una sola
-- fila, se sobreescribe.
create table if not exists importaciones_config (
  id int primary key default 1,
  mapeo jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);
insert into importaciones_config (id) values (1) on conflict (id) do nothing;

-- Historial de corridas del importador de Aspel, para saber cuándo fue la
-- última sincronización y cuántos RFC no hicieron match.
create table if not exists importaciones_log (
  id uuid primary key default gen_random_uuid(),
  ejecutada_en timestamptz default now(),
  usuario_id uuid references usuarios(id) on delete set null,
  actualizados int not null default 0,
  no_encontrados int not null default 0
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
