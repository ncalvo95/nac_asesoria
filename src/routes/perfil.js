import { Router } from 'express';
import db from '../db/index.js';
import { puedeAccederAUsuario, requireAuth } from '../middleware/auth.js';

const router = Router({ mergeParams: true });

function checkAcceso(req, res) {
  const usuarioId = Number(req.params.usuarioId);
  if (!puedeAccederAUsuario(req.usuario, usuarioId)) {
    res.status(403).json({ error: 'No autorizado.' });
    return null;
  }
  return usuarioId;
}

router.use(requireAuth);

// ---- Objetivo ----
const upsertObjetivo = db.prepare(`
  INSERT INTO objetivo (usuario_id, tipo, sub_objetivo, deporte)
  VALUES (@usuario_id, @tipo, @sub_objetivo, @deporte)
  ON CONFLICT(usuario_id) DO UPDATE SET tipo = excluded.tipo, sub_objetivo = excluded.sub_objetivo, deporte = excluded.deporte
`);

router.put('/:usuarioId/objetivo', (req, res) => {
  const usuario_id = checkAcceso(req, res);
  if (usuario_id === null) return;
  const { tipo, sub_objetivo, deporte } = req.body || {};
  if (!['fuerza', 'hipertrofia', 'rendimiento'].includes(tipo)) {
    return res.status(400).json({ error: 'tipo debe ser fuerza, hipertrofia o rendimiento.' });
  }
  if (!sub_objetivo) return res.status(400).json({ error: 'sub_objetivo es obligatorio.' });
  if (tipo === 'rendimiento' && !deporte) {
    return res.status(400).json({ error: 'deporte es obligatorio para objetivo rendimiento.' });
  }
  upsertObjetivo.run({ usuario_id, tipo, sub_objetivo, deporte: deporte || null });
  res.json({ usuario_id, tipo, sub_objetivo, deporte: deporte || null });
});

// ---- Disponibilidad ----
const upsertDisponibilidad = db.prepare(`
  INSERT INTO disponibilidad (usuario_id, dias_por_semana, dias_especificos_json, duracion_sesion_json)
  VALUES (@usuario_id, @dias_por_semana, @dias_especificos_json, @duracion_sesion_json)
  ON CONFLICT(usuario_id) DO UPDATE SET dias_por_semana = excluded.dias_por_semana,
    dias_especificos_json = excluded.dias_especificos_json, duracion_sesion_json = excluded.duracion_sesion_json
`);
const DIAS_VALIDOS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];

router.put('/:usuarioId/disponibilidad', (req, res) => {
  const usuario_id = checkAcceso(req, res);
  if (usuario_id === null) return;
  const { dias_especificos, duracion_sesion } = req.body || {};
  if (!Array.isArray(dias_especificos) || dias_especificos.length < 2 || dias_especificos.length > 6) {
    return res.status(400).json({ error: 'dias_especificos debe tener entre 2 y 6 dias.' });
  }
  if (dias_especificos.some((d) => !DIAS_VALIDOS.includes(d))) {
    return res.status(400).json({ error: `Dias validos: ${DIAS_VALIDOS.join(', ')}.` });
  }
  if (!duracion_sesion || typeof duracion_sesion !== 'object') {
    return res.status(400).json({ error: 'duracion_sesion debe ser un objeto {dia: minutos}.' });
  }
  upsertDisponibilidad.run({
    usuario_id,
    dias_por_semana: dias_especificos.length,
    dias_especificos_json: JSON.stringify(dias_especificos),
    duracion_sesion_json: JSON.stringify(duracion_sesion),
  });
  res.json({ usuario_id, dias_especificos, duracion_sesion });
});

// ---- Equipamiento ----
const upsertEquipamiento = db.prepare(`
  INSERT INTO equipamiento (usuario_id, tipo, checklist_json)
  VALUES (@usuario_id, @tipo, @checklist_json)
  ON CONFLICT(usuario_id) DO UPDATE SET tipo = excluded.tipo, checklist_json = excluded.checklist_json
`);

router.put('/:usuarioId/equipamiento', (req, res) => {
  const usuario_id = checkAcceso(req, res);
  if (usuario_id === null) return;
  const { tipo, checklist } = req.body || {};
  if (!['gimnasio', 'casa', 'mixto'].includes(tipo)) {
    return res.status(400).json({ error: 'tipo debe ser gimnasio, casa o mixto.' });
  }
  upsertEquipamiento.run({ usuario_id, tipo, checklist_json: JSON.stringify(checklist || []) });
  res.json({ usuario_id, tipo, checklist: checklist || [] });
});

// ---- Perfil medico (opcional) ----
const upsertPerfilMedico = db.prepare(`
  INSERT INTO perfil_medico (usuario_id, historial_lesiones, limitaciones_articulares)
  VALUES (@usuario_id, @historial_lesiones, @limitaciones_articulares)
  ON CONFLICT(usuario_id) DO UPDATE SET historial_lesiones = excluded.historial_lesiones, limitaciones_articulares = excluded.limitaciones_articulares
`);

router.put('/:usuarioId/perfil-medico', (req, res) => {
  const usuario_id = checkAcceso(req, res);
  if (usuario_id === null) return;
  const { historial_lesiones, limitaciones_articulares } = req.body || {};
  upsertPerfilMedico.run({ usuario_id, historial_lesiones: historial_lesiones || null, limitaciones_articulares: limitaciones_articulares || null });
  res.json({ usuario_id, historial_lesiones, limitaciones_articulares });
});

// ---- Antropometria (historico) ----
const insertAntropometria = db.prepare(`
  INSERT INTO registro_antropometrico (
    usuario_id, fecha, peso_corporal, formula_pliegues, pliegues_json,
    circunferencias_json, diametros_oseos_json, porcentaje_graso_calculado
  ) VALUES (@usuario_id, COALESCE(@fecha, date('now')), @peso_corporal, @formula_pliegues, @pliegues_json,
    @circunferencias_json, @diametros_oseos_json, @porcentaje_graso_calculado)
`);

router.post('/:usuarioId/antropometria', (req, res) => {
  const usuario_id = checkAcceso(req, res);
  if (usuario_id === null) return;
  const { fecha, peso_corporal, formula_pliegues, pliegues, circunferencias, diametros_oseos, porcentaje_graso_calculado } = req.body || {};
  const info = insertAntropometria.run({
    usuario_id,
    fecha: fecha || null,
    peso_corporal: peso_corporal ?? null,
    formula_pliegues: formula_pliegues || null,
    pliegues_json: pliegues ? JSON.stringify(pliegues) : null,
    circunferencias_json: circunferencias ? JSON.stringify(circunferencias) : null,
    diametros_oseos_json: diametros_oseos ? JSON.stringify(diametros_oseos) : null,
    porcentaje_graso_calculado: porcentaje_graso_calculado ?? null,
  });
  res.status(201).json({ id: info.lastInsertRowid });
});

router.get('/:usuarioId/antropometria', (req, res) => {
  const usuario_id = checkAcceso(req, res);
  if (usuario_id === null) return;
  const rows = db.prepare('SELECT * FROM registro_antropometrico WHERE usuario_id = ? ORDER BY fecha').all(usuario_id);
  res.json(rows);
});

// ---- RM estimado ----
const insertRm = db.prepare(`
  INSERT INTO rm_estimado (usuario_id, ejercicio_id, valor, fecha, tipo)
  VALUES (@usuario_id, @ejercicio_id, @valor, COALESCE(@fecha, date('now')), @tipo)
`);

router.post('/:usuarioId/rm-estimado', (req, res) => {
  const usuario_id = checkAcceso(req, res);
  if (usuario_id === null) return;
  const { ejercicio_id, valor, fecha, tipo } = req.body || {};
  if (!ejercicio_id || !valor || !['real', 'estimado'].includes(tipo)) {
    return res.status(400).json({ error: 'ejercicio_id, valor y tipo (real/estimado) son obligatorios.' });
  }
  const info = insertRm.run({ usuario_id, ejercicio_id, valor, fecha: fecha || null, tipo });
  res.status(201).json({ id: info.lastInsertRowid });
});

// ---- Preferencias de ejercicio (exclusion / preferencia / agregado_personalizado) ----
const insertPreferencia = db.prepare(`
  INSERT INTO preferencia_ejercicio_usuario (usuario_id, ejercicio_id, tipo, nombre_personalizado, musculo_asignado_id)
  VALUES (@usuario_id, @ejercicio_id, @tipo, @nombre_personalizado, @musculo_asignado_id)
`);

router.post('/:usuarioId/preferencias-ejercicio', (req, res) => {
  const usuario_id = checkAcceso(req, res);
  if (usuario_id === null) return;
  const { ejercicio_id, tipo, nombre_personalizado, musculo_asignado_id } = req.body || {};
  if (!['exclusion', 'preferencia', 'agregado_personalizado'].includes(tipo)) {
    return res.status(400).json({ error: 'tipo debe ser exclusion, preferencia o agregado_personalizado.' });
  }
  if (tipo === 'agregado_personalizado' && (!nombre_personalizado || !musculo_asignado_id)) {
    return res.status(400).json({ error: 'agregado_personalizado requiere nombre_personalizado y musculo_asignado_id.' });
  }
  if (tipo !== 'agregado_personalizado' && !ejercicio_id) {
    return res.status(400).json({ error: 'ejercicio_id es obligatorio para exclusion/preferencia.' });
  }
  const info = insertPreferencia.run({
    usuario_id,
    ejercicio_id: ejercicio_id || null,
    tipo,
    nombre_personalizado: nombre_personalizado || null,
    musculo_asignado_id: musculo_asignado_id || null,
  });
  res.status(201).json({ id: info.lastInsertRowid });
});

router.delete('/:usuarioId/preferencias-ejercicio/:prefId', (req, res) => {
  const usuario_id = checkAcceso(req, res);
  if (usuario_id === null) return;
  db.prepare('DELETE FROM preferencia_ejercicio_usuario WHERE id = ? AND usuario_id = ?').run(req.params.prefId, usuario_id);
  res.status(204).end();
});

router.get('/:usuarioId/preferencias-ejercicio', (req, res) => {
  const usuario_id = checkAcceso(req, res);
  if (usuario_id === null) return;
  res.json(db.prepare('SELECT * FROM preferencia_ejercicio_usuario WHERE usuario_id = ?').all(usuario_id));
});

// ---- Vista consolidada del perfil (para armar la rutina) ----
router.get('/:usuarioId/perfil', (req, res) => {
  const usuario_id = checkAcceso(req, res);
  if (usuario_id === null) return;
  const objetivo = db.prepare('SELECT * FROM objetivo WHERE usuario_id = ?').get(usuario_id);
  const disponibilidad = db.prepare('SELECT * FROM disponibilidad WHERE usuario_id = ?').get(usuario_id);
  const equipamiento = db.prepare('SELECT * FROM equipamiento WHERE usuario_id = ?').get(usuario_id);
  res.json({ objetivo, disponibilidad, equipamiento });
});

export default router;
