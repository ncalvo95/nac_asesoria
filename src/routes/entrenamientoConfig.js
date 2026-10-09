import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  obtenerConfigActiva,
  obtenerVersionConfig,
  listarHistorialVersiones,
  guardarNuevaVersionConfig,
  restaurarVersionConfig,
  restaurarValoresDeFabrica,
  resolverConfigEntrenamiento,
} from '../services/trainingConfigService.js';
import { validarConfigProgresion } from '../../shared/training/progressionConfig.js';
import {
  verificarPermisoOverride, obtenerOverrideCrudo, guardarOverride, borrarOverride,
  copiarParametrosEfectivos, resolverConMerge,
} from '../services/parametroOverrideService.js';

// Config global del "nucleo de progresion" de entrenamiento (admin) - mismo
// patron que nutricion.js: lectura abierta a cualquier logueado (el
// frontend la necesita para mostrar valores en vivo), escritura/historial
// exclusivos del admin.
const router = Router();
router.use(requireAuth);

router.get('/config', (req, res) => {
  const activa = obtenerConfigActiva();
  res.json({ id: activa.id, config: activa.config, createdAt: activa.createdAt, comment: activa.comment });
});

// ---------------------------------------------------------------------------
// Override por usuario (coach, para si mismo o para un alumno suyo; admin,
// para cualquiera) - ver parametro_override en schema.sql. A diferencia del
// global de arriba, esto NO es exclusivo del admin: lo usa el coach para
// personalizar sin tocar lo que ve el resto de sus alumnos.
// ---------------------------------------------------------------------------

router.get('/usuarios/:usuarioId/config', (req, res) => {
  const usuarioId = Number(req.params.usuarioId);
  try {
    verificarPermisoOverride(req.usuario, usuarioId);
  } catch (err) {
    return res.status(403).json({ error: err.message });
  }
  const override = obtenerOverrideCrudo(usuarioId, 'entrenamiento');
  res.json({
    efectivo: resolverConfigEntrenamiento(usuarioId),
    override: override?.config ?? null,
    personalizado: Boolean(override),
  });
});

router.put('/usuarios/:usuarioId/config', (req, res) => {
  const usuarioId = Number(req.params.usuarioId);
  try {
    verificarPermisoOverride(req.usuario, usuarioId);
  } catch (err) {
    return res.status(403).json({ error: err.message });
  }
  const { config } = req.body || {};
  if (!config || typeof config !== 'object') {
    return res.status(400).json({ error: 'config es obligatorio.' });
  }
  // El override puede ser parcial (solo lo que el coach decidio tocar) -
  // se valida el resultado MERGEADO con el global, nunca el parcial solo
  // (que naturalmente le faltan secciones enteras).
  const global = obtenerConfigActiva().config;
  const { valida, errores } = validarConfigProgresion(resolverConMerge(global, config));
  if (!valida) return res.status(400).json({ error: 'La configuración resultante no es válida.', errores });

  guardarOverride({ usuarioId, dominio: 'entrenamiento', config, updatedBy: req.usuario.id });
  res.json({ efectivo: resolverConfigEntrenamiento(usuarioId), override: config, personalizado: true });
});

router.delete('/usuarios/:usuarioId/config', (req, res) => {
  const usuarioId = Number(req.params.usuarioId);
  try {
    verificarPermisoOverride(req.usuario, usuarioId);
  } catch (err) {
    return res.status(403).json({ error: err.message });
  }
  borrarOverride(usuarioId, 'entrenamiento');
  res.json({ efectivo: resolverConfigEntrenamiento(usuarioId), override: null, personalizado: false });
});

// Copia el efectivo YA RESUELTO de usuarioOrigenId (puede ser el propio
// coach, u otro alumno suyo) como override EXPLICITO de :usuarioId - una
// foto en el momento, ver copiarParametrosEfectivos. Requiere permiso sobre
// los 2 usuarios (el origen tambien tiene que ser el propio coach o un
// alumno suyo - no se puede copiar "a ciegas" el de alguien que no se
// administra).
router.post('/usuarios/:usuarioId/config/copiar', (req, res) => {
  const usuarioId = Number(req.params.usuarioId);
  const { usuarioOrigenId } = req.body || {};
  if (!usuarioOrigenId) return res.status(400).json({ error: 'usuarioOrigenId es obligatorio.' });
  try {
    verificarPermisoOverride(req.usuario, usuarioId);
    verificarPermisoOverride(req.usuario, Number(usuarioOrigenId));
  } catch (err) {
    return res.status(403).json({ error: err.message });
  }
  const efectivoOrigen = resolverConfigEntrenamiento(Number(usuarioOrigenId));
  copiarParametrosEfectivos({ efectivoOrigen, usuarioDestinoId: usuarioId, dominio: 'entrenamiento', updatedBy: req.usuario.id });
  res.json({ efectivo: resolverConfigEntrenamiento(usuarioId), override: efectivoOrigen, personalizado: true });
});

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
