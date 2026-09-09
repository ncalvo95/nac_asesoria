import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/musculos', (req, res) => {
  res.json(db.prepare('SELECT id, nombre, region FROM musculo ORDER BY id').all());
});

router.get('/ejercicios', (req, res) => {
  const { musculo_id, incluir_inactivos } = req.query;
  const base = `
    SELECT e.id, e.nombre, e.tipo, e.activo, m.nombre AS musculo_nombre
    FROM ejercicio e JOIN musculo m ON m.id = e.musculo_primario_id
    WHERE ${incluir_inactivos ? '1=1' : 'e.activo = 1'}
  `;
  const rows = musculo_id
    ? db.prepare(`${base} AND e.musculo_primario_id = ? ORDER BY m.id, e.nombre`).all(musculo_id)
    : db.prepare(`${base} ORDER BY m.id, e.nombre`).all();
  res.json(rows);
});

const TIPOS_VALIDOS = ['compuesto', 'aislado'];

// Agrega un ejercicio al catalogo global - lo ven y lo pueden usar todos los
// usuarios (queda disponible para generar/sustituir/agregar como cualquier
// otro, ya que las queries de armarRutina/candidatos leen directo de esta
// tabla). Solo el admin puede tocar el catalogo global.
router.post('/ejercicios', requireRole('admin'), (req, res) => {
  const {
    nombre, musculo_id, tipo, patron_movimiento,
    equipamiento_requerido, es_compuesto_principal_fuerza, es_unilateral,
  } = req.body || {};
  if (!nombre?.trim() || !musculo_id || !TIPOS_VALIDOS.includes(tipo) || !patron_movimiento?.trim()) {
    return res.status(400).json({ error: 'nombre, musculo_id, tipo (compuesto/aislado) y patron_movimiento son obligatorios.' });
  }
  const musculo = db.prepare('SELECT id FROM musculo WHERE id = ?').get(musculo_id);
  if (!musculo) return res.status(400).json({ error: 'musculo_id invalido.' });

  const info = db.prepare(`
    INSERT INTO ejercicio (nombre, musculo_primario_id, tipo, patron_movimiento, equipamiento_requerido_json, es_unilateral, es_compuesto_principal_fuerza)
    VALUES (@nombre, @musculo_id, @tipo, @patron_movimiento, @equipamiento_requerido_json, @es_unilateral, @es_compuesto_principal_fuerza)
  `).run({
    nombre: nombre.trim(),
    musculo_id,
    tipo,
    patron_movimiento: patron_movimiento.trim(),
    equipamiento_requerido_json: JSON.stringify(Array.isArray(equipamiento_requerido) ? equipamiento_requerido : []),
    es_unilateral: es_unilateral ? 1 : 0,
    es_compuesto_principal_fuerza: es_compuesto_principal_fuerza ? 1 : 0,
  });
  res.status(201).json({ id: info.lastInsertRowid });
});

// Desactivar/reactivar (nunca se borra del todo, para no romper referencias
// de rutinas ya generadas que lo usan).
router.patch('/ejercicios/:id/activo', requireRole('admin'), (req, res) => {
  const { activo } = req.body || {};
  if (typeof activo !== 'boolean') return res.status(400).json({ error: 'activo debe ser boolean.' });
  const info = db.prepare('UPDATE ejercicio SET activo = ? WHERE id = ?').run(activo ? 1 : 0, req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Ejercicio no encontrado.' });
  res.json({ id: Number(req.params.id), activo });
});

export default router;
