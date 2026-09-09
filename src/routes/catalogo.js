import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/musculos', (req, res) => {
  res.json(db.prepare('SELECT id, nombre, region FROM musculo ORDER BY id').all());
});

router.get('/ejercicios', (req, res) => {
  const { musculo_id } = req.query;
  const base = `
    SELECT e.id, e.nombre, e.tipo, m.nombre AS musculo_nombre
    FROM ejercicio e JOIN musculo m ON m.id = e.musculo_primario_id
    WHERE e.activo = 1
  `;
  const rows = musculo_id
    ? db.prepare(`${base} AND e.musculo_primario_id = ? ORDER BY m.id, e.nombre`).all(musculo_id)
    : db.prepare(`${base} ORDER BY m.id, e.nombre`).all();
  res.json(rows);
});

export default router;
