#!/usr/bin/env node
// Revierte un cierre de microciclo hecho antes de tiempo (ej. alguien tocó
// "Cerrar microciclo" en Progreso sin haber completado las 2 semanas) -
// reabre el microciclo anterior (estado='en_curso', fecha_fin=NULL) y borra
// el microciclo nuevo que se creó de más, siempre que ese microciclo nuevo
// no tenga ninguna sesión ni progreso real cargado todavía (si los tiene,
// aborta sin tocar nada, para no perder datos genuinos por accidente).
//
// No toca ejercicio_asignado.peso_actual/series_actuales para nada - un
// cierre sin datos de semana 2 nunca llega a recalcularlos (techoDesde
// devuelve null si falta cualquiera de las 2 semanas), así que esos valores
// ya están intactos de antes; el problema es solo qué microciclo queda
// "en_curso".
//
// Uso (dentro del contenedor, o donde corra el server con acceso a la DB):
//   node scripts/revertir-cierre-microciclo.mjs <usuario>            (dry-run, no cambia nada)
//   node scripts/revertir-cierre-microciclo.mjs <usuario> --confirmar (aplica el revert)
//
// DB_PATH debe apuntar a la misma base que usa el server (por defecto
// data/app.db relativo a la raíz del proyecto, igual que src/db/index.js).

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
  console.error('Uso: node scripts/revertir-cierre-microciclo.mjs <usuario> [--confirmar]');
  process.exit(1);
}

const usuario = db.prepare('SELECT * FROM usuarios WHERE usuario = ?').get(usuarioArg);
if (!usuario) {
  console.error(`No existe ningun usuario con login "${usuarioArg}".`);
  process.exit(1);
}

const rutina = db.prepare("SELECT * FROM rutina WHERE usuario_id = ? AND estado = 'activa'").get(usuario.id);
if (!rutina) {
  console.error(`El usuario "${usuarioArg}" no tiene una rutina activa.`);
  process.exit(1);
}

const actual = db.prepare("SELECT * FROM microciclo WHERE rutina_id = ? AND estado = 'en_curso'").get(rutina.id);
if (!actual) {
  console.error('No hay ningun microciclo en_curso para esa rutina - no hay nada que revertir.');
  process.exit(1);
}
if (actual.numero < 1) {
  console.error(`El microciclo en curso es el numero ${actual.numero} (testeo) - esto no aplica a testeos.`);
  process.exit(1);
}

const anterior = db.prepare('SELECT * FROM microciclo WHERE rutina_id = ? AND numero = ?').get(rutina.id, actual.numero - 1);
if (!anterior || anterior.estado !== 'cerrado') {
  console.error(`No encuentro un microciclo ${actual.numero - 1} cerrado justo antes del actual (numero ${actual.numero}) - revisa a mano, no parece el caso de "cierre accidental".`);
  process.exit(1);
}

const sesiones = db.prepare('SELECT COUNT(*) AS n FROM registro_sesion WHERE microciclo_id = ?').get(actual.id).n;
const progresoEjercicio = db.prepare('SELECT COUNT(*) AS n FROM progreso_ejercicio_microciclo WHERE microciclo_id = ?').get(actual.id).n;
const progresoMuscular = db.prepare('SELECT COUNT(*) AS n FROM progreso_muscular_microciclo WHERE microciclo_id = ?').get(actual.id).n;

console.log(`Usuario: ${usuario.nombre} (${usuario.usuario})`);
console.log(`Rutina activa: ${rutina.id}`);
console.log(`Microciclo actual (en_curso): numero ${actual.numero}, id ${actual.id}, fecha_inicio ${actual.fecha_inicio}`);
console.log(`Microciclo anterior (cerrado): numero ${anterior.numero}, id ${anterior.id}, fecha_inicio ${anterior.fecha_inicio}, fecha_fin ${anterior.fecha_fin}`);
console.log(`Datos ya cargados en el microciclo actual: ${sesiones} sesion(es), ${progresoEjercicio} fila(s) de progreso por ejercicio, ${progresoMuscular} fila(s) de progreso muscular.`);

if (sesiones > 0 || progresoEjercicio > 0) {
  console.error('\nEl microciclo actual YA tiene datos reales cargados (sesiones o progreso por ejercicio) - no lo borro automaticamente para no perder nada. Revisa a mano.');
  process.exit(1);
}

if (!confirmar) {
  console.log('\n(dry-run - no se cambio nada. Volve a correr con --confirmar para aplicar el revert.)');
  process.exit(0);
}

const revertir = db.transaction(() => {
  db.prepare("UPDATE microciclo SET estado = 'en_curso', fecha_fin = NULL WHERE id = ?").run(anterior.id);
  db.prepare('DELETE FROM microciclo WHERE id = ?').run(actual.id);
});
revertir();

console.log(`\nListo. Microciclo ${anterior.numero} (id ${anterior.id}) vuelve a estar en_curso. Microciclo ${actual.numero} (id ${actual.id}) fue eliminado.`);
console.log('Los pesos/series de los ejercicios no se tocaron en ningun momento - deberian seguir mostrando lo mismo que antes del cierre accidental.');
