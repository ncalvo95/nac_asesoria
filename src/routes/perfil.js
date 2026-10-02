import { Router } from 'express';
import db from '../db/index.js';
import { puedeAccederAUsuario, requireAuth } from '../middleware/auth.js';
import { TODOS_MUSCULOS } from '../services/routineBuilder.js';
import { crearSolicitudCambio, debeQuedarPendiente } from '../services/solicitudCambio.js';
import { crearEjercicioPersonalizado } from '../services/rutinaService.js';
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

// ---- Datos personales (sexo biologico, fecha de nacimiento, altura) ----
// Viven en la tabla usuarios (columnas ya existian en el schema original
// pero nunca se habian conectado a ninguna ruta). El motor de nutricion
// necesita sexo_biologico para TODO calculo -por eso es obligatorio aca-;
// fecha_nacimiento y altura_cm son opcionales, solo alimentan el
// Mifflin-St Jeor informativo del resultado del plan. Escritura directa,
// sin pasar por solicitud_cambio: son datos biometricos objetivos, no una
// decision de entrenamiento que el coach deba aprobar.
const updateDatosPersonales = db.prepare(`
  UPDATE usuarios SET sexo_biologico = @sexo_biologico, fecha_nacimiento = @fecha_nacimiento, altura_cm = @altura_cm
  WHERE id = @usuario_id
`);

router.put('/:usuarioId/datos-personales', (req, res) => {
  const usuario_id = checkAcceso(req, res);
  if (usuario_id === null) return;
  const { sexo_biologico, fecha_nacimiento, altura_cm } = req.body || {};
  if (!['masculino', 'femenino'].includes(sexo_biologico)) {
    return res.status(400).json({ error: 'sexo_biologico debe ser masculino o femenino.' });
  }
  if (altura_cm != null && !(Number(altura_cm) > 0)) {
    return res.status(400).json({ error: 'altura_cm debe ser un número mayor a 0.' });
  }
  updateDatosPersonales.run({
    usuario_id, sexo_biologico,
    fecha_nacimiento: fecha_nacimiento || null,
    altura_cm: altura_cm != null ? Number(altura_cm) : null,
  });
  res.json({ usuario_id, sexo_biologico, fecha_nacimiento: fecha_nacimiento || null, altura_cm: altura_cm ?? null });
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

  // "agregado_personalizado" antes solo guardaba nombre/musculo sueltos,
  // sin crear nada real - nunca entraba al pool de sustitucion pese a lo
  // que decia la pantalla. Ahora crea de una el mismo tipo de ejercicio
  // "particular" que ya se usa al cargarlo desde un dia (ver
  // crearEjercicioPersonalizado en rutinaService.js, misma marca
  // patron_movimiento='personalizado'), asi que aparece de entrada como
  // candidato para ese musculo (armarDia/sustituir/agregar ya leen
  // cualquier fila de "ejercicio" para el musculo, sin filtrar por esto).
  let ejercicioIdFinal = ejercicio_id || null;
  if (tipo === 'agregado_personalizado') {
    try {
      ejercicioIdFinal = crearEjercicioPersonalizado(nombre_personalizado, musculo_asignado_id).id;
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  const info = insertPreferencia.run({
    usuario_id,
    ejercicio_id: ejercicioIdFinal,
    tipo,
    nombre_personalizado: nombre_personalizado || null,
    musculo_asignado_id: musculo_asignado_id || null,
  });
  res.status(201).json({ id: info.lastInsertRowid, ejercicio_id: ejercicioIdFinal });
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

// ---- Pasos diarios ----
// Un valor por dia de calendario, sin importar si ese dia tuvo
// entrenamiento o fue de descanso - ver registro_pasos en schema.sql.
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

router.put('/:usuarioId/pasos/:fecha', (req, res) => {
  const usuario_id = checkAcceso(req, res);
  if (usuario_id === null) return;
  const { fecha } = req.params;
  if (!FECHA_RE.test(fecha)) {
    return res.status(400).json({ error: 'fecha invalida (formato YYYY-MM-DD).' });
  }
  const { pasos } = req.body || {};
  if (!Number.isInteger(pasos) || pasos < 0) {
    return res.status(400).json({ error: 'pasos debe ser un entero mayor o igual a 0.' });
  }
  db.prepare(`
    INSERT INTO registro_pasos (usuario_id, fecha, pasos) VALUES (?, ?, ?)
    ON CONFLICT(usuario_id, fecha) DO UPDATE SET pasos = excluded.pasos
  `).run(usuario_id, fecha, pasos);
  res.json({ fecha, pasos });
});

// Ultimos N dias (7 por defecto), mas recientes primero - pensado para un
// mini listado/edicion rapida en la UI, no un historico completo.
router.get('/:usuarioId/pasos', (req, res) => {
  const usuario_id = checkAcceso(req, res);
  if (usuario_id === null) return;
  const dias = Math.min(Math.max(Number(req.query.dias) || 7, 1), 90);
  const rows = db.prepare(`
    SELECT fecha, pasos FROM registro_pasos
    WHERE usuario_id = ? AND fecha >= date('now', ?)
    ORDER BY fecha DESC
  `).all(usuario_id, `-${dias} days`);
  res.json(rows);
});

// ---- Vista consolidada del perfil (para armar la rutina) ----
router.get('/:usuarioId/perfil', (req, res) => {
  const usuario_id = checkAcceso(req, res);
  if (usuario_id === null) return;
  const objetivo = db.prepare('SELECT * FROM objetivo WHERE usuario_id = ?').get(usuario_id);
  const disponibilidad = db.prepare('SELECT * FROM disponibilidad WHERE usuario_id = ?').get(usuario_id);
  const equipamiento = db.prepare('SELECT * FROM equipamiento WHERE usuario_id = ?').get(usuario_id);
  const datos_personales = db.prepare('SELECT sexo_biologico, fecha_nacimiento, altura_cm FROM usuarios WHERE id = ?').get(usuario_id);
  res.json({ objetivo, disponibilidad, equipamiento, datos_personales });
});

export default router;
