import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { obtenerConfigActiva } from '../services/nutritionConfigService.js';

const router = Router();
router.use(requireAuth);

// Solo lectura: cualquier usuario logueado la necesita para calcular en
// vivo (frontend) - escribirla queda para las rutas de admin de la Etapa 2
// (requireRole('admin'), ver prompt original: "el admin... es el único
// que edita la configuración").
router.get('/config', (req, res) => {
  const activa = obtenerConfigActiva();
  res.json({ id: activa.id, config: activa.config, createdAt: activa.createdAt, comment: activa.comment });
});

export default router;
