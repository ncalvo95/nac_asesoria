import { Router } from 'express';
import db from '../db/index.js';
import { puedeAccederAUsuario, requireAuth } from '../middleware/auth.js';
import { registrarSesion } from '../services/progressionEngine.js';

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

  const dia = db.prepare('SELECT dr.id, r.usuario_id FROM dia_rutina dr JOIN rutina r ON r.id = dr.rutina_id WHERE dr.id = ?').get(dia_rutina_id);
  if (!dia || dia.usuario_id !== usuarioId) {
    return res.status(400).json({ error: 'dia_rutina_id invalido para este usuario.' });
  }

  const sesionId = registrarSesion({ usuarioId, diaRutinaId: dia_rutina_id, microcicloId: microciclo_id, fecha, salteada, series });
  res.status(201).json({ id: sesionId });
});

router.get('/usuarios/:usuarioId/sesiones', (req, res) => {
  const usuarioId = Number(req.params.usuarioId);
  if (!puedeAccederAUsuario(req.usuario, usuarioId)) {
    return res.status(403).json({ error: 'No autorizado.' });
  }
  const sesiones = db.prepare('SELECT * FROM registro_sesion WHERE usuario_id = ? ORDER BY fecha DESC').all(usuarioId);
  const seriesStmt = db.prepare('SELECT * FROM registro_serie WHERE registro_sesion_id = ? ORDER BY ejercicio_asignado_id, numero_serie');
  res.json(sesiones.map((s) => ({ ...s, series: seriesStmt.all(s.id) })));
});

export default router;
