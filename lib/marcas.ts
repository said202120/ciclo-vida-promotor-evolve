// Maestro de marcas/supervisores/ejecutivos, base del Módulo 1 de
// capacitaciones. Administrado desde /marcas (solo gerente).

import { sql } from '@vercel/postgres';
import type { Ejecutivo, Marca, MarcaConDetalle, Supervisor, SupervisorConMarca } from './types';

/** Lista plana de supervisores + su marca, para el selector de "supervisor asignado" en el padrón. */
export async function fetchSupervisoresConMarca(): Promise<SupervisorConMarca[]> {
  const { rows } = await sql.query(
    `select s.id, s.nombre, s.marca_id, m.nombre as marca_nombre
     from supervisores s
     join marcas m on m.id = s.marca_id
     order by m.nombre, s.nombre`
  );
  return rows.map((r) => ({
    id: r.id as string,
    nombre: r.nombre as string,
    marcaId: r.marca_id as string,
    marcaNombre: r.marca_nombre as string,
  }));
}

export async function fetchMarcasConDetalle(): Promise<MarcaConDetalle[]> {
  const [{ rows: marcaRows }, { rows: supRows }, { rows: ejRows }] = await Promise.all([
    sql.query('select id, nombre from marcas order by nombre'),
    sql.query('select id, nombre, marca_id from supervisores order by nombre'),
    sql.query('select id, nombre, marca_id from ejecutivos order by nombre'),
  ]);

  const supervisoresPorMarca = new Map<string, Supervisor[]>();
  for (const r of supRows) {
    const marcaId = r.marca_id as string;
    const lista = supervisoresPorMarca.get(marcaId) ?? [];
    lista.push({ id: r.id as string, nombre: r.nombre as string, marcaId });
    supervisoresPorMarca.set(marcaId, lista);
  }

  const ejecutivosPorMarca = new Map<string, Ejecutivo[]>();
  for (const r of ejRows) {
    const marcaId = r.marca_id as string;
    const lista = ejecutivosPorMarca.get(marcaId) ?? [];
    lista.push({ id: r.id as string, nombre: r.nombre as string, marcaId });
    ejecutivosPorMarca.set(marcaId, lista);
  }

  return marcaRows.map((r) => {
    const id = r.id as string;
    return {
      id,
      nombre: r.nombre as string,
      supervisores: supervisoresPorMarca.get(id) ?? [],
      ejecutivos: ejecutivosPorMarca.get(id) ?? [],
    };
  });
}

export async function createMarca(nombre: string): Promise<Marca> {
  const { rows } = await sql.query('insert into marcas (nombre) values ($1) returning id, nombre', [nombre]);
  return rows[0] as Marca;
}

export async function renameMarca(id: string, nombre: string): Promise<void> {
  await sql.query('update marcas set nombre = $1 where id = $2', [nombre, id]);
}

export async function deleteMarca(id: string): Promise<void> {
  await sql.query('delete from marcas where id = $1', [id]);
}

function rowToPersona(row: { id: string; nombre: string; marca_id: string }): Supervisor {
  return { id: row.id, nombre: row.nombre, marcaId: row.marca_id };
}

export async function createSupervisor(nombre: string, marcaId: string): Promise<Supervisor> {
  const { rows } = await sql.query(
    'insert into supervisores (nombre, marca_id) values ($1, $2) returning id, nombre, marca_id',
    [nombre, marcaId]
  );
  return rowToPersona(rows[0] as { id: string; nombre: string; marca_id: string });
}

export async function renameSupervisor(id: string, nombre: string): Promise<void> {
  await sql.query('update supervisores set nombre = $1 where id = $2', [nombre, id]);
}

export async function deleteSupervisor(id: string): Promise<void> {
  await sql.query('delete from supervisores where id = $1', [id]);
}

export async function createEjecutivo(nombre: string, marcaId: string): Promise<Ejecutivo> {
  const { rows } = await sql.query(
    'insert into ejecutivos (nombre, marca_id) values ($1, $2) returning id, nombre, marca_id',
    [nombre, marcaId]
  );
  return rowToPersona(rows[0] as { id: string; nombre: string; marca_id: string });
}

export async function renameEjecutivo(id: string, nombre: string): Promise<void> {
  await sql.query('update ejecutivos set nombre = $1 where id = $2', [nombre, id]);
}

export async function deleteEjecutivo(id: string): Promise<void> {
  await sql.query('delete from ejecutivos where id = $1', [id]);
}
