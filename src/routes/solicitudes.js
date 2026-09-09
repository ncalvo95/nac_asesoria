import { Router } from 'express';
import { puedeAccederAUsuario, requireAuth } from '../middleware/auth.js';
import {
  aplicarSolicitud, getSolicitudPorId, listarSolicitudesDeUsuario,
  listarSolicitudesPendientes, marcarSolicitud,
} from '../services/solicitudCambio.js';

const router = Router();
router.use(requireAuth);

function puedeResolver(actor, solicitud) {
  return actor.rol === 'admin' || solicitud.coach_id === actor.id;
}

// Pendientes de los clientes de este coach (o todas, si es admin).
router.get('/solicitudes', (req, res) => {
  if (!['admin', 'coach'].includes(req.usuario.rol)) {
    return res.status(403).json({ error: 'No autorizado.' });
  }
  res.json(listarSolicitudesPendientes(req.usuario));
});

router.post('/solicitudes/:id/aprobar', (req, res, next) => {
  const solicitud = getSolicitudPorId(req.params.id);
  if (!solicitud) return res.status(404).json({ error: 'Solicitud no encontrada.' });
  if (!puedeResolver(req.usuario, solicitud)) return res.status(403).json({ error: 'No autorizado.' });
  if (solicitud.estado !== 'pendiente') return res.status(409).json({ error: 'Esta solicitud ya fue resuelta.' });
  try {
    aplicarSolicitud(solicitud);
    marcarSolicitud(solicitud.id, 'aprobada', null);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

router.post('/solicitudes/:id/rechazar', (req, res) => {
  const solicitud = getSolicitudPorId(req.params.id);
  if (!solicitud) return res.status(404).json({ error: 'Solicitud no encontrada.' });
  if (!puedeResolver(req.usuario, solicitud)) return res.status(403).json({ error: 'No autorizado.' });
  if (solicitud.estado !== 'pendiente') return res.status(409).json({ error: 'Esta solicitud ya fue resuelta.' });
  marcarSolicitud(solicitud.id, 'rechazada', req.body?.nota || null);
  res.status(204).end();
});

// El propio usuario (o su coach/admin) ve el historial de sus solicitudes.
router.get('/usuarios/:usuarioId/solicitudes', (req, res) => {
  const usuarioId = Number(req.params.usuarioId);
  if (!puedeAccederAUsuario(req.usuario, usuarioId)) {
    return res.status(403).json({ error: 'No autorizado.' });
  }
  res.json(listarSolicitudesDeUsuario(usuarioId));
});

export default router;
