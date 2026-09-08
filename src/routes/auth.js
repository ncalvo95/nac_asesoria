import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { comparePassword, cookieOptions, COOKIE_NAME, hashPassword, signToken } from '../services/auth.js';

const router = Router();

const getUsuarioPorEmail = db.prepare('SELECT * FROM usuarios WHERE email = ?');
const insertUsuario = db.prepare(`
  INSERT INTO usuarios (nombre, email, password_hash, rol, coach_id)
  VALUES (@nombre, @email, @password_hash, @rol, @coach_id)
`);

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Falta email o password.' });
  }

  const usuario = getUsuarioPorEmail.get(email);
  if (!usuario || !usuario.activo) {
    return res.status(401).json({ error: 'Credenciales invalidas.' });
  }

  const ok = await comparePassword(password, usuario.password_hash);
  if (!ok) {
    return res.status(401).json({ error: 'Credenciales invalidas.' });
  }

  const token = signToken(usuario);
  res.cookie(COOKIE_NAME, token, cookieOptions());
  res.json({ id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol });
});

router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.status(204).end();
});

router.get('/me', requireAuth, (req, res) => {
  res.json(req.usuario);
});

// Alta de cuentas: el admin puede crear coaches o clientes; un coach solo
// puede crear clientes propios. No hay auto-registro publico.
router.post('/usuarios', requireAuth, requireRole('admin', 'coach'), async (req, res) => {
  const { nombre, email, password, rol } = req.body || {};
  if (!nombre || !email || !password || !rol) {
    return res.status(400).json({ error: 'Faltan campos obligatorios.' });
  }
  if (!['coach', 'cliente'].includes(rol)) {
    return res.status(400).json({ error: 'Rol invalido.' });
  }
  if (req.usuario.rol === 'coach' && rol !== 'cliente') {
    return res.status(403).json({ error: 'Un coach solo puede crear cuentas de cliente.' });
  }
  if (getUsuarioPorEmail.get(email)) {
    return res.status(409).json({ error: 'Ya existe una cuenta con ese email.' });
  }

  const password_hash = await hashPassword(password);
  const coach_id = rol === 'cliente' ? (req.usuario.rol === 'coach' ? req.usuario.id : req.body.coach_id ?? null) : null;

  const info = insertUsuario.run({ nombre, email, password_hash, rol, coach_id });
  res.status(201).json({ id: info.lastInsertRowid, nombre, email, rol, coach_id });
});

export default router;
