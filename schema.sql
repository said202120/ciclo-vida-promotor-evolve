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
  materiales boolean default false,
  mod1 boolean default false,
  mod3 boolean default false,
  mod6 boolean default false,
  mod12 boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

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
