import db from '../db/index.js';
import { rangosDeBloque, intervalosDePausas, diasPausados, sumarDias } from '../../shared/training/calendarioBloque.js';

const hoyUtc = () => new Date().toISOString().slice(0, 10);
const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const pausasStmt = db.prepare('SELECT * FROM pausa_progreso WHERE rutina_id = ? ORDER BY desde, id');
const abiertaStmt = db.prepare('SELECT * FROM pausa_progreso WHERE rutina_id = ? AND hasta IS NULL');
const microcicloEnCursoStmt = db.prepare("SELECT * FROM microciclo WHERE rutina_id = ? AND estado = 'en_curso'");

export class ProgresoEnPausaError extends Error {
  constructor() {
    super('El progreso de esta rutina está en pausa: reactivalo para poder anotar o cerrar bloques.');
    this.name = 'ProgresoEnPausaError';
  }
}

export function pausaActiva(rutinaId) {
  return abiertaStmt.get(rutinaId) ?? null;
}

// Corta una operacion que modifica el progreso (anotar, cerrar, testear...)
// mientras la rutina esta en pausa.
export function asegurarNoPausada(rutinaId) {
  if (pausaActiva(rutinaId)) throw new ProgresoEnPausaError();
}

// Fin "abierto" de la semana 2: una sesion se asigna a un bloque por su
// microciclo_id (el del bloque abierto al registrarla), no por la fecha, asi que
// lo entrenado DESPUES de los 14 dias del bloque -porque todavia no se lo cerro-
// sigue contando como semana 2 en vez de quedar afuera y no verse en ningun lado.
export const FIN_ABIERTO = '9999-12-31';

// Rangos de fechas {1: [a,b], 2: [c, FIN_ABIERTO], finBloque, siguienteInicio} de
// un bloque de esta rutina que arranca en fechaInicio, descontando los dias
// pausados. `finBloque` es el ultimo dia "de calendario" del bloque (el que
// vence, no el tope de la semana 2).
export function rangosDeBloqueDeRutina(rutinaId, fechaInicio, hoy = hoyUtc()) {
  const r = rangosDeBloque(fechaInicio, intervalosDePausas(pausasStmt.all(rutinaId), hoy));
  return { 1: r[1], 2: [r[2][0], FIN_ABIERTO], finBloque: r[2][1], siguienteInicio: r.siguienteInicio };
}

// Fecha de arranque del bloque que sigue a uno que se cierra ahora: hoy (nunca
// antes del inicio del que se cierra). Asi cerrar tarde no deja al siguiente
// arrancando en el pasado, y cerrar antes de los 14 dias tampoco lo deja
// arrancando en el futuro, donde lo que se anote hasta entonces no se veria.
export function inicioDelSiguienteBloque(rutinaId, fechaInicio, hoy = hoyUtc()) {
  return hoy > fechaInicio ? hoy : fechaInicio;
}

function fechaValida(fecha) {
  return typeof fecha === 'string' && FECHA_REGEX.test(fecha) ? fecha : hoyUtc();
}

export function pausar(rutinaId, { motivo, fecha, usuarioId } = {}) {
  if (pausaActiva(rutinaId)) throw new Error('El progreso ya está en pausa.');
  if (!microcicloEnCursoStmt.get(rutinaId)) throw new Error('No hay un bloque en curso para pausar.');
  const limpio = typeof motivo === 'string' ? motivo.trim().slice(0, 120) : '';
  db.prepare('INSERT INTO pausa_progreso (rutina_id, desde, motivo, creado_por) VALUES (?, ?, ?, ?)')
    .run(rutinaId, fechaValida(fecha), limpio || null, usuarioId ?? null);
  return estadoPausa(rutinaId);
}

// Cierra la pausa abierta. Devuelve cuantos dias dejaron de correr; la UI usa
// eso para sugerir retestear tras una ausencia larga.
export function reanudar(rutinaId, { fecha } = {}) {
  const abierta = pausaActiva(rutinaId);
  if (!abierta) throw new Error('El progreso no está en pausa.');
  let hasta = fechaValida(fecha);
  if (hasta < abierta.desde) hasta = abierta.desde;
  db.prepare('UPDATE pausa_progreso SET hasta = ? WHERE id = ?').run(hasta, abierta.id);
  return {
    dias_pausados: diasPausados(abierta.desde, hasta),
    dias_fuera: Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${abierta.desde}T00:00:00Z`)) / 86400000),
    motivo: abierta.motivo,
  };
}

// Lo que ve el frontend: la pausa abierta (con cuantos dias lleva) o null.
export function estadoPausa(rutinaId, hoy = hoyUtc()) {
  const abierta = pausaActiva(rutinaId);
  if (!abierta) return null;
  return {
    desde: abierta.desde,
    motivo: abierta.motivo,
    dias: Math.max(0, Math.round((Date.parse(`${hoy}T00:00:00Z`) - Date.parse(`${abierta.desde}T00:00:00Z`)) / 86400000)),
  };
}

export { sumarDias };
