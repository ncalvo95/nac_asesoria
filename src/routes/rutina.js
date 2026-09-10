import { Router } from 'express';
import db from '../db/index.js';
import { puedeAccederAUsuario, requireAuth } from '../middleware/auth.js';
import {
  agregarEjercicioADia, agregarEjercicioPersonalizadoADia, ajustarSeriesManual, crearRutina,
  crearRutinaConSplit, crearRutinaManual, eliminarRutina, listarRutinas, obtenerRutinaActiva,
  quitarEjercicioAsignado, reactivarRutina, reordenarEjercicios, sustituirEjercicio, sustituirEjercicioPreTesteo,
} from '../services/rutinaService.js';
import { aplicarDeload, cerrarMicrociclo, registrarSemana0 } from '../services/progressionEngine.js';
import { generarWorkbookUsuario } from '../services/excelGenerator.js';
import { tagsDisponibles, TODOS_MUSCULOS } from '../services/routineBuilder.js';
import { crearSolicitudCambio, debeQuedarPendiente } from '../services/solicitudCambio.js';

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
  if (debeQuedarPendiente(req.usuario, usuarioId)) {
    const s = crearSolicitudCambio({ usuario_id: usuarioId, coach_id: req.usuario.coach_id, tipo: 'rutina_auto', payload: {} });
    return res.status(202).json({ pendiente: true, solicitud_id: s.id });
  }
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

// Historial de rutinas (activa + finalizadas) para "Mis rutinas".
router.get('/usuarios/:usuarioId/rutinas', (req, res) => {
  const usuarioId = Number(req.params.usuarioId);
  if (!checkAccesoUsuario(req, res, usuarioId)) return;
  res.json(listarRutinas(usuarioId));
});

router.post('/rutinas/:rutinaId/reactivar', (req, res, next) => {
  const rutina = getRutinaOr404(req, res);
  if (!rutina) return;
  try {
    reactivarRutina(rutina.id, rutina.usuario_id);
    res.json(obtenerRutinaActiva(rutina.usuario_id));
  } catch (err) {
    next(err);
  }
});

router.delete('/rutinas/:rutinaId', (req, res, next) => {
  const rutina = getRutinaOr404(req, res);
  if (!rutina) return;
  try {
    eliminarRutina(rutina.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

const DIAS_VALIDOS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];

// Alternativa a POST /usuarios/:usuarioId/rutina (auto-generada): el usuario
// arma su propia rutina eligiendo los ejercicios del catalogo dia por dia
// (ver GET /musculos y /ejercicios en catalogo.js), en vez de que el motor
// los elija por equipamiento/exclusiones.
router.post('/usuarios/:usuarioId/rutina/manual', (req, res, next) => {
  const usuarioId = Number(req.params.usuarioId);
  if (!checkAccesoUsuario(req, res, usuarioId)) return;

  const { dias } = req.body || {};
  if (!Array.isArray(dias) || dias.length < 2 || dias.length > 6) {
    return res.status(400).json({ error: 'dias debe tener entre 2 y 6 elementos.' });
  }
  for (const dia of dias) {
    if (!dia || !DIAS_VALIDOS.includes(dia.dia_semana)) {
      return res.status(400).json({ error: `dia_semana invalido: ${dia?.dia_semana}` });
    }
    if (!Array.isArray(dia.ejercicios) || dia.ejercicios.length === 0) {
      return res.status(400).json({ error: `El dia ${dia.dia_semana} necesita al menos un ejercicio.` });
    }
    if (new Set(dia.ejercicios).size !== dia.ejercicios.length) {
      return res.status(400).json({ error: `El dia ${dia.dia_semana} tiene un ejercicio repetido.` });
    }
  }

  if (debeQuedarPendiente(req.usuario, usuarioId)) {
    const s = crearSolicitudCambio({ usuario_id: usuarioId, coach_id: req.usuario.coach_id, tipo: 'rutina_manual', payload: { dias } });
    return res.status(202).json({ pendiente: true, solicitud_id: s.id });
  }

  try {
    const rutina = crearRutinaManual(usuarioId, { dias });
    res.status(201).json(rutina);
  } catch (err) {
    if (err.message.includes('objetivo') || err.message.includes('Ejercicio')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

// Alternativa a POST /usuarios/:usuarioId/rutina: el usuario elige que
// musculos va cada dia (el split), pero el motor sigue eligiendo los
// ejercicios adentro de cada uno (a diferencia de /rutina/manual, donde
// tambien elige los ejercicios). Requiere equipamiento (a diferencia de
// /rutina/manual) porque el motor filtra candidatos por el.
router.post('/usuarios/:usuarioId/rutina/split', (req, res, next) => {
  const usuarioId = Number(req.params.usuarioId);
  if (!checkAccesoUsuario(req, res, usuarioId)) return;

  const { dias } = req.body || {};
  if (!Array.isArray(dias) || dias.length < 2 || dias.length > 6) {
    return res.status(400).json({ error: 'dias debe tener entre 2 y 6 elementos.' });
  }
  const diasVistos = new Set();
  for (const dia of dias) {
    if (!dia || !DIAS_VALIDOS.includes(dia.dia_semana) || diasVistos.has(dia.dia_semana)) {
      return res.status(400).json({ error: `dia_semana invalido o repetido: ${dia?.dia_semana}` });
    }
    diasVistos.add(dia.dia_semana);
    if (!Array.isArray(dia.musculos) || dia.musculos.length === 0 || dia.musculos.some((m) => !TODOS_MUSCULOS.includes(m))) {
      return res.status(400).json({ error: `El dia ${dia.dia_semana} necesita al menos un musculo valido.` });
    }
    if (!Number.isFinite(dia.duracion_minutos) || dia.duracion_minutos <= 0) {
      return res.status(400).json({ error: `El dia ${dia.dia_semana} necesita duracion_minutos (numero mayor a 0).` });
    }
  }

  if (debeQuedarPendiente(req.usuario, usuarioId)) {
    const s = crearSolicitudCambio({ usuario_id: usuarioId, coach_id: req.usuario.coach_id, tipo: 'rutina_split', payload: { dias } });
    return res.status(202).json({ pendiente: true, solicitud_id: s.id });
  }

  try {
    const rutina = crearRutinaConSplit(usuarioId, { dias });
    res.status(201).json(rutina);
  } catch (err) {
    if (err.message.includes('objetivo') || err.message.includes('equipamiento')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
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

// Ajuste manual de series (+1/-1), sin esperar al cierre de microciclo.
router.patch('/ejercicios/:ejercicioAsignadoId/series', (req, res, next) => {
  const ea = getEjercicioAsignadoOr404(req, res);
  if (!ea) return;
  const { delta } = req.body || {};
  if (delta !== 1 && delta !== -1) return res.status(400).json({ error: 'delta debe ser 1 o -1.' });
  try {
    const out = ajustarSeriesManual(ea.id, delta);
    res.json(out);
  } catch (err) {
    if (err.message.includes('series')) return res.status(400).json({ error: err.message });
    next(err);
  }
});

// Ajuste manual del peso base (el que se precarga en la proxima sesion),
// independiente del modo lineal forzado y sin esperar al cierre de
// microciclo - el usuario/coach puede cambiarlo cuando quiera.
router.patch('/ejercicios/:ejercicioAsignadoId/peso', (req, res) => {
  const ea = getEjercicioAsignadoOr404(req, res);
  if (!ea) return;
  const { peso } = req.body || {};
  if (typeof peso !== 'number' || !Number.isFinite(peso) || peso <= 0) {
    return res.status(400).json({ error: 'peso debe ser un numero mayor a 0.' });
  }
  db.prepare('UPDATE ejercicio_asignado SET peso_actual = ? WHERE id = ?').run(peso, ea.id);
  res.json({ id: ea.id, peso_actual: peso });
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
  // Excluye tambien los ejercicios que ya estan usados en OTRO slot del
  // mismo dia (puede haber mas de un ejercicio por musculo desde que
  // armarRutina reparte el tiempo disponible - sin esto, sustituir podia
  // terminar repitiendo el mismo ejercicio dos veces en el mismo dia).
  const usadosEnElDia = db.prepare(`
    SELECT ejercicio_id FROM ejercicio_asignado WHERE dia_rutina_id = ? AND id != ?
  `).all(ea.dia_rutina_id, ea.id).map((r) => r.ejercicio_id);

  const candidatos = db.prepare(`
    SELECT id, nombre, tipo, equipamiento_requerido_json FROM ejercicio
    WHERE musculo_primario_id = ? AND activo = 1 AND id != ?
  `).all(ea.musculo_objetivo_id, ea.ejercicio_id).filter((c) => {
    if (usadosEnElDia.includes(c.id)) return false;
    const requeridos = JSON.parse(c.equipamiento_requerido_json);
    return requeridos.every((tag) => tags.has(tag));
  });
  res.json(candidatos.map(({ equipamiento_requerido_json, ...c }) => c));
});

router.post('/ejercicios/:ejercicioAsignadoId/sustituir', (req, res, next) => {
  const ea = getEjercicioAsignadoOr404(req, res);
  if (!ea) return;
  const { nuevo_ejercicio_id, nombre_personalizado, peso, reps_serie1, reps_serie2 } = req.body || {};
  if ((!nuevo_ejercicio_id && !nombre_personalizado) || peso == null || reps_serie1 == null || reps_serie2 == null) {
    return res.status(400).json({ error: '(nuevo_ejercicio_id o nombre_personalizado), peso, reps_serie1 y reps_serie2 son obligatorios.' });
  }
  try {
    const out = sustituirEjercicio({
      ejercicioAsignadoId: ea.id, usuarioId: ea.usuario_id, nuevoEjercicioId: nuevo_ejercicio_id,
      nombrePersonalizado: nombre_personalizado, peso, repsSerie1: reps_serie1, repsSerie2: reps_serie2,
    });
    res.json(out);
  } catch (err) {
    if (err.message.includes('musculo') || err.message.includes('equipamiento') || err.message.includes('microciclo') || err.message.includes('nombre')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

// Version simple de sustituir, solo utilizable mientras la semana 0 sigue
// en curso (todavia no se cargo peso/reps para el slot) - el usuario carga
// los datos de testeo del ejercicio nuevo directo en el propio formulario.
router.post('/ejercicios/:ejercicioAsignadoId/sustituir-pre-testeo', (req, res, next) => {
  const ea = getEjercicioAsignadoOr404(req, res);
  if (!ea) return;
  const { nuevo_ejercicio_id, nombre_personalizado } = req.body || {};
  if (!nuevo_ejercicio_id && !nombre_personalizado) {
    return res.status(400).json({ error: 'nuevo_ejercicio_id o nombre_personalizado es obligatorio.' });
  }
  try {
    const out = sustituirEjercicioPreTesteo({
      ejercicioAsignadoId: ea.id, usuarioId: ea.usuario_id, nuevoEjercicioId: nuevo_ejercicio_id, nombrePersonalizado: nombre_personalizado,
    });
    res.json(out);
  } catch (err) {
    if (err.message.includes('musculo') || err.message.includes('equipamiento') || err.message.includes('semana 0') || err.message.includes('nombre')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

function getDiaOr404(req, res) {
  const dia = db.prepare(`
    SELECT dr.*, r.usuario_id FROM dia_rutina dr JOIN rutina r ON r.id = dr.rutina_id WHERE dr.id = ?
  `).get(req.params.diaRutinaId);
  if (!dia) {
    res.status(404).json({ error: 'Dia no encontrado.' });
    return null;
  }
  if (!checkAccesoUsuario(req, res, dia.usuario_id)) return null;
  return dia;
}

// Candidatos para AGREGAR (no sustituir) un ejercicio extra a un musculo que
// ya esta presente ese dia - mismo filtro de equipamiento/duplicados que
// sustituir, pero sin partir de un ejercicio_asignado existente.
router.get('/dias/:diaRutinaId/musculos/:musculoId/candidatos', (req, res) => {
  const dia = getDiaOr404(req, res);
  if (!dia) return;
  const musculoId = Number(req.params.musculoId);
  const musculosDelDia = JSON.parse(dia.musculos_trabajados_json);
  const musculo = db.prepare('SELECT nombre FROM musculo WHERE id = ?').get(musculoId);
  if (!musculo || !musculosDelDia.includes(musculo.nombre)) {
    return res.status(400).json({ error: 'Ese musculo no esta asignado a este dia.' });
  }

  const equipamiento = db.prepare('SELECT * FROM equipamiento WHERE usuario_id = ?').get(dia.usuario_id);
  const tags = tagsDisponibles({
    tipo: equipamiento.tipo,
    checklist: JSON.parse(equipamiento.checklist_json),
    musculo: musculo.nombre,
    musculosUbicacion: JSON.parse(equipamiento.musculos_ubicacion_json || '{}'),
  });
  const usadosEnElDia = db.prepare('SELECT ejercicio_id FROM ejercicio_asignado WHERE dia_rutina_id = ?')
    .all(dia.id).map((r) => r.ejercicio_id);

  const candidatos = db.prepare(`
    SELECT id, nombre, tipo, equipamiento_requerido_json FROM ejercicio
    WHERE musculo_primario_id = ? AND activo = 1
  `).all(musculoId).filter((c) => {
    if (usadosEnElDia.includes(c.id)) return false;
    const requeridos = JSON.parse(c.equipamiento_requerido_json);
    return requeridos.every((tag) => tags.has(tag));
  });
  res.json(candidatos.map(({ equipamiento_requerido_json, ...c }) => c));
});

router.post('/dias/:diaRutinaId/ejercicios', (req, res, next) => {
  const dia = getDiaOr404(req, res);
  if (!dia) return;
  const { musculo_id, ejercicio_id, nombre_personalizado } = req.body || {};
  if (!musculo_id || (!ejercicio_id && !nombre_personalizado)) {
    return res.status(400).json({ error: 'musculo_id y (ejercicio_id o nombre_personalizado) son obligatorios.' });
  }
  try {
    const out = ejercicio_id
      ? agregarEjercicioADia({ diaRutinaId: dia.id, usuarioId: dia.usuario_id, musculoId: musculo_id, ejercicioId: ejercicio_id })
      : agregarEjercicioPersonalizadoADia({ diaRutinaId: dia.id, usuarioId: dia.usuario_id, musculoId: musculo_id, nombre: nombre_personalizado });
    res.status(201).json(out);
  } catch (err) {
    if (err.message.includes('musculo') || err.message.includes('equipamiento') || err.message.includes('ya esta') || err.message.includes('nombre')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

router.delete('/ejercicios-asignados/:ejercicioAsignadoId', (req, res, next) => {
  const ea = getEjercicioAsignadoOr404(req, res);
  if (!ea) return;
  try {
    quitarEjercicioAsignado(ea.id);
    res.status(204).end();
  } catch (err) {
    if (err.message.includes('top') || err.message.includes('series registradas')) {
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

const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// Solo se puede mover mientras la semana 0 sigue en curso - una vez que
// arranca el microciclo 1, cambiar la fecha retroactivamente desincroniza
// el calendario de cierres (+14 dias, ver progressionEngine.js).
router.patch('/rutinas/:rutinaId/fecha-inicio', (req, res) => {
  const rutina = getRutinaOr404(req, res);
  if (!rutina) return;
  const { fecha_inicio } = req.body || {};
  if (!fecha_inicio || !FECHA_REGEX.test(fecha_inicio)) {
    return res.status(400).json({ error: 'fecha_inicio debe tener formato YYYY-MM-DD.' });
  }
  const microciclo0 = db.prepare("SELECT id FROM microciclo WHERE rutina_id = ? AND numero = 0 AND estado = 'en_curso'").get(rutina.id);
  if (!microciclo0) {
    return res.status(400).json({ error: 'Solo se puede cambiar la fecha de inicio mientras la semana 0 sigue en curso.' });
  }
  db.prepare('UPDATE rutina SET fecha_inicio = ? WHERE id = ?').run(fecha_inicio, rutina.id);
  db.prepare('UPDATE microciclo SET fecha_inicio = ? WHERE id = ?').run(fecha_inicio, microciclo0.id);
  res.json({ rutina_id: rutina.id, fecha_inicio });
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
