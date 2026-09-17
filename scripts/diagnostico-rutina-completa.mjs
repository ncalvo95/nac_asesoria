#!/usr/bin/env node
// Solo lectura - vuelca TODOS los dias (activos E inactivos) de la rutina
// activa de un usuario, con sus ejercicio_asignado (id, ejercicio,
// peso_actual, series_actuales) y, para cada ejercicio, en que
// microciclo(s) tiene sesiones registradas - para diagnosticar duplicados
// o dias reemplazados sin tener que adivinar. No cambia nada.
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

const microciclos = db.prepare('SELECT * FROM microciclo WHERE rutina_id = ? ORDER BY numero').all(rutina.id);
console.log('--- Microciclos ---');
for (const m of microciclos) {
  console.log(`numero ${m.numero} - id ${m.id} - estado ${m.estado} - tipo ${m.tipo} - fecha_inicio ${m.fecha_inicio} - fecha_fin ${m.fecha_fin}`);
}

const dias = db.prepare('SELECT * FROM dia_rutina WHERE rutina_id = ? ORDER BY dia_semana, id').all(rutina.id);
console.log(`\n--- TODOS los dias (activos e inactivos) (${dias.length}) ---`);
const porDiaSemana = {};
for (const d of dias) {
  porDiaSemana[d.dia_semana] = (porDiaSemana[d.dia_semana] || []).concat(d);
}
for (const [diaSemana, lista] of Object.entries(porDiaSemana)) {
  if (lista.length > 1) console.log(`*** ${diaSemana} tiene ${lista.length} filas de dia_rutina (una debe estar inactiva) ***`);
}

for (const d of dias) {
  const ejercicios = db.prepare(`
    SELECT ea.*, e.nombre AS ejercicio_nombre
    FROM ejercicio_asignado ea JOIN ejercicio e ON e.id = ea.ejercicio_id
    WHERE ea.dia_rutina_id = ? ORDER BY ea.orden
  `).all(d.id);
  console.log(`\n--- ${d.dia_semana} (dia_rutina id ${d.id}, activo=${d.activo}, numero_dia ${d.numero_dia}) - ${ejercicios.length} ejercicio(s) ---`);
  for (const ej of ejercicios) {
    const sesiones = db.prepare(`
      SELECT rs.microciclo_id, rs.fecha, COUNT(*) AS n_series
      FROM registro_serie rse JOIN registro_sesion rs ON rs.id = rse.registro_sesion_id
      WHERE rse.ejercicio_asignado_id = ?
      GROUP BY rs.id
      ORDER BY rs.fecha
    `).all(ej.id);
    const resumenSesiones = sesiones.length > 0
      ? sesiones.map((s) => `[microciclo ${s.microciclo_id}, ${s.fecha}, ${s.n_series} serie(s)]`).join(' ')
      : '(sin sesiones)';
    console.log(`  ea ${ej.id} - ${ej.ejercicio_nombre} (ejercicio_id ${ej.ejercicio_id}) - peso_actual ${ej.peso_actual}, series_actuales ${ej.series_actuales} - ${resumenSesiones}`);
  }
}
