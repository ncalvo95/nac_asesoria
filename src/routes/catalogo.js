import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// activo=0 son musculos "legacy" (ej. "deltoides" a secas, separado en
// deltoides_lateral/anterior/posterior) que se dejan en la tabla por
// integridad referencial con rutinas/historial viejo, pero ya no se
// ofrecen para catalogar ejercicios nuevos ni armar rutinas nuevas.
router.get('/musculos', (req, res) => {
  res.json(db.prepare('SELECT id, nombre, region FROM musculo WHERE activo = 1 ORDER BY id').all());
});

router.get('/ejercicios', (req, res) => {
  const { musculo_id, incluir_inactivos } = req.query;
  const base = `
    SELECT e.id, e.nombre, e.tipo, e.activo, e.patron_movimiento, m.nombre AS musculo_nombre
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

const getUsoPersonalizado = db.prepare(`
  SELECT DISTINCT u.nombre, u.usuario
  FROM ejercicio_asignado ea
  JOIN dia_rutina dr ON dr.id = ea.dia_rutina_id
  JOIN rutina r ON r.id = dr.rutina_id
  JOIN usuarios u ON u.id = r.usuario_id
  WHERE ea.ejercicio_id = ?
`);

// Ejercicios "particulares" que un coach o cliente cargo a mano en algun
// dia, sin pasar por el catalogo global (ver crearEjercicioPersonalizado en
// rutinaService.js - patron_movimiento='personalizado' es la marca que deja).
// Se listan aca para que el admin decida si conviene sumarlos al catalogo
// de una vez (ver PATCH .../publicar abajo), en vez de que cada usuario los
// tenga que cargar sueltos por su cuenta cada vez.
router.get('/ejercicios-personalizados', requireRole('admin'), (req, res) => {
  const rows = db.prepare(`
    SELECT e.id, e.nombre, e.musculo_primario_id AS musculo_id, m.nombre AS musculo_nombre
    FROM ejercicio e JOIN musculo m ON m.id = e.musculo_primario_id
    WHERE e.patron_movimiento = 'personalizado' AND e.activo = 1
    ORDER BY e.id DESC
  `).all();
  res.json(rows.map((e) => ({ ...e, usado_por: getUsoPersonalizado.all(e.id) })));
});

// "Publica" un ejercicio particular al catalogo global completando los
// datos que le faltan (tipo/patron de movimiento real, equipamiento, etc.) -
// el id no cambia, asi que toda rutina que ya lo tenga asignado lo empieza a
// ver como un ejercicio de catalogo mas sin que haga falta tocar nada mas.
router.patch('/ejercicios/:id/publicar', requireRole('admin'), (req, res) => {
  const ejercicio = db.prepare('SELECT patron_movimiento FROM ejercicio WHERE id = ?').get(req.params.id);
  if (!ejercicio) return res.status(404).json({ error: 'Ejercicio no encontrado.' });
  if (ejercicio.patron_movimiento !== 'personalizado') {
    return res.status(400).json({ error: 'Este ejercicio ya es parte del catálogo.' });
  }
  const {
    nombre, musculo_id, tipo, patron_movimiento,
    equipamiento_requerido, es_compuesto_principal_fuerza, es_unilateral,
  } = req.body || {};
  if (!nombre?.trim() || !musculo_id || !TIPOS_VALIDOS.includes(tipo) || !patron_movimiento?.trim()) {
    return res.status(400).json({ error: 'nombre, musculo_id, tipo (compuesto/aislado) y patron_movimiento son obligatorios.' });
  }
  const musculo = db.prepare('SELECT id FROM musculo WHERE id = ?').get(musculo_id);
  if (!musculo) return res.status(400).json({ error: 'musculo_id invalido.' });

  db.prepare(`
    UPDATE ejercicio SET nombre = @nombre, musculo_primario_id = @musculo_id, tipo = @tipo,
      patron_movimiento = @patron_movimiento, equipamiento_requerido_json = @equipamiento_requerido_json,
      es_unilateral = @es_unilateral, es_compuesto_principal_fuerza = @es_compuesto_principal_fuerza
    WHERE id = @id
  `).run({
    id: req.params.id,
    nombre: nombre.trim(),
    musculo_id,
    tipo,
    patron_movimiento: patron_movimiento.trim(),
    equipamiento_requerido_json: JSON.stringify(Array.isArray(equipamiento_requerido) ? equipamiento_requerido : []),
    es_unilateral: es_unilateral ? 1 : 0,
    es_compuesto_principal_fuerza: es_compuesto_principal_fuerza ? 1 : 0,
  });
  res.json({ id: Number(req.params.id) });
});

export default router;
