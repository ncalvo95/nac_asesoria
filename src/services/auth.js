import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { MOUNT_PATH } from '../base-path.js';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('Falta la variable de entorno JWT_SECRET.');
}

const TOKEN_TTL = '30d';
// Nombre especifico (no "session" a secas) porque el dominio de hosting
// (castielo.io) sirve mas de una app - evita que dos apps se pisen la
// cookie si ambas usan el mismo nombre generico.
export const COOKIE_NAME = 'nac_asesoria_session';

export function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

export function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

export function signToken(usuario) {
  return jwt.sign({ sub: usuario.id, rol: usuario.rol }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

export function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60 * 1000,
    // Une la cookie a todo lo que cuelga de MOUNT_PATH ("/" en un deploy
    // normal, "/nac_asesoria" si convive con otro sitio) - evita que viaje a
    // otras apps del mismo dominio.
    path: MOUNT_PATH,
  };
}
