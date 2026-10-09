import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  obtenerConfigActiva,
  obtenerVersionConfig,
  listarHistorialVersiones,
  guardarNuevaVersionConfig,
  restaurarVersionConfig,
  restaurarValoresDeFabrica,
} from '../services/trainingConfigService.js';

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
