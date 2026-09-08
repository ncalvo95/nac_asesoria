import { Router } from 'express';
import db from '../db/index.js';
import { puedeAccederAUsuario, requireAuth } from '../middleware/auth.js';
import { crearRutina, obtenerRutinaActiva, reordenarEjercicios } from '../services/rutinaService.js';
import { cerrarMicrociclo, registrarSemana0 } from '../services/progressionEngine.js';
import { generarWorkbookUsuario } from '../services/excelGenerator.js';

const router = Router();
router.use(requireAuth);

function checkAccesoUsuario(req, res, usuarioId) {
  if (!puedeAccederAUsuario(req.usuario, usuarioId)) {
    res.status(403).json({ error: 'No autorizado.' });
    return false;
  }
  return true;
}

function getRutinaOr404(req, res) {
  const rutina = db.prepare('SELECT * FROM rutina WHERE id = ?').get(req.params.rutinaId);
  if (!rutina) {
    res.status(404).json({ error: 'Rutina no encontrada.' });
    return null;
  }
  if (!checkAccesoUsuario(req, res, rutina.usuario_id)) return null;
  return rutina;
}

router.post('/usuarios/:usuarioId/rutina', (req, res, next) => {
  const usuarioId = Number(req.params.usuarioId);
  if (!checkAccesoUsuario(req, res, usuarioId)) return;
  try {
    const rutina = crearRutina(usuarioId);
    res.status(201).json(rutina);
  } catch (err) {
    if (err.message.includes('Falta completar')) return res.status(400).json({ error: err.message });
    next(err);
  }
});

router.get('/usuarios/:usuarioId/rutina', (req, res) => {
  const usuarioId = Number(req.params.usuarioId);
  if (!checkAccesoUsuario(req, res, usuarioId)) return;
  const rutina = obtenerRutinaActiva(usuarioId);
  if (!rutina) return res.status(404).json({ error: 'El usuario no tiene una rutina activa.' });
  res.json(rutina);
});

router.patch('/dias/:diaRutinaId/orden', (req, res) => {
  const dia = db.prepare(`
    SELECT dr.*, r.usuario_id FROM dia_rutina dr JOIN rutina r ON r.id = dr.rutina_id WHERE dr.id = ?
  `).get(req.params.diaRutinaId);
  if (!dia) return res.status(404).json({ error: 'Dia no encontrado.' });
  if (!checkAccesoUsuario(req, res, dia.usuario_id)) return;

  const { orden } = req.body || {};
  if (!Array.isArray(orden) || orden.some((o) => !o.ejercicio_asignado_id || !o.orden)) {
    return res.status(400).json({ error: 'orden debe ser [{ejercicio_asignado_id, orden}, ...].' });
  }
  reordenarEjercicios(req.params.diaRutinaId, orden);
  res.status(204).end();
});

router.post('/rutinas/:rutinaId/semana0', (req, res, next) => {
  const rutina = getRutinaOr404(req, res);
  if (!rutina) return;
  const { resultados } = req.body || {};
  if (!Array.isArray(resultados) || resultados.length === 0) {
    return res.status(400).json({ error: 'resultados debe ser una lista de {ejercicio_asignado_id, peso, reps_serie1, reps_serie2}.' });
  }
  for (const r of resultados) {
    if (!r.ejercicio_asignado_id || r.peso == null || r.reps_serie1 == null || r.reps_serie2 == null) {
      return res.status(400).json({ error: 'Cada resultado necesita ejercicio_asignado_id, peso, reps_serie1 y reps_serie2.' });
    }
  }
  try {
    const out = registrarSemana0(rutina.id, rutina.usuario_id, resultados);
    res.status(201).json(out);
  } catch (err) {
    next(err);
  }
});

router.post('/rutinas/:rutinaId/microciclos/:numero/cerrar', (req, res, next) => {
  const rutina = getRutinaOr404(req, res);
  if (!rutina) return;
  try {
    const out = cerrarMicrociclo(rutina.id, Number(req.params.numero));
    res.json(out);
  } catch (err) {
    if (err.message.includes('No existe') || err.message.includes('ya esta cerrado')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

router.get('/rutinas/:rutinaId/export.xlsx', async (req, res) => {
  const rutina = getRutinaOr404(req, res);
  if (!rutina) return;
  try {
    const { workbook } = generarWorkbookUsuario(rutina.usuario_id);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="plan-entrenamiento.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
