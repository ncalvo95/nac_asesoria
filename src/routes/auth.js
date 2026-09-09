import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  comparePassword, cookieOptions, COOKIE_NAME, crearSesion, hashPassword,
  listarSesiones, PASSWORD_MAX, PASSWORD_MIN, passwordValida,
  revocarOtrasSesiones, revocarSesion, revocarSesionPorId, usuarioValido,
} from '../services/auth.js';
import {
  claimInvite, createInvitePlaceholder, listarInvitesPendientes, validateInviteCode,
} from '../services/invites.js';

const router = Router();

const getUsuarioPorNombreUsuario = db.prepare('SELECT * FROM usuarios WHERE usuario = ?');
const insertUsuario = db.prepare(`
  INSERT INTO usuarios (nombre, usuario, password_hash, rol, coach_id)
  VALUES (@nombre, @usuario, @password_hash, @rol, @coach_id)
`);

router.post('/login', async (req, res) => {
  const { usuario: nombreUsuario, password, remember } = req.body || {};
  if (!nombreUsuario || !password) {
    return res.status(400).json({ error: 'Falta usuario o password.' });
  }

  const usuario = getUsuarioPorNombreUsuario.get(nombreUsuario);
  if (!usuario || !usuario.activo || usuario.invite_code) {
    return res.status(401).json({ error: 'Credenciales invalidas.' });
  }

  const ok = await comparePassword(password, usuario.password_hash);
  if (!ok) {
    return res.status(401).json({ error: 'Credenciales invalidas.' });
  }

  const recordar = Boolean(remember);
  const { token } = crearSesion(usuario.id, { userAgent: req.get('user-agent'), recordar });
  res.cookie(COOKIE_NAME, token, cookieOptions(req, { recordar }));
  res.json({ id: usuario.id, nombre: usuario.nombre, usuario: usuario.usuario, rol: usuario.rol });
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
  const { nombre, usuario, password, rol } = req.body || {};
  if (!nombre || !usuario || !password || !rol) {
    return res.status(400).json({ error: 'Faltan campos obligatorios.' });
  }
  if (!usuarioValido(usuario)) {
    return res.status(400).json({ error: 'El usuario debe tener entre 4 y 10 caracteres: letras, numeros, puntos, guiones o guion bajo.' });
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
  if (getUsuarioPorNombreUsuario.get(usuario)) {
    return res.status(409).json({ error: 'Ya existe una cuenta con ese usuario.' });
  }

  const password_hash = await hashPassword(password);
  const coach_id = rol === 'cliente' ? (req.usuario.rol === 'coach' ? req.usuario.id : req.body.coach_id ?? null) : null;

  const info = insertUsuario.run({ nombre, usuario, password_hash, rol, coach_id });
  res.status(201).json({ id: info.lastInsertRowid, nombre, usuario, rol, coach_id });
});

// Listado de cuentas: un coach ve solo sus clientes; el admin ve todo
// (opcionalmente filtrado por rol).
router.get('/usuarios', requireAuth, requireRole('admin', 'coach'), (req, res) => {
  const { rol } = req.query;
  let usuarios;
  if (req.usuario.rol === 'coach') {
    usuarios = db.prepare(
      "SELECT id, nombre, usuario, rol, created_at FROM usuarios WHERE coach_id = ? ORDER BY nombre"
    ).all(req.usuario.id);
  } else if (rol) {
    usuarios = db.prepare(
      'SELECT id, nombre, usuario, rol, coach_id, created_at FROM usuarios WHERE rol = ? ORDER BY nombre'
    ).all(rol);
  } else {
    usuarios = db.prepare(
      'SELECT id, nombre, usuario, rol, coach_id, created_at FROM usuarios ORDER BY rol, nombre'
    ).all();
  }

  const tieneRutina = db.prepare("SELECT 1 FROM rutina WHERE usuario_id = ? AND estado = 'activa'");
  res.json(usuarios.map((u) => ({ ...u, tiene_rutina_activa: Boolean(tieneRutina.get(u.id)) })));
});

// ---- Invitaciones ----
// El admin puede invitar coach o cliente (sin coach fijo, salvo que elija
// uno); un coach solo invita clientes, siempre linkeados a si mismo.
router.post('/invites', requireAuth, requireRole('admin', 'coach'), async (req, res, next) => {
  const { rol, coach_id } = req.body || {};
  if (!['coach', 'cliente'].includes(rol)) {
    return res.status(400).json({ error: 'rol debe ser coach o cliente.' });
  }
  if (req.usuario.rol === 'coach' && rol !== 'cliente') {
    return res.status(403).json({ error: 'Un coach solo puede invitar cuentas de cliente.' });
  }
  try {
    const coachIdInvite = req.usuario.rol === 'coach' ? req.usuario.id : (rol === 'cliente' ? coach_id ?? null : null);
    const invite = await createInvitePlaceholder({ rol, coach_id: coachIdInvite });
    res.status(201).json(invite);
  } catch (err) {
    next(err);
  }
});

// Invitaciones sin reclamar todavia (para volver a copiar el codigo).
router.get('/invites', requireAuth, requireRole('admin', 'coach'), (req, res) => {
  res.json(listarInvitesPendientes(req.usuario));
});

// ---- Rutas publicas para reclamar una invitacion (sin cuenta todavia) ----
router.get('/invite/:code', (req, res) => {
  const info = validateInviteCode(req.params.code);
  if (!info) return res.status(404).json({ error: 'Codigo de invitacion invalido o ya usado.' });
  res.json(info);
});

router.get('/coaches-disponibles', (req, res) => {
  res.json(db.prepare("SELECT id, nombre FROM usuarios WHERE rol = 'coach' AND activo = 1 ORDER BY nombre").all());
});

router.post('/claim-invite', async (req, res, next) => {
  const { code, nombre, usuario, password, coach_id } = req.body || {};
  if (!code) return res.status(400).json({ error: 'Falta el codigo de invitacion.' });
  if (!nombre || !nombre.trim()) return res.status(400).json({ error: 'Falta el nombre.' });
  if (!usuarioValido(usuario)) {
    return res.status(400).json({ error: 'El usuario debe tener entre 4 y 10 caracteres: letras, numeros, puntos, guiones o guion bajo.' });
  }
  if (!passwordValida(password)) {
    return res.status(400).json({ error: `La contraseña debe tener entre ${PASSWORD_MIN} y ${PASSWORD_MAX} caracteres.` });
  }
  try {
    const cuenta = await claimInvite({ code, nombre, usuario, password, coach_id });
    const { token } = crearSesion(cuenta.id, { userAgent: req.get('user-agent'), recordar: false });
    res.cookie(COOKIE_NAME, token, cookieOptions(req, { recordar: false }));
    res.status(201).json({ id: cuenta.id, nombre: cuenta.nombre, usuario: cuenta.usuario, rol: cuenta.rol });
  } catch (err) {
    if (err.code === 'INVALID_INVITE') return res.status(404).json({ error: err.message });
    if (err.code === 'USUARIO_TOMADO') return res.status(409).json({ error: err.message });
    if (err.code === 'COACH_INVALIDO') return res.status(400).json({ error: err.message });
    next(err);
  }
});

export default router;
