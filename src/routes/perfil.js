import { Router } from 'express';
import db from '../db/index.js';
import { puedeAccederAUsuario, requireAuth } from '../middleware/auth.js';
import { TODOS_MUSCULOS } from '../services/routineBuilder.js';
import { crearSolicitudCambio, debeQuedarPendiente } from '../services/solicitudCambio.js';
import { aplicarDisponibilidad, aplicarEquipamiento, aplicarObjetivo } from '../services/perfilService.js';

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
  const payload = { tipo, sub_objetivo, deporte: deporte || null };
  if (debeQuedarPendiente(req.usuario, usuario_id)) {
    const s = crearSolicitudCambio({ usuario_id, coach_id: req.usuario.coach_id, tipo: 'objetivo', payload });
    return res.status(202).json({ pendiente: true, solicitud_id: s.id });
  }
  aplicarObjetivo(usuario_id, payload);
  res.json({ usuario_id, ...payload });
});

// ---- Disponibilidad ----
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
  const payload = { dias_especificos, duracion_sesion };
  if (debeQuedarPendiente(req.usuario, usuario_id)) {
    const s = crearSolicitudCambio({ usuario_id, coach_id: req.usuario.coach_id, tipo: 'disponibilidad', payload });
    return res.status(202).json({ pendiente: true, solicitud_id: s.id });
  }
  aplicarDisponibilidad(usuario_id, payload);
  res.json({ usuario_id, ...payload });
});

// ---- Equipamiento ----
router.put('/:usuarioId/equipamiento', (req, res) => {
  const usuario_id = checkAcceso(req, res);
  if (usuario_id === null) return;
  const { tipo, checklist, musculos_ubicacion } = req.body || {};
  if (!['gimnasio', 'casa', 'mixto'].includes(tipo)) {
    return res.status(400).json({ error: 'tipo debe ser gimnasio, casa o mixto.' });
  }
  // No obligatorio: el musculo que no se especifica cae en "gimnasio" por
  // default (ver routineBuilder.tagsDisponibles). Solo tiene efecto con
  // tipo "mixto", pero se valida/guarda igual para no perderlo si el
  // usuario vuelve a "mixto" mas adelante.
  const musculosUbicacion = musculos_ubicacion && typeof musculos_ubicacion === 'object' ? musculos_ubicacion : {};
  for (const [musculo, ubicacion] of Object.entries(musculosUbicacion)) {
    if (!TODOS_MUSCULOS.includes(musculo) || !['gimnasio', 'casa'].includes(ubicacion)) {
      return res.status(400).json({ error: `musculos_ubicacion invalido en "${musculo}": debe mapear un musculo valido a gimnasio o casa.` });
    }
  }
  const payload = { tipo, checklist: checklist || [], musculos_ubicacion: musculosUbicacion };
  if (debeQuedarPendiente(req.usuario, usuario_id)) {
    const s = crearSolicitudCambio({ usuario_id, coach_id: req.usuario.coach_id, tipo: 'equipamiento', payload });
    return res.status(202).json({ pendiente: true, solicitud_id: s.id });
  }
  aplicarEquipamiento(usuario_id, payload);
  res.json({ usuario_id, ...payload });
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

// ---- Aprobacion del coach ----
// Solo tiene efecto real si el usuario es cliente y tiene coach_id asignado
// (ver debeQuedarPendiente en solicitudCambio.js) - se puede prender/apagar
// igual aunque todavia no tenga coach, por si lo consigue despues.
router.patch('/:usuarioId/aprobacion-coach', (req, res) => {
  const usuario_id = checkAcceso(req, res);
  if (usuario_id === null) return;
  const { activo } = req.body || {};
  if (typeof activo !== 'boolean') return res.status(400).json({ error: 'activo debe ser boolean.' });
  db.prepare('UPDATE usuarios SET requiere_aprobacion_coach = ? WHERE id = ?').run(activo ? 1 : 0, usuario_id);
  res.json({ usuario_id, requiere_aprobacion_coach: activo });
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
