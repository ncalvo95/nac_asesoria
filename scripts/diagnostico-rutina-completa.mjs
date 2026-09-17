#!/usr/bin/env node
// Solo lectura - vuelca TODOS los dias activos de la rutina activa de un
// usuario, con sus ejercicio_asignado (id, ejercicio, peso_actual,
// series_actuales), para detectar dias duplicados o ejercicios repetidos
// dentro de un mismo dia. No cambia nada.
//
// Uso: node scripts/diagnostico-rutina-completa.mjs <usuario>

import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'app.db');
const db = new Database(dbPath);

const usuarioArg = process.argv[2];
if (!usuarioArg) {
  console.error('Uso: node scripts/diagnostico-rutina-completa.mjs <usuario>');
  process.exit(1);
}

const usuario = db.prepare('SELECT * FROM usuarios WHERE usuario = ?').get(usuarioArg);
if (!usuario) { console.error(`No existe usuario "${usuarioArg}".`); process.exit(1); }

const rutina = db.prepare("SELECT * FROM rutina WHERE usuario_id = ? AND estado = 'activa'").get(usuario.id);
if (!rutina) { console.error('No tiene rutina activa.'); process.exit(1); }

console.log(`Rutina activa id ${rutina.id}\n`);

const dias = db.prepare('SELECT * FROM dia_rutina WHERE rutina_id = ? AND activo = 1 ORDER BY numero_dia').all(rutina.id);
console.log(`--- Dias ACTIVOS (${dias.length}) ---`);
const porDiaSemana = {};
for (const d of dias) {
  porDiaSemana[d.dia_semana] = (porDiaSemana[d.dia_semana] || 0) + 1;
  console.log(`dia_rutina id ${d.id} - numero_dia ${d.numero_dia} - dia_semana ${d.dia_semana}`);
}
const duplicados = Object.entries(porDiaSemana).filter(([, n]) => n > 1);
if (duplicados.length > 0) {
  console.log(`\n*** OJO: hay mas de un dia_rutina activo para el mismo dia_semana: ${duplicados.map(([d, n]) => `${d} (x${n})`).join(', ')} ***`);
}

for (const d of dias) {
  const ejercicios = db.prepare(`
    SELECT ea.*, e.nombre AS ejercicio_nombre
    FROM ejercicio_asignado ea JOIN ejercicio e ON e.id = ea.ejercicio_id
    WHERE ea.dia_rutina_id = ? ORDER BY ea.orden
  `).all(d.id);
  console.log(`\n--- ${d.dia_semana} (dia_rutina id ${d.id}) - ${ejercicios.length} ejercicio(s) ---`);
  for (const ej of ejercicios) {
    const tieneSeries = db.prepare('SELECT COUNT(*) AS n FROM registro_serie WHERE ejercicio_asignado_id = ?').get(ej.id).n;
    console.log(`  ea ${ej.id} - ${ej.ejercicio_nombre} (ejercicio_id ${ej.ejercicio_id}) - peso_actual ${ej.peso_actual}, series_actuales ${ej.series_actuales}, top=${ej.es_top_de_musculo} - ${tieneSeries} serie(s) historicas registradas`);
  }
  // Marcar si dos ejercicio_asignado del mismo dia apuntan al mismo ejercicio_id (duplicado real)
  const porEjercicioId = {};
  for (const ej of ejercicios) porEjercicioId[ej.ejercicio_id] = (porEjercicioId[ej.ejercicio_id] || []).concat(ej.id);
  const repetidos = Object.entries(porEjercicioId).filter(([, ids]) => ids.length > 1);
  if (repetidos.length > 0) {
    console.log(`  *** Ejercicios repetidos dentro de este dia: ${repetidos.map(([eid, ids]) => `ejercicio_id ${eid} en ea [${ids.join(', ')}]`).join(' | ')} ***`);
  }
}
