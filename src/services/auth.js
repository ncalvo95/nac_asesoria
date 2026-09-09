import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

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
    // COOKIE_PATH: si la app se sirve bajo un subpath (ej. /nac_asesoria en
    // castielo.io), restringir la cookie a ese path evita que viaje a otras
    // apps del mismo dominio. En local queda "/" por default.
    path: process.env.COOKIE_PATH || '/',
  };
}
