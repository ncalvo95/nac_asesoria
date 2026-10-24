import db from '../db/index.js';
import { e1rm } from '../../shared/training/e1rm.js';

// Series reales (no dropset) de sesiones efectivamente entrenadas (no
// salteadas). El ejercicio se identifica por el del catalogo (ea.ejercicio_id)
// y no por el ejercicio_asignado: un mismo ejercicio puede estar en varios
// dias o haber cambiado de rutina, y es el que el usuario reconoce.
const seriesDeEjercicioStmt = db.prepare(`
  SELECT rses.id AS sesion_id, rses.fecha, rs.peso, rs.reps
  FROM registro_serie rs
  JOIN registro_sesion rses ON rses.id = rs.registro_sesion_id
  JOIN ejercicio_asignado ea ON ea.id = rs.ejercicio_asignado_id
  WHERE rses.usuario_id = ? AND ea.ejercicio_id = ? AND rses.salteada = 0 AND rs.es_dropset = 0
  ORDER BY rses.fecha, rses.id, rs.numero_serie
`);

const seriesTodasStmt = db.prepare(`
  SELECT ea.ejercicio_id, rses.id AS sesion_id, rs.peso, rs.reps
  FROM registro_serie rs
  JOIN registro_sesion rses ON rses.id = rs.registro_sesion_id
  JOIN ejercicio_asignado ea ON ea.id = rs.ejercicio_asignado_id
  WHERE rses.usuario_id = ? AND rses.salteada = 0 AND rs.es_dropset = 0
`);

const actividadStmt = db.prepare(`
  SELECT rses.fecha, COUNT(rs.id) AS series
  FROM registro_sesion rses
  LEFT JOIN registro_serie rs ON rs.registro_sesion_id = rses.id AND rs.es_dropset = 0
  WHERE rses.usuario_id = ? AND rses.salteada = 0 AND rses.fecha >= ?
  GROUP BY rses.id
  ORDER BY rses.fecha
`);

// Una fila por sesion: la mejor serie (por 1RM estimado), el volumen total
// (peso x reps) y cuantas series reales hubo. `records` es el mejor de todo el
// historico del ejercicio.
export function historialDeEjercicio(usuarioId, ejercicioId, limite = 30) {
  const porSesion = new Map();
  for (const s of seriesDeEjercicioStmt.all(usuarioId, ejercicioId)) {
    let ses = porSesion.get(s.sesion_id);
    if (!ses) {
      ses = { sesion_id: s.sesion_id, fecha: s.fecha, mejor_e1rm: null, mejor_peso: 0, mejor_serie: null, volumen: 0, series: 0 };
      porSesion.set(s.sesion_id, ses);
    }
    ses.series += 1;
    ses.volumen += s.peso * s.reps;
    ses.mejor_peso = Math.max(ses.mejor_peso, s.peso);
    const valor = e1rm(s.peso, s.reps);
    if (valor != null && (ses.mejor_e1rm == null || valor > ses.mejor_e1rm)) {
      ses.mejor_e1rm = valor;
      ses.mejor_serie = { peso: s.peso, reps: s.reps };
    }
  }
  const todas = [...porSesion.values()].map((s) => ({ ...s, volumen: Math.round(s.volumen) }));
  const records = {
    mejor_e1rm: todas.reduce((m, s) => (s.mejor_e1rm != null && s.mejor_e1rm > m ? s.mejor_e1rm : m), 0) || null,
    mejor_peso: todas.reduce((m, s) => Math.max(m, s.mejor_peso), 0) || null,
  };
  return { ejercicio_id: ejercicioId, sesiones: todas.slice(-limite), records };
}

// Mejor 1RM estimado historico por ejercicio, para avisar de un record en vivo.
// `excluirSesionId` deja afuera la sesion de hoy ya registrada: si no, al
// reabrirla sus propias series serian "lo previo" y el record desapareceria.
export function recordsDelUsuario(usuarioId, excluirSesionId = null) {
  const mejor = {};
  for (const s of seriesTodasStmt.all(usuarioId)) {
    if (excluirSesionId != null && s.sesion_id === excluirSesionId) continue;
    const valor = e1rm(s.peso, s.reps);
    if (valor != null && valor > (mejor[s.ejercicio_id] ?? 0)) mejor[s.ejercicio_id] = valor;
  }
  return mejor;
}

// Sesiones entrenadas desde `desde` (YYYY-MM-DD), con sus series: alimenta el
// mapa de actividad. Varias sesiones el mismo dia se suman.
export function actividadDesde(usuarioId, desde) {
  const porFecha = new Map();
  for (const r of actividadStmt.all(usuarioId, desde)) {
    const a = porFecha.get(r.fecha) ?? { fecha: r.fecha, sesiones: 0, series: 0 };
    a.sesiones += 1;
    a.series += r.series;
    porFecha.set(r.fecha, a);
  }
  return [...porFecha.values()];
}
