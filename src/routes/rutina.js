import { Router } from 'express';
import db from '../db/index.js';
import { puedeAccederAUsuario, requireAuth } from '../middleware/auth.js';
import { crearRutina, obtenerRutinaActiva, reordenarEjercicios, sustituirEjercicio } from '../services/rutinaService.js';
import { aplicarDeload, cerrarMicrociclo, registrarSemana0 } from '../services/progressionEngine.js';
import { generarWorkbookUsuario } from '../services/excelGenerator.js';
import { tagsDisponibles } from '../services/routineBuilder.js';

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

function getEjercicioAsignadoOr404(req, res) {
  const ea = db.prepare(`
    SELECT ea.*, r.id AS rutina_id, r.usuario_id
    FROM ejercicio_asignado ea
    JOIN dia_rutina dr ON dr.id = ea.dia_rutina_id
    JOIN rutina r ON r.id = dr.rutina_id
    WHERE ea.id = ?
  `).get(req.params.ejercicioAsignadoId);
  if (!ea) {
    res.status(404).json({ error: 'Ejercicio asignado no encontrado.' });
    return null;
  }
  if (!checkAccesoUsuario(req, res, ea.usuario_id)) return null;
  return ea;
}

router.patch('/ejercicios/:ejercicioAsignadoId/lineal-forzado', (req, res) => {
  const ea = getEjercicioAsignadoOr404(req, res);
  if (!ea) return;
  const { activo } = req.body || {};
  if (typeof activo !== 'boolean') return res.status(400).json({ error: 'activo debe ser boolean.' });
  db.prepare('UPDATE ejercicio_asignado SET modo_lineal_forzado = ? WHERE id = ?').run(activo ? 1 : 0, ea.id);
  res.json({ id: ea.id, modo_lineal_forzado: activo });
});

router.get('/ejercicios/:ejercicioAsignadoId/candidatos', (req, res) => {
  const ea = getEjercicioAsignadoOr404(req, res);
  if (!ea) return;
  const equipamiento = db.prepare('SELECT * FROM equipamiento WHERE usuario_id = ?').get(ea.usuario_id);
  const musculoNombre = db.prepare('SELECT nombre FROM musculo WHERE id = ?').get(ea.musculo_objetivo_id).nombre;
  const tags = tagsDisponibles({
    tipo: equipamiento.tipo,
    checklist: JSON.parse(equipamiento.checklist_json),
    musculo: musculoNombre,
    musculosUbicacion: JSON.parse(equipamiento.musculos_ubicacion_json || '{}'),
  });
  const candidatos = db.prepare(`
    SELECT id, nombre, tipo, equipamiento_requerido_json FROM ejercicio
    WHERE musculo_primario_id = ? AND activo = 1 AND id != ?
  `).all(ea.musculo_objetivo_id, ea.ejercicio_id).filter((c) => {
    const requeridos = JSON.parse(c.equipamiento_requerido_json);
    return requeridos.every((tag) => tags.has(tag));
  });
  res.json(candidatos.map(({ equipamiento_requerido_json, ...c }) => c));
});

router.post('/ejercicios/:ejercicioAsignadoId/sustituir', (req, res, next) => {
  const ea = getEjercicioAsignadoOr404(req, res);
  if (!ea) return;
  const { nuevo_ejercicio_id, peso, reps_serie1, reps_serie2 } = req.body || {};
  if (!nuevo_ejercicio_id || peso == null || reps_serie1 == null || reps_serie2 == null) {
    return res.status(400).json({ error: 'nuevo_ejercicio_id, peso, reps_serie1 y reps_serie2 son obligatorios.' });
  }
  try {
    const out = sustituirEjercicio({ ejercicioAsignadoId: ea.id, usuarioId: ea.usuario_id, nuevoEjercicioId: nuevo_ejercicio_id, peso, repsSerie1: reps_serie1, repsSerie2: reps_serie2 });
    res.json(out);
  } catch (err) {
    if (err.message.includes('musculo') || err.message.includes('equipamiento') || err.message.includes('microciclo')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

router.post('/rutinas/:rutinaId/deload', (req, res, next) => {
  const rutina = getRutinaOr404(req, res);
  if (!rutina) return;
  try {
    const out = aplicarDeload(rutina.id);
    res.status(201).json(out);
  } catch (err) {
    if (err.message.includes('No hay microciclo')) return res.status(400).json({ error: err.message });
    next(err);
  }
});

router.get('/rutinas/:rutinaId/deload/actual', (req, res) => {
  const rutina = getRutinaOr404(req, res);
  if (!rutina) return;
  const microciclo = db.prepare("SELECT * FROM microciclo WHERE rutina_id = ? AND estado = 'en_curso'").get(rutina.id);
  if (!microciclo) return res.json(null);
  const deload = db.prepare(
    'SELECT * FROM deload WHERE microciclo_asociado_id = ? ORDER BY id DESC LIMIT 1'
  ).get(microciclo.id);
  if (!deload) return res.json(null);
  res.json({ ...deload, detalle: JSON.parse(deload.detalle_json) });
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

router.get('/rutinas/:rutinaId/progreso', (req, res) => {
  const rutina = getRutinaOr404(req, res);
  if (!rutina) return;

  const ultimoCerrado = db.prepare(
    "SELECT * FROM microciclo WHERE rutina_id = ? AND estado = 'cerrado' ORDER BY numero DESC LIMIT 1"
  ).get(rutina.id);
  if (!ultimoCerrado) return res.json({ microciclo: null, musculos: [], ejercicios: [] });

  const musculos = db.prepare(`
    SELECT m.nombre, pmm.volumen_directo, pmm.volumen_indirecto, pmm.estancado, pmm.cerca_de_mav, pmm.serie_agregada, r.mev, r.mav, r.mrv
    FROM progreso_muscular_microciclo pmm
    JOIN musculo m ON m.id = pmm.musculo_id
    JOIN referencia_volumen_muscular r ON r.musculo_id = m.id
    WHERE pmm.microciclo_id = ?
    ORDER BY m.id
  `).all(ultimoCerrado.id);

  const ejercicios = db.prepare(`
    SELECT ea.id, e.nombre AS ejercicio_nombre, m.nombre AS musculo_nombre, ea.es_top_de_musculo,
           pem.sem1_reps, pem.sem2_reps, pem.piso_reps, pem.techo_reps, pem.mejoro, pem.serie_agregada, pem.nota, pem.peso_prescrito
    FROM progreso_ejercicio_microciclo pem
    JOIN ejercicio_asignado ea ON ea.id = pem.ejercicio_asignado_id
    JOIN ejercicio e ON e.id = ea.ejercicio_id
    JOIN musculo m ON m.id = ea.musculo_objetivo_id
    WHERE pem.microciclo_id = ?
    ORDER BY ea.orden
  `).all(ultimoCerrado.id);

  res.json({ microciclo: ultimoCerrado, musculos, ejercicios });
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
