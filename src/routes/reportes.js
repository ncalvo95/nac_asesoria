import { Router } from 'express';
import db from '../db/index.js';
import { puedeAccederAUsuario, requireAuth } from '../middleware/auth.js';
import { repsEfectivas } from '../services/progressionEngine.js';

const router = Router();
router.use(requireAuth);

function checkAcceso(req, res, usuarioId) {
  if (!puedeAccederAUsuario(req.usuario, usuarioId)) {
    res.status(403).json({ error: 'No autorizado.' });
    return false;
  }
  return true;
}

const getEjerciciosRutina = db.prepare(`
  SELECT ea.id, e.nombre AS ejercicio_nombre, m.nombre AS musculo_nombre
  FROM ejercicio_asignado ea
  JOIN dia_rutina dr ON dr.id = ea.dia_rutina_id
  JOIN ejercicio e ON e.id = ea.ejercicio_id
  JOIN musculo m ON m.id = ea.musculo_objetivo_id
  WHERE dr.rutina_id = ?
`);
const getHistorialEjercicio = db.prepare(`
  SELECT mc.numero, pem.peso_prescrito, pem.piso_reps, pem.techo_reps, pem.mejoro
  FROM progreso_ejercicio_microciclo pem JOIN microciclo mc ON mc.id = pem.microciclo_id
  WHERE pem.ejercicio_asignado_id = ? ORDER BY mc.numero
`);
const getHistorialMusculo = db.prepare(`
  SELECT mc.numero, pmm.volumen_directo, pmm.volumen_indirecto, pmm.estancado
  FROM progreso_muscular_microciclo pmm
  JOIN microciclo mc ON mc.id = pmm.microciclo_id
  JOIN musculo m ON m.id = pmm.musculo_id
  WHERE pmm.usuario_id = ? AND m.nombre = ? ORDER BY mc.numero
`);
const getMicrociclosCerrados = db.prepare(
  "SELECT numero, fecha_inicio, fecha_fin FROM microciclo WHERE rutina_id = ? AND estado = 'cerrado' ORDER BY numero"
);

// Series reales cargadas (registro_serie), para recalcular reps efectivas
// (ver repsEfectivas en progressionEngine.js) por microciclo - a diferencia
// del resto del reporte, esto no sale de progreso_ejercicio_microciclo
// porque esa tabla guarda lo PRESCRIPTO, no lo que realmente se hizo.
const getSeriesEjercicio = db.prepare(`
  SELECT mc.numero, rs.reps, rs.rir
  FROM registro_serie rs
  JOIN registro_sesion rses ON rses.id = rs.registro_sesion_id
  JOIN microciclo mc ON mc.id = rses.microciclo_id
  WHERE rs.ejercicio_asignado_id = ?
`);
const getSeriesMusculo = db.prepare(`
  SELECT mc.numero, rs.reps, rs.rir
  FROM registro_serie rs
  JOIN registro_sesion rses ON rses.id = rs.registro_sesion_id
  JOIN microciclo mc ON mc.id = rses.microciclo_id
  JOIN ejercicio_asignado ea ON ea.id = rs.ejercicio_asignado_id
  JOIN musculo m ON m.id = ea.musculo_objetivo_id
  WHERE mc.rutina_id = ? AND m.nombre = ?
`);

// Suma repsEfectivas(reps, rir) de "series", agrupado por numero de
// microciclo -> Map<numero, total>.
function repsEfectivasPorMicrociclo(series) {
  const porNumero = new Map();
  for (const s of series) {
    const efectivas = repsEfectivas(s.reps, s.rir);
    if (efectivas == null) continue;
    porNumero.set(s.numero, (porNumero.get(s.numero) || 0) + efectivas);
  }
  return porNumero;
}

// Compara la evolucion de peso/reps por ejercicio y de volumen por musculo,
// desde el primer microciclo con datos hasta el mas reciente. Se genera a
// pedido (semestral o resumen liviano de mesociclo), no en un cron: no hay
// necesidad real de automatizar "cada 6 meses" para el volumen de uso de
// esta app.
function generarDatosReporte(usuarioId) {
  const rutina = db.prepare("SELECT * FROM rutina WHERE usuario_id = ? AND estado = 'activa'").get(usuarioId);
  if (!rutina) throw new Error('El usuario no tiene una rutina activa.');

  const ejercicios = getEjerciciosRutina.all(rutina.id);

  const porEjercicio = ejercicios
    .map((ej) => {
      const historial = getHistorialEjercicio.all(ej.id);
      if (historial.length === 0) return null;
      const primero = historial[0];
      const ultimo = historial[historial.length - 1];
      const repsEfectivasPorNumero = repsEfectivasPorMicrociclo(getSeriesEjercicio.all(ej.id));
      return {
        ejercicio_asignado_id: ej.id,
        ejercicio_nombre: ej.ejercicio_nombre,
        musculo_nombre: ej.musculo_nombre,
        peso_inicial: primero.peso_prescrito,
        peso_actual: ultimo.peso_prescrito,
        reps_piso_inicial: primero.piso_reps,
        reps_techo_actual: ultimo.techo_reps ?? ultimo.piso_reps,
        historial: historial.map((h) => ({
          microciclo: h.numero, peso: h.peso_prescrito, piso_reps: h.piso_reps, techo_reps: h.techo_reps,
          reps_efectivas: repsEfectivasPorNumero.get(h.numero) || 0,
        })),
      };
    })
    .filter(Boolean);

  const musculos = [...new Set(ejercicios.map((e) => e.musculo_nombre))];
  const porMusculo = musculos.map((m) => {
    const repsEfectivasPorNumero = repsEfectivasPorMicrociclo(getSeriesMusculo.all(rutina.id, m));
    return {
      musculo: m,
      historial: getHistorialMusculo.all(usuarioId, m).map((h) => ({
        ...h, reps_efectivas: repsEfectivasPorNumero.get(h.numero) || 0,
      })),
    };
  });

  const cerrados = getMicrociclosCerrados.all(rutina.id);
  const periodo = cerrados.length
    ? `Microciclo ${cerrados[0].numero} (${cerrados[0].fecha_inicio}) a microciclo ${cerrados[cerrados.length - 1].numero} (${cerrados[cerrados.length - 1].fecha_fin})`
    : 'Todavia no se cerro ningun microciclo';

  return { periodo, microciclos_cerrados: cerrados.length, porEjercicio, porMusculo };
}

router.post('/usuarios/:usuarioId/reportes', (req, res, next) => {
  const usuarioId = Number(req.params.usuarioId);
  if (!checkAcceso(req, res, usuarioId)) return;
  const { tipo } = req.body || {};
  if (!['semestral', 'mesociclo'].includes(tipo)) {
    return res.status(400).json({ error: 'tipo debe ser semestral o mesociclo.' });
  }
  try {
    const datos = generarDatosReporte(usuarioId);
    const info = db.prepare(
      'INSERT INTO reporte_progreso (usuario_id, periodo_cubierto, tipo, datos_json) VALUES (?, ?, ?, ?)'
    ).run(usuarioId, datos.periodo, tipo, JSON.stringify(datos));
    res.status(201).json({ id: info.lastInsertRowid, tipo, periodo_cubierto: datos.periodo, datos });
  } catch (err) {
    if (err.message.includes('no tiene una rutina')) return res.status(400).json({ error: err.message });
    next(err);
  }
});

router.get('/usuarios/:usuarioId/reportes', (req, res) => {
  const usuarioId = Number(req.params.usuarioId);
  if (!checkAcceso(req, res, usuarioId)) return;
  const rows = db.prepare(
    'SELECT id, fecha_generacion, periodo_cubierto, tipo FROM reporte_progreso WHERE usuario_id = ? ORDER BY fecha_generacion DESC'
  ).all(usuarioId);
  res.json(rows);
});

router.get('/usuarios/:usuarioId/reportes/:reporteId', (req, res) => {
  const usuarioId = Number(req.params.usuarioId);
  if (!checkAcceso(req, res, usuarioId)) return;
  const row = db.prepare('SELECT * FROM reporte_progreso WHERE id = ? AND usuario_id = ?').get(req.params.reporteId, usuarioId);
  if (!row) return res.status(404).json({ error: 'Reporte no encontrado.' });
  res.json({ ...row, datos: JSON.parse(row.datos_json) });
});

export default router;
