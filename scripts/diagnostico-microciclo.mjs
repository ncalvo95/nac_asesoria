#!/usr/bin/env node
// Solo lectura - imprime el detalle completo de un microciclo (sesiones,
// series y progreso por ejercicio) para decidir a mano como fusionar datos
// atrapados en un microciclo que se cerro antes de tiempo. No cambia nada.
//
// Uso: node scripts/diagnostico-microciclo.mjs <usuario> <numero_microciclo>

import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'app.db');
const db = new Database(dbPath);

const usuarioArg = process.argv[2];
const numeroArg = Number(process.argv[3]);
if (!usuarioArg || !Number.isFinite(numeroArg)) {
  console.error('Uso: node scripts/diagnostico-microciclo.mjs <usuario> <numero_microciclo>');
  process.exit(1);
}

const usuario = db.prepare('SELECT * FROM usuarios WHERE usuario = ?').get(usuarioArg);
if (!usuario) { console.error(`No existe usuario "${usuarioArg}".`); process.exit(1); }

const rutina = db.prepare("SELECT * FROM rutina WHERE usuario_id = ? AND estado = 'activa'").get(usuario.id);
if (!rutina) { console.error('No tiene rutina activa.'); process.exit(1); }

const mc = db.prepare('SELECT * FROM microciclo WHERE rutina_id = ? AND numero = ?').get(rutina.id, numeroArg);
if (!mc) { console.error(`No existe el microciclo ${numeroArg} para esta rutina.`); process.exit(1); }

console.log(`\n=== Microciclo ${mc.numero} (id ${mc.id}) - estado ${mc.estado}, fecha_inicio ${mc.fecha_inicio}, fecha_fin ${mc.fecha_fin} ===\n`);

const sesiones = db.prepare(`
  SELECT rs.*, dr.dia_semana
  FROM registro_sesion rs JOIN dia_rutina dr ON dr.id = rs.dia_rutina_id
  WHERE rs.microciclo_id = ?
  ORDER BY rs.fecha, rs.id
`).all(mc.id);

for (const s of sesiones) {
  console.log(`Sesion id ${s.id} - dia_rutina_id ${s.dia_rutina_id} (${s.dia_semana}) - fecha ${s.fecha}${s.salteada ? ' [SALTEADA]' : ''}`);
  const series = db.prepare(`
    SELECT rse.*, ea.ejercicio_id, e.nombre AS ejercicio_nombre
    FROM registro_serie rse
    JOIN ejercicio_asignado ea ON ea.id = rse.ejercicio_asignado_id
    JOIN ejercicio e ON e.id = ea.ejercicio_id
    WHERE rse.registro_sesion_id = ?
    ORDER BY rse.ejercicio_asignado_id, rse.numero_serie
  `).all(s.id);
  for (const se of series) {
    console.log(`    ${se.ejercicio_nombre} (ea ${se.ejercicio_asignado_id}) - serie ${se.numero_serie}: ${se.peso}kg x ${se.reps} reps, RIR ${se.rir ?? '-'}${se.es_dropset ? ' [DROPSET]' : ''}`);
  }
}
if (sesiones.length === 0) console.log('(sin sesiones)');

console.log(`\n--- progreso_ejercicio_microciclo en microciclo ${mc.numero} ---`);
const progresos = db.prepare(`
  SELECT pem.*, ea.dia_rutina_id, e.nombre AS ejercicio_nombre, dr.dia_semana
  FROM progreso_ejercicio_microciclo pem
  JOIN ejercicio_asignado ea ON ea.id = pem.ejercicio_asignado_id
  JOIN ejercicio e ON e.id = ea.ejercicio_id
  JOIN dia_rutina dr ON dr.id = ea.dia_rutina_id
  WHERE pem.microciclo_id = ?
`).all(mc.id);
for (const p of progresos) {
  console.log(`  ${p.ejercicio_nombre} (ea ${p.ejercicio_asignado_id}, dia ${p.dia_semana}) - peso_prescrito ${p.peso_prescrito}, piso_reps ${p.piso_reps}, series_prescritas ${p.series_prescritas}, sem1_reps ${p.sem1_reps}, sem2_reps ${p.sem2_reps}, techo_reps ${p.techo_reps}, nota: ${p.nota ?? '-'}`);
}
if (progresos.length === 0) console.log('(sin filas)');

console.log('\n=== Para comparar, microciclo anterior (si existe) ===');
const anterior = db.prepare('SELECT * FROM microciclo WHERE rutina_id = ? AND numero = ?').get(rutina.id, numeroArg - 1);
if (anterior) {
  console.log(`Microciclo ${anterior.numero} (id ${anterior.id}) - estado ${anterior.estado}, fecha_inicio ${anterior.fecha_inicio}, fecha_fin ${anterior.fecha_fin}`);
  const progresosAnterior = db.prepare(`
    SELECT pem.ejercicio_asignado_id, e.nombre AS ejercicio_nombre, dr.dia_semana, pem.peso_prescrito, pem.piso_reps, pem.series_prescritas
    FROM progreso_ejercicio_microciclo pem
    JOIN ejercicio_asignado ea ON ea.id = pem.ejercicio_asignado_id
    JOIN ejercicio e ON e.id = ea.ejercicio_id
    JOIN dia_rutina dr ON dr.id = ea.dia_rutina_id
    WHERE pem.microciclo_id = ?
  `).all(anterior.id);
  console.log(`(${progresosAnterior.length} filas de progreso_ejercicio_microciclo ya existentes ahi)`);
  for (const p of progresosAnterior) {
    console.log(`  ${p.ejercicio_nombre} (ea ${p.ejercicio_asignado_id}, dia ${p.dia_semana}) - peso_prescrito ${p.peso_prescrito}, piso_reps ${p.piso_reps}, series_prescritas ${p.series_prescritas}`);
  }
} else {
  console.log('(no existe)');
}
