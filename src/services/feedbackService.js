import db from '../db/index.js';

const TIPOS_VALIDOS = ['bug', 'sugerencia', 'otro'];

const insertFeedback = db.prepare('INSERT INTO feedback (usuario_id, tipo, mensaje) VALUES (?, ?, ?)');

export function crearFeedback(usuarioId, tipo, mensaje) {
  const mensajeLimpio = (mensaje || '').trim();
  if (!mensajeLimpio) throw new Error('El mensaje no puede estar vacío.');
  const tipoFinal = TIPOS_VALIDOS.includes(tipo) ? tipo : 'otro';
  const { lastInsertRowid } = insertFeedback.run(usuarioId, tipoFinal, mensajeLimpio);
  return lastInsertRowid;
}

// Pendientes primero, despues los ya revisados (mas nuevo primero en cada
// grupo) - asi el admin ve de entrada lo que le falta atender sin que se
// pierda entre lo viejo ya resuelto.
export function listarFeedback() {
  return db.prepare(`
    SELECT f.*, u.nombre AS usuario_nombre, u.usuario AS usuario_usuario, u.rol AS usuario_rol
    FROM feedback f JOIN usuarios u ON u.id = f.usuario_id
    ORDER BY (f.estado = 'pendiente') DESC, f.created_at DESC
  `).all();
}

export function listarFeedbackDeUsuario(usuarioId) {
  return db.prepare('SELECT * FROM feedback WHERE usuario_id = ? ORDER BY created_at DESC').all(usuarioId);
}

export function marcarFeedbackRevisado(id, notaAdmin) {
  const info = db.prepare(
    "UPDATE feedback SET estado = 'revisado', nota_admin = ?, resuelto_at = datetime('now') WHERE id = ?"
  ).run(notaAdmin || null, id);
  if (info.changes === 0) throw new Error('Feedback no encontrado.');
}
