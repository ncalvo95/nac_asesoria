import { Router } from 'express';
import db from '../db/index.js';
import { puedeAccederAUsuario, requireAuth } from '../middleware/auth.js';
import { registrarSesion } from '../services/progressionEngine.js';
import { historialDeEjercicio, recordsDelUsuario, actividadDesde } from '../services/historialEjercicioService.js';

const router = Router();
router.use(requireAuth);

router.post('/usuarios/:usuarioId/sesiones', (req, res) => {
  const usuarioId = Number(req.params.usuarioId);
  if (!puedeAccederAUsuario(req.usuario, usuarioId)) {
    return res.status(403).json({ error: 'No autorizado.' });
  }

  const { dia_rutina_id, microciclo_id, fecha, salteada, series } = req.body || {};
  if (!dia_rutina_id || !microciclo_id) {
    return res.status(400).json({ error: 'dia_rutina_id y microciclo_id son obligatorios.' });
  }
  if (!salteada && (!Array.isArray(series) || series.length === 0)) {
    return res.status(400).json({ error: 'series es obligatorio salvo que la sesion este salteada.' });
  }

  const dia = db.prepare('SELECT dr.id, dr.activo, r.usuario_id FROM dia_rutina dr JOIN rutina r ON r.id = dr.rutina_id WHERE dr.id = ?').get(dia_rutina_id);
  if (!dia || dia.usuario_id !== usuarioId) {
    return res.status(400).json({ error: 'dia_rutina_id invalido para este usuario.' });
  }
  if (!dia.activo) {
    return res.status(400).json({ error: 'Ese dia ya no esta activo en la rutina.' });
  }

  const sesionId = registrarSesion({ usuarioId, diaRutinaId: dia_rutina_id, microcicloId: microciclo_id, fecha, salteada, series });
  res.status(201).json({ id: sesionId });
});

router.get('/usuarios/:usuarioId/sesiones', (req, res) => {
  const usuarioId = Number(req.params.usuarioId);
  if (!puedeAccederAUsuario(req.usuario, usuarioId)) {
    return res.status(403).json({ error: 'No autorizado.' });
  }
  const sesiones = db.prepare(`
    SELECT rs.*, dr.dia_semana
    FROM registro_sesion rs JOIN dia_rutina dr ON dr.id = rs.dia_rutina_id
    WHERE rs.usuario_id = ? ORDER BY rs.fecha DESC
  `).all(usuarioId);
  const seriesStmt = db.prepare('SELECT * FROM registro_serie WHERE registro_sesion_id = ? ORDER BY ejercicio_asignado_id, numero_serie');
  res.json(sesiones.map((s) => ({ ...s, series: seriesStmt.all(s.id) })));
});

function accesoOr403(req, res) {
  const usuarioId = Number(req.params.usuarioId);
  if (!puedeAccederAUsuario(req.usuario, usuarioId)) {
    res.status(403).json({ error: 'No autorizado.' });
    return null;
  }
  return usuarioId;
}

// Evolucion de un ejercicio del catalogo: una fila por sesion (mejor serie,
// 1RM estimado, volumen) mas los records historicos.
router.get('/usuarios/:usuarioId/ejercicios/:ejercicioId/historial', (req, res) => {
  const usuarioId = accesoOr403(req, res);
  if (usuarioId === null) return;
  const ejercicioId = Number(req.params.ejercicioId);
  if (!Number.isInteger(ejercicioId)) return res.status(400).json({ error: 'ejercicioId invalido.' });
  res.json(historialDeEjercicio(usuarioId, ejercicioId));
});

// Mejor 1RM estimado por ejercicio ({ [ejercicio_id]: kg }) para el aviso de
// record en vivo. ?excluir_sesion_id deja afuera la sesion de hoy ya guardada.
router.get('/usuarios/:usuarioId/records', (req, res) => {
  const usuarioId = accesoOr403(req, res);
  if (usuarioId === null) return;
  const excluir = req.query.excluir_sesion_id != null ? Number(req.query.excluir_sesion_id) : null;
  res.json(recordsDelUsuario(usuarioId, Number.isInteger(excluir) ? excluir : null));
});

// Dias entrenados de las ultimas N semanas (por defecto 12), con la cantidad
// de series de cada uno, para el mapa de actividad.
router.get('/usuarios/:usuarioId/actividad', (req, res) => {
  const usuarioId = accesoOr403(req, res);
  if (usuarioId === null) return;
  const semanas = Math.min(52, Math.max(1, Number(req.query.semanas) || 12));
  const desde = new Date(Date.now() - semanas * 7 * 86400000).toISOString().slice(0, 10);
  res.json({ desde, dias: actividadDesde(usuarioId, desde) });
});

export default router;
