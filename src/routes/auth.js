import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  comparePassword, cookieOptions, COOKIE_NAME, crearSesion, hashPassword,
  listarSesiones, revocarOtrasSesiones, revocarSesion, revocarSesionPorId,
} from '../services/auth.js';

const router = Router();

const PASSWORD_MIN = 6;
const PASSWORD_MAX = 64;
function passwordValida(password) {
  return typeof password === 'string' && password.length >= PASSWORD_MIN && password.length <= PASSWORD_MAX;
}

const getUsuarioPorEmail = db.prepare('SELECT * FROM usuarios WHERE email = ?');
const insertUsuario = db.prepare(`
  INSERT INTO usuarios (nombre, email, password_hash, rol, coach_id)
  VALUES (@nombre, @email, @password_hash, @rol, @coach_id)
`);

router.post('/login', async (req, res) => {
  const { email, password, remember } = req.body || {};
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

  const recordar = Boolean(remember);
  const { token } = crearSesion(usuario.id, { userAgent: req.get('user-agent'), recordar });
  res.cookie(COOKIE_NAME, token, cookieOptions(req, { recordar }));
  res.json({ id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol });
});

router.post('/logout', (req, res) => {
  const token = req.cookies?.[COOKIE_NAME];
  if (token) revocarSesion(token);
  res.clearCookie(COOKIE_NAME, { path: cookieOptions(req, {}).path });
  res.status(204).end();
});

router.get('/me', requireAuth, (req, res) => {
  const { sesion_id, ...usuario } = req.usuario;
  res.json(usuario);
});

// Sesiones activas del usuario logueado (para "cerrar esta sesion" /
// "cerrar todas las demas" desde otro dispositivo).
router.get('/sesiones', requireAuth, (req, res) => {
  const sesiones = listarSesiones(req.usuario.id).map((s) => ({
    ...s,
    es_actual: s.id === req.usuario.sesion_id,
  }));
  res.json(sesiones);
});

router.delete('/sesiones/:id', requireAuth, (req, res) => {
  const sesion = db.prepare('SELECT usuario_id FROM sesiones_auth WHERE id = ?').get(req.params.id);
  if (!sesion || sesion.usuario_id !== req.usuario.id) {
    return res.status(404).json({ error: 'Sesion no encontrada.' });
  }
  revocarSesionPorId(req.params.id);
  res.status(204).end();
});

router.post('/sesiones/revocar-otras', requireAuth, (req, res) => {
  revocarOtrasSesiones(req.usuario.id, req.usuario.sesion_id);
  res.status(204).end();
});

router.patch('/password', requireAuth, async (req, res) => {
  const { password_actual, password_nueva } = req.body || {};
  if (!password_actual || !passwordValida(password_nueva)) {
    return res.status(400).json({ error: `password_nueva debe tener entre ${PASSWORD_MIN} y ${PASSWORD_MAX} caracteres.` });
  }
  const usuario = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.usuario.id);
  const ok = await comparePassword(password_actual, usuario.password_hash);
  if (!ok) return res.status(401).json({ error: 'La contraseña actual no es correcta.' });

  const password_hash = await hashPassword(password_nueva);
  db.prepare('UPDATE usuarios SET password_hash = ? WHERE id = ?').run(password_hash, req.usuario.id);
  res.status(204).end();
});

// Alta de cuentas: el admin puede crear coaches o clientes; un coach solo
// puede crear clientes propios. No hay auto-registro publico.
router.post('/usuarios', requireAuth, requireRole('admin', 'coach'), async (req, res) => {
  const { nombre, email, password, rol } = req.body || {};
  if (!nombre || !email || !password || !rol) {
    return res.status(400).json({ error: 'Faltan campos obligatorios.' });
  }
  if (!passwordValida(password)) {
    return res.status(400).json({ error: `La contraseña debe tener entre ${PASSWORD_MIN} y ${PASSWORD_MAX} caracteres.` });
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

// Listado de cuentas: un coach ve solo sus clientes; el admin ve todo
// (opcionalmente filtrado por rol).
router.get('/usuarios', requireAuth, requireRole('admin', 'coach'), (req, res) => {
  const { rol } = req.query;
  let usuarios;
  if (req.usuario.rol === 'coach') {
    usuarios = db.prepare(
      "SELECT id, nombre, email, rol, created_at FROM usuarios WHERE coach_id = ? ORDER BY nombre"
    ).all(req.usuario.id);
  } else if (rol) {
    usuarios = db.prepare(
      'SELECT id, nombre, email, rol, coach_id, created_at FROM usuarios WHERE rol = ? ORDER BY nombre'
    ).all(rol);
  } else {
    usuarios = db.prepare(
      'SELECT id, nombre, email, rol, coach_id, created_at FROM usuarios ORDER BY rol, nombre'
    ).all();
  }

  const tieneRutina = db.prepare("SELECT 1 FROM rutina WHERE usuario_id = ? AND estado = 'activa'");
  res.json(usuarios.map((u) => ({ ...u, tiene_rutina_activa: Boolean(tieneRutina.get(u.id)) })));
});

export default router;
