import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import db from '../db/index.js';
import { MOUNT_PATH } from '../base-path.js';

const BCRYPT_COST = 10;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24hs sin "recordarme"
const SESSION_TTL_REMEMBER_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias con "recordarme"
const MAX_SESIONES_POR_USUARIO = 5;
const LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000;

// Nombre especifico (no "session"/"token" a secas) porque el dominio de
// hosting (castielo.io) sirve mas de una app - evita que dos apps se pisen
// la cookie si ambas usan un nombre generico. Mismo patron que Loot Ledger
// (cookie "loot_ledger_token").
export const COOKIE_NAME = 'nac_asesoria_token';

export function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_COST);
}

export function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function generarToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

const insertSesion = db.prepare(`
  INSERT INTO sesiones_auth (usuario_id, token_hash, user_agent, recordar, expires_at)
  VALUES (@usuario_id, @token_hash, @user_agent, @recordar, @expires_at)
`);
const contarSesiones = db.prepare('SELECT id FROM sesiones_auth WHERE usuario_id = ? ORDER BY last_seen_at ASC');
const borrarSesion = db.prepare('DELETE FROM sesiones_auth WHERE id = ?');

// Crea una sesion nueva (token opaco, solo se guarda su hash) y rota las mas
// viejas si el usuario ya tiene el maximo de sesiones activas - no bloquea
// el login, simplemente desloguea el dispositivo menos usado.
export const crearSesion = db.transaction((usuarioId, { userAgent, recordar }) => {
  const token = generarToken();
  const ttl = recordar ? SESSION_TTL_REMEMBER_MS : SESSION_TTL_MS;
  const expiresAt = new Date(Date.now() + ttl).toISOString();

  const existentes = contarSesiones.all(usuarioId);
  if (existentes.length >= MAX_SESIONES_POR_USUARIO) {
    const aBorrar = existentes.slice(0, existentes.length - MAX_SESIONES_POR_USUARIO + 1);
    for (const s of aBorrar) borrarSesion.run(s.id);
  }

  insertSesion.run({
    usuario_id: usuarioId,
    token_hash: hashToken(token),
    user_agent: userAgent || null,
    recordar: recordar ? 1 : 0,
    expires_at: expiresAt,
  });

  return { token, recordar, expiresAt };
});

const getSesionValida = db.prepare(`
  SELECT s.id AS sesion_id, s.last_seen_at, u.id, u.nombre, u.usuario, u.rol, u.coach_id, u.activo
  FROM sesiones_auth s JOIN usuarios u ON u.id = s.usuario_id
  WHERE s.token_hash = ? AND s.expires_at > datetime('now')
`);
const actualizarLastSeen = db.prepare("UPDATE sesiones_auth SET last_seen_at = datetime('now') WHERE id = ?");

// Valida el token de la cookie contra la tabla de sesiones. Devuelve el
// usuario (con sesion_id adjunto, util para logout/revocar-otras) o null.
export function validarSesion(token) {
  const row = getSesionValida.get(hashToken(token));
  if (!row) return null;

  if (Date.now() - new Date(row.last_seen_at).getTime() > LAST_SEEN_THROTTLE_MS) {
    actualizarLastSeen.run(row.sesion_id);
  }

  const { sesion_id, last_seen_at, ...usuario } = row;
  return { ...usuario, sesion_id };
}

export function revocarSesion(token) {
  db.prepare('DELETE FROM sesiones_auth WHERE token_hash = ?').run(hashToken(token));
}

export function revocarSesionPorId(id) {
  borrarSesion.run(id);
}

export function listarSesiones(usuarioId) {
  return db.prepare(
    'SELECT id, user_agent, recordar, created_at, last_seen_at, expires_at, etiqueta FROM sesiones_auth WHERE usuario_id = ? ORDER BY last_seen_at DESC'
  ).all(usuarioId);
}

export function revocarOtrasSesiones(usuarioId, sesionActualId) {
  db.prepare('DELETE FROM sesiones_auth WHERE usuario_id = ? AND id != ?').run(usuarioId, sesionActualId);
}

// secure via req.secure (con "trust proxy" activado en server.js, refleja
// X-Forwarded-Proto que manda el reverse proxy real) en vez de NODE_ENV
// hardcodeado - asi no rompe el acceso por IP local en HTTP plano.
export function cookieOptions(req, { recordar }) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure,
    path: MOUNT_PATH,
    // Sin "recordarme": cookie de sesion (el navegador la borra al cerrarse,
    // sin maxAge); la sesion del lado del servidor igual expira a las 24hs.
    ...(recordar ? { maxAge: SESSION_TTL_REMEMBER_MS } : {}),
  };
}
