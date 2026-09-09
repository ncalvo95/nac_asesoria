import db from '../db/index.js';
import { aplicarDisponibilidad, aplicarEquipamiento, aplicarObjetivo } from './perfilService.js';
import { crearRutina, crearRutinaConSplit, crearRutinaManual } from './rutinaService.js';

// Un cambio queda pendiente de aprobacion solo cuando: el actor ES el
// cliente (no su coach ni el admin editandolo por el - esos ya son la
// aprobacion), el cliente tiene coach asignado, y el propio cliente activo
// el toggle "que mi coach apruebe mis cambios" (no es automatico por tener
// coach - hay que elegirlo).
export function debeQuedarPendiente(actor, usuarioObjetivoId) {
  return (
    actor.rol === 'cliente' &&
    actor.id === usuarioObjetivoId &&
    actor.coach_id != null &&
    Boolean(actor.requiere_aprobacion_coach)
  );
}

const insertSolicitud = db.prepare(`
  INSERT INTO solicitud_cambio (usuario_id, coach_id, tipo, payload_json)
  VALUES (@usuario_id, @coach_id, @tipo, @payload_json)
`);

export function crearSolicitudCambio({ usuario_id, coach_id, tipo, payload }) {
  const info = insertSolicitud.run({ usuario_id, coach_id, tipo, payload_json: JSON.stringify(payload) });
  return { id: info.lastInsertRowid };
}

export const getSolicitudPorId = (id) => db.prepare('SELECT * FROM solicitud_cambio WHERE id = ?').get(id);

// El admin ve todas las solicitudes pendientes; un coach solo las de sus
// propios clientes.
export function listarSolicitudesPendientes(actor) {
  const base = `
    SELECT sc.*, u.nombre AS usuario_nombre, u.usuario AS usuario_usuario
    FROM solicitud_cambio sc JOIN usuarios u ON u.id = sc.usuario_id
    WHERE sc.estado = 'pendiente'
  `;
  if (actor.rol === 'admin') {
    return db.prepare(`${base} ORDER BY sc.created_at`).all();
  }
  return db.prepare(`${base} AND sc.coach_id = ? ORDER BY sc.created_at`).all(actor.id);
}

// Historial completo (pendientes + resueltas) de un usuario puntual, para
// que el propio cliente vea el estado de sus pedidos.
export function listarSolicitudesDeUsuario(usuarioId) {
  return db.prepare(
    'SELECT * FROM solicitud_cambio WHERE usuario_id = ? ORDER BY created_at DESC'
  ).all(usuarioId);
}

// Aplica el mismo efecto que hubiera tenido el endpoint original si el
// cambio no hubiera quedado pendiente - reusa exactamente la misma logica
// de aplicacion (perfilService/rutinaService), nunca la reimplementa.
export function aplicarSolicitud(solicitud) {
  const payload = JSON.parse(solicitud.payload_json);
  switch (solicitud.tipo) {
    case 'objetivo':
      return aplicarObjetivo(solicitud.usuario_id, payload);
    case 'disponibilidad':
      return aplicarDisponibilidad(solicitud.usuario_id, payload);
    case 'equipamiento':
      return aplicarEquipamiento(solicitud.usuario_id, payload);
    case 'rutina_auto':
      return crearRutina(solicitud.usuario_id);
    case 'rutina_manual':
      return crearRutinaManual(solicitud.usuario_id, payload);
    case 'rutina_split':
      return crearRutinaConSplit(solicitud.usuario_id, payload);
    default:
      throw new Error(`Tipo de solicitud desconocido: ${solicitud.tipo}`);
  }
}

const marcarResuelta = db.prepare(
  "UPDATE solicitud_cambio SET estado = ?, resuelta_at = datetime('now'), nota_coach = ? WHERE id = ?"
);

export function marcarSolicitud(id, estado, nota) {
  marcarResuelta.run(estado, nota || null, id);
}
