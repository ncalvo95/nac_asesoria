import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { crearFeedback, listarFeedback, listarFeedbackDeUsuario, marcarFeedbackRevisado } from '../services/feedbackService.js';

const router = Router();
router.use(requireAuth);

// Cualquier usuario logueado (cliente, coach o admin) puede mandar feedback.
router.post('/feedback', (req, res) => {
  try {
    const { tipo, mensaje } = req.body || {};
    const id = crearFeedback(req.usuario.id, tipo, mensaje);
    res.status(201).json({ id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/feedback', requireRole('admin'), (req, res) => {
  res.json(listarFeedback());
});

router.patch('/feedback/:id/revisar', requireRole('admin'), (req, res) => {
  try {
    marcarFeedbackRevisado(req.params.id, req.body?.nota_admin);
    res.status(204).end();
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

router.get('/usuarios/:usuarioId/feedback', (req, res) => {
  const usuarioId = Number(req.params.usuarioId);
  if (req.usuario.id !== usuarioId && req.usuario.rol !== 'admin') {
    return res.status(403).json({ error: 'No autorizado.' });
  }
  res.json(listarFeedbackDeUsuario(usuarioId));
});

export default router;
