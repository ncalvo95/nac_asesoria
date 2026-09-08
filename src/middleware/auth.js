import db from '../db/index.js';
import { COOKIE_NAME, verifyToken } from '../services/auth.js';

const getUsuario = db.prepare(
  'SELECT id, nombre, email, rol, coach_id, activo FROM usuarios WHERE id = ?'
);

export function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'No autenticado.' });

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    return res.status(401).json({ error: 'Sesion invalida o expirada.' });
  }

  const usuario = getUsuario.get(payload.sub);
  if (!usuario || !usuario.activo) {
    return res.status(401).json({ error: 'Sesion invalida.' });
  }

  req.usuario = usuario;
  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.usuario || !roles.includes(req.usuario.rol)) {
      return res.status(403).json({ error: 'No autorizado.' });
    }
    next();
  };
}

// Un coach solo puede operar sobre si mismo y sus clientes; un cliente solo
// sobre si mismo; el admin puede operar sobre cualquiera.
export function puedeAccederAUsuario(actor, usuarioObjetivoId) {
  if (actor.rol === 'admin') return true;
  if (actor.id === usuarioObjetivoId) return true;
  if (actor.rol === 'coach') {
    const objetivo = getUsuario.get(usuarioObjetivoId);
    return Boolean(objetivo && objetivo.coach_id === actor.id);
  }
  return false;
}
