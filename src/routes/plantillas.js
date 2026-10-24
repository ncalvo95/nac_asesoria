import { Router } from 'express';
import db from '../db/index.js';
import { puedeAccederAUsuario, requireAuth, requireRole } from '../middleware/auth.js';
import { crearDesdeRutina, listar, obtener, actualizar, eliminar, aplicar, PlantillaError } from '../services/plantillaService.js';

// Plantillas de rutina: solo coach y admin (el alumno no las ve). Privadas de
// quien las crea; el admin puede ver y aplicar las de cualquiera.
const router = Router();
// Se aplica ruta por ruta (no con router.use): este router cuelga de /api y un
// router.use global le exigiria rol a cualquier /api que caiga hasta aca.
const soCoach = [requireAuth, requireRole('coach', 'admin')];

function conManejoDeErrores(fn) {
  return (req, res, next) => {
    try {
      fn(req, res);
    } catch (err) {
      if (err instanceof PlantillaError) return res.status(err.status).json({ error: err.message });
      if (/Falta completar|no esta|no está|ya no tiene/i.test(err.message)) return res.status(400).json({ error: err.message });
      next(err);
    }
  };
}

router.get('/plantillas', soCoach, (req, res) => res.json(listar(req.usuario.id)));

router.get('/plantillas/:id', soCoach, conManejoDeErrores((req, res) => res.json(obtener(req.usuario, Number(req.params.id)))));

// Guarda la estructura de una rutina existente (de un alumno propio o de uno
// mismo) como plantilla.
router.post('/plantillas', soCoach, conManejoDeErrores((req, res) => {
  const { rutina_id, nombre, descripcion } = req.body || {};
  const rutina = db.prepare('SELECT usuario_id FROM rutina WHERE id = ?').get(rutina_id);
  if (!rutina) return res.status(404).json({ error: 'Rutina no encontrada.' });
  if (!puedeAccederAUsuario(req.usuario, rutina.usuario_id)) return res.status(403).json({ error: 'No autorizado.' });
  res.status(201).json(crearDesdeRutina(req.usuario.id, rutina_id, { nombre, descripcion }));
}));

router.patch('/plantillas/:id', soCoach, conManejoDeErrores((req, res) => {
  res.json(actualizar(req.usuario, Number(req.params.id), req.body || {}));
}));

router.delete('/plantillas/:id', soCoach, conManejoDeErrores((req, res) => {
  eliminar(req.usuario, Number(req.params.id));
  res.json({ ok: true });
}));

// Crea una rutina nueva para el alumno con la estructura de la plantilla (la
// activa pasa a finalizada) y arranca en Semana 0 de testeo.
router.post('/usuarios/:usuarioId/rutina/plantilla', soCoach, conManejoDeErrores((req, res) => {
  const usuarioId = Number(req.params.usuarioId);
  if (!puedeAccederAUsuario(req.usuario, usuarioId)) return res.status(403).json({ error: 'No autorizado.' });
  const { plantilla_id, mapeo_dias } = req.body || {};
  res.status(201).json(aplicar(req.usuario, Number(plantilla_id), usuarioId, mapeo_dias));
}));

export default router;
