import { Router } from 'express';
import { requireAuth, requireRole, puedeAccederAUsuario } from '../middleware/auth.js';
import {
  obtenerConfigActiva,
  obtenerVersionConfig,
  listarHistorialVersiones,
  guardarNuevaVersionConfig,
  restaurarVersionConfig,
  restaurarValoresDeFabrica,
} from '../services/nutritionConfigService.js';
import {
  obtenerPlanActivo,
  listarPlanesArchivados,
  crearPlan,
  archivarPlanActivo,
  actualizarProgresoPlan,
} from '../services/nutritionService.js';
import { debeQuedarPendiente, crearSolicitudCambio } from '../services/solicitudCambio.js';
import { generarWorkbookNutricion } from '../services/excelGenerator.js';

const router = Router();
router.use(requireAuth);

// Solo lectura: cualquier usuario logueado la necesita para calcular en
// vivo (frontend).
router.get('/config', (req, res) => {
  const activa = obtenerConfigActiva();
  res.json({ id: activa.id, config: activa.config, createdAt: activa.createdAt, comment: activa.comment });
});

// ---- Plan de nutricion de un usuario (no exclusivo del admin: el propio
// usuario, su coach o el admin) ----
function checkAccesoUsuario(req, res) {
  const usuarioId = Number(req.params.usuarioId);
  if (!puedeAccederAUsuario(req.usuario, usuarioId)) {
    res.status(403).json({ error: 'No autorizado.' });
    return null;
  }
  return usuarioId;
}

router.get('/usuarios/:usuarioId/plan', (req, res) => {
  const usuarioId = checkAccesoUsuario(req, res);
  if (usuarioId === null) return;
  try {
    res.json(obtenerPlanActivo(usuarioId));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/usuarios/:usuarioId/planes', (req, res) => {
  const usuarioId = checkAccesoUsuario(req, res);
  if (usuarioId === null) return;
  res.json(listarPlanesArchivados(usuarioId));
});

router.get('/usuarios/:usuarioId/export.xlsx', async (req, res) => {
  const usuarioId = checkAccesoUsuario(req, res);
  if (usuarioId === null) return;
  try {
    const { workbook } = generarWorkbookNutricion(usuarioId);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="historial-nutricion.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Crear (o reemplazar) un plan es una decision de estrategia -como
// objetivo/disponibilidad/rutina-, asi que respeta el mismo toggle
// "que mi coach apruebe mis cambios" (debeQuedarPendiente en
// solicitudCambio.js): si esta activo, queda pendiente en vez de aplicarse
// directo. El seguimiento quincenal (PATCH /plan/progreso, mas abajo) NO
// pasa por aca a proposito - es reportar el peso real de hoy sobre un plan
// YA aprobado, no una estrategia nueva, mismo criterio que registrar una
// sesion de entrenamiento.
router.post('/usuarios/:usuarioId/plan', (req, res) => {
  const usuarioId = checkAccesoUsuario(req, res);
  if (usuarioId === null) return;
  if (debeQuedarPendiente(req.usuario, usuarioId)) {
    const s = crearSolicitudCambio({ usuario_id: usuarioId, coach_id: req.usuario.coach_id, tipo: 'nutricion_plan', payload: req.body || {} });
    return res.status(202).json({ pendiente: true, solicitud_id: s.id });
  }
  try {
    const plan = crearPlan(usuarioId, req.body || {}, req.usuario.id);
    res.status(201).json(plan);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Seguimiento quincenal del modo objetivo: re-basea el plan activo con el
// peso real de hoy (ver actualizarProgresoPlan).
router.patch('/usuarios/:usuarioId/plan/progreso', (req, res) => {
  const usuarioId = checkAccesoUsuario(req, res);
  if (usuarioId === null) return;
  const { pesoActualKg } = req.body || {};
  try {
    res.json(actualizarProgresoPlan(usuarioId, pesoActualKg));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/usuarios/:usuarioId/plan', (req, res) => {
  const usuarioId = checkAccesoUsuario(req, res);
  if (usuarioId === null) return;
  try {
    res.json(archivarPlanActivo(usuarioId));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Todo lo demas (historial, guardar, restaurar) es exclusivo del admin -
// "el admin... es el único que edita la configuración" (prompt original).
router.use(requireRole('admin'));

router.get('/config/historial', (req, res) => {
  res.json(listarHistorialVersiones());
});

router.get('/config/version/:id', (req, res) => {
  try {
    res.json(obtenerVersionConfig(Number(req.params.id)));
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

router.post('/config', (req, res) => {
  const { config, comment } = req.body || {};
  if (!config || typeof config !== 'object') {
    return res.status(400).json({ error: 'config es obligatorio.' });
  }
  try {
    const guardada = guardarNuevaVersionConfig({ config, createdBy: req.usuario.id, comment });
    res.json(guardada);
  } catch (err) {
    res.status(400).json({ error: err.message, errores: err.errores });
  }
});

router.post('/config/restaurar/:id', (req, res) => {
  const { comment } = req.body || {};
  try {
    const restaurada = restaurarVersionConfig(Number(req.params.id), { createdBy: req.usuario.id, comment });
    res.json(restaurada);
  } catch (err) {
    res.status(400).json({ error: err.message, errores: err.errores });
  }
});

router.post('/config/restaurar-fabrica', (req, res) => {
  const { comment } = req.body || {};
  const restaurada = restaurarValoresDeFabrica({ createdBy: req.usuario.id, comment });
  res.json(restaurada);
});

export default router;
