#!/usr/bin/env node
// Para el caso en que revertir-cierre-microciclo.mjs aborta porque el
// microciclo nuevo (creado por un cierre accidental) YA tiene sesiones/
// progreso reales cargados (ej. el usuario siguio entrenando sin darse
// cuenta del salto de microciclo). En vez de descartar ese microciclo
// nuevo, FUSIONA sus datos de vuelta en el microciclo anterior: mueve
// registro_sesion y progreso_ejercicio_microciclo (re-apuntando
// microciclo_id), reactiva el microciclo anterior (estado='en_curso',
// fecha_fin=NULL) y borra el microciclo nuevo, que queda vacio.
//
// No toca la estructura de dias/ejercicios (ejercicio_asignado, dia_rutina)
// para nada - si en el medio se agrego o reemplazo algun dia a mano, eso
// se deja tal cual esta, solo se mueve el HISTORIAL (sesiones/progreso).
//
// Aborta sin cambiar nada si algun ejercicio_asignado_id ya tiene una fila
// de progreso_ejercicio_microciclo en AMBOS microciclos (nuevo y anterior)
// - ahi hay que decidir a mano cual de las dos vale, no lo pisa solo.
//
// Uso:
//   node scripts/fusionar-cierre-accidental.mjs <usuario>              (dry-run)
//   node scripts/fusionar-cierre-accidental.mjs <usuario> --confirmar  (aplica)

import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'app.db');
const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

const usuarioArg = process.argv[2];
const confirmar = process.argv.includes('--confirmar');
if (!usuarioArg) {
  console.error('Uso: node scripts/fusionar-cierre-accidental.mjs <usuario> [--confirmar]');
  process.exit(1);
}

const usuario = db.prepare('SELECT * FROM usuarios WHERE usuario = ?').get(usuarioArg);
if (!usuario) { console.error(`No existe usuario "${usuarioArg}".`); process.exit(1); }

const rutina = db.prepare("SELECT * FROM rutina WHERE usuario_id = ? AND estado = 'activa'").get(usuario.id);
if (!rutina) { console.error('No tiene rutina activa.'); process.exit(1); }

const actual = db.prepare("SELECT * FROM microciclo WHERE rutina_id = ? AND estado = 'en_curso'").get(rutina.id);
if (!actual) { console.error('No hay microciclo en_curso - nada que fusionar.'); process.exit(1); }
if (actual.numero < 1) { console.error(`El microciclo en curso es el numero ${actual.numero} (testeo) - esto no aplica.`); process.exit(1); }

const anterior = db.prepare('SELECT * FROM microciclo WHERE rutina_id = ? AND numero = ?').get(rutina.id, actual.numero - 1);
if (!anterior || anterior.estado !== 'cerrado') {
  console.error(`No encuentro un microciclo ${actual.numero - 1} cerrado justo antes del actual (numero ${actual.numero}) - revisa a mano.`);
  process.exit(1);
}

const sesiones = db.prepare(`
  SELECT rs.*, dr.dia_semana FROM registro_sesion rs JOIN dia_rutina dr ON dr.id = rs.dia_rutina_id WHERE rs.microciclo_id = ?
`).all(actual.id);
const progresos = db.prepare(`
  SELECT pem.*, e.nombre AS ejercicio_nombre FROM progreso_ejercicio_microciclo pem
  JOIN ejercicio_asignado ea ON ea.id = pem.ejercicio_asignado_id JOIN ejercicio e ON e.id = ea.ejercicio_id
  WHERE pem.microciclo_id = ?
`).all(actual.id);
const progresosMusculares = db.prepare('SELECT * FROM progreso_muscular_microciclo WHERE microciclo_id = ?').all(actual.id);

console.log(`Usuario: ${usuario.nombre} (${usuario.usuario})`);
console.log(`Microciclo actual (en_curso): numero ${actual.numero}, id ${actual.id}, fecha_inicio ${actual.fecha_inicio}`);
console.log(`Microciclo anterior (cerrado): numero ${anterior.numero}, id ${anterior.id}, fecha_inicio ${anterior.fecha_inicio}, fecha_fin ${anterior.fecha_fin}`);
console.log(`\nSesiones a migrar de microciclo ${actual.numero} a ${anterior.numero} (${sesiones.length}):`);
for (const s of sesiones) console.log(`  sesion id ${s.id} - ${s.dia_semana} - fecha ${s.fecha}`);
console.log(`\nProgreso por ejercicio a migrar (${progresos.length}):`);
for (const p of progresos) console.log(`  ${p.ejercicio_nombre} (ea ${p.ejercicio_asignado_id}) - peso_prescrito ${p.peso_prescrito}, piso_reps ${p.piso_reps}, series_prescritas ${p.series_prescritas}`);
console.log(`\nProgreso muscular a migrar (${progresosMusculares.length} fila(s))`);

const conflictos = progresos.filter((p) =>
  db.prepare('SELECT 1 FROM progreso_ejercicio_microciclo WHERE ejercicio_asignado_id = ? AND microciclo_id = ?').get(p.ejercicio_asignado_id, anterior.id)
);
if (conflictos.length > 0) {
  console.error(`\nABORTADO: estos ejercicios ya tienen una fila de progreso en el microciclo ${anterior.numero} tambien - no los piso solo, decidilo a mano: ${conflictos.map((c) => `${c.ejercicio_nombre} (ea ${c.ejercicio_asignado_id})`).join(', ')}`);
  process.exit(1);
}

const conflictosMuscular = progresosMusculares.filter((p) =>
  db.prepare('SELECT 1 FROM progreso_muscular_microciclo WHERE usuario_id = ? AND musculo_id = ? AND microciclo_id = ?').get(p.usuario_id, p.musculo_id, anterior.id)
);
if (conflictosMuscular.length > 0) {
  console.error(`\nABORTADO: hay progreso muscular en conflicto entre ambos microciclos - revisa a mano.`);
  process.exit(1);
}

if (!confirmar) {
  console.log('\n(dry-run - no se cambio nada. Volve a correr con --confirmar para aplicar la fusion.)');
  process.exit(0);
}

const fusionar = db.transaction(() => {
  db.prepare('UPDATE registro_sesion SET microciclo_id = ? WHERE microciclo_id = ?').run(anterior.id, actual.id);
  db.prepare('UPDATE progreso_ejercicio_microciclo SET microciclo_id = ? WHERE microciclo_id = ?').run(anterior.id, actual.id);
  db.prepare('UPDATE progreso_muscular_microciclo SET microciclo_id = ? WHERE microciclo_id = ?').run(anterior.id, actual.id);
  db.prepare("UPDATE microciclo SET estado = 'en_curso', fecha_fin = NULL WHERE id = ?").run(anterior.id);
  db.prepare('DELETE FROM microciclo WHERE id = ?').run(actual.id);
});
fusionar();

console.log(`\nListo. Microciclo ${anterior.numero} (id ${anterior.id}) reactivado con las sesiones/progreso del microciclo ${actual.numero} fusionadas adentro. Microciclo ${actual.numero} (id ${actual.id}) fue eliminado.`);
