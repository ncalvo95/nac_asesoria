import crypto from 'node:crypto';
import db from '../db/index.js';
import { hashPassword, USUARIO_REGEX } from './auth.js';

// Placeholder de 10 caracteres ("inv_" + 6 hex) para que entre dentro del
// mismo USUARIO_REGEX (4-10 caracteres) que cualquier usuario real - se pisa
// por completo apenas alguien reclama la invitacion. Mismo patron que
// Loot Ledger (server/src/services/invites.js).
function generarUsuarioPlaceholder() {
  for (let i = 0; i < 20; i++) {
    const candidato = `inv_${crypto.randomBytes(3).toString('hex')}`;
    if (!USUARIO_REGEX.test(candidato)) continue;
    const choca = db.prepare('SELECT 1 FROM usuarios WHERE usuario = ?').get(candidato);
    if (!choca) return candidato;
  }
  throw new Error('No se pudo generar un nombre de usuario placeholder unico.');
}

// 20 caracteres hex (80 bits) - de sobra para no ser adivinable.
function generarCodigoInvitacion() {
  for (let i = 0; i < 20; i++) {
    const candidato = crypto.randomBytes(10).toString('hex');
    const choca = db.prepare('SELECT 1 FROM usuarios WHERE invite_code = ?').get(candidato);
    if (!choca) return candidato;
  }
  throw new Error('No se pudo generar un codigo de invitacion unico.');
}

const insertPlaceholder = db.prepare(`
  INSERT INTO usuarios (nombre, usuario, password_hash, rol, coach_id, invite_code)
  VALUES ('(invitacion sin reclamar)', @usuario, @password_hash, @rol, @coach_id, @invite_code)
`);

// El admin puede invitar coach o cliente (coach_id null - si no eligio uno
// especifico); un coach solo invita clientes, siempre linkeados a si mismo.
// El password es aleatorio e irrecuperable - nadie puede loguearse con el
// placeholder, solo reclamando el codigo.
export async function createInvitePlaceholder({ rol, coach_id }) {
  const usuario = generarUsuarioPlaceholder();
  const code = generarCodigoInvitacion();
  const passwordAleatoria = crypto.randomBytes(24).toString('hex');
  const password_hash = await hashPassword(passwordAleatoria);
  const info = insertPlaceholder.run({ usuario, password_hash, rol, coach_id: coach_id ?? null, invite_code: code });
  return { id: info.lastInsertRowid, rol, coach_id: coach_id ?? null, code };
}

// Invitaciones sin reclamar (para volver a mostrar/copiar el codigo): el
// admin ve todas, un coach solo las que genero el mismo.
export function listarInvitesPendientes(actor) {
  if (actor.rol === 'admin') {
    return db.prepare(
      "SELECT id, rol, coach_id, invite_code AS code, created_at FROM usuarios WHERE invite_code IS NOT NULL ORDER BY created_at DESC"
    ).all();
  }
  return db.prepare(
    "SELECT id, rol, coach_id, invite_code AS code, created_at FROM usuarios WHERE invite_code IS NOT NULL AND coach_id = ? ORDER BY created_at DESC"
  ).all(actor.id);
}

const getPorCodigo = db.prepare('SELECT id, rol, coach_id FROM usuarios WHERE invite_code = ?');

// Valida un codigo sin consumirlo - para que el frontend sepa que rol es y
// si el coach ya viene fijo (invitacion de un coach) o se puede elegir
// (invitacion del admin para un cliente).
export function validateInviteCode(code) {
  if (!code) return null;
  const row = getPorCodigo.get(code);
  if (!row) return null;
  return { rol: row.rol, coach_id: row.coach_id };
}

const getPlaceholderPorCodigo = db.prepare('SELECT * FROM usuarios WHERE invite_code = ?');
const getCoachActivo = db.prepare("SELECT id FROM usuarios WHERE id = ? AND rol = 'coach' AND activo = 1");
const getUsuarioPorNombreDistinto = db.prepare('SELECT id FROM usuarios WHERE usuario = ? AND id != ?');
const reclamarPlaceholder = db.prepare(`
  UPDATE usuarios SET nombre = ?, usuario = ?, password_hash = ?, coach_id = ?, invite_code = NULL
  WHERE id = ?
`);

// Reclama un placeholder: pisa nombre/usuario/password, fija el coach (el de
// la invitacion si ya venia fijo, o el elegido por la persona si el rol es
// cliente y la invitacion no traia uno) y consume el codigo. hashPassword es
// async (bcrypt), asi que el hasheo va afuera de la transaccion sincronica
// de better-sqlite3 - por eso se re-valida el codigo adentro, por si otra
// request lo reclamo mientras tanto.
export async function claimInvite({ code, nombre, usuario, password, coach_id }) {
  const placeholder = getPlaceholderPorCodigo.get(code);
  if (!placeholder) {
    const err = new Error('Codigo de invitacion invalido o ya usado.');
    err.code = 'INVALID_INVITE';
    throw err;
  }
  if (getUsuarioPorNombreDistinto.get(usuario, placeholder.id)) {
    const err = new Error('Ese usuario ya esta en uso.');
    err.code = 'USUARIO_TOMADO';
    throw err;
  }

  let coachIdFinal = placeholder.coach_id;
  if (placeholder.rol === 'cliente' && placeholder.coach_id === null && coach_id != null) {
    if (!getCoachActivo.get(coach_id)) {
      const err = new Error('El coach elegido no es valido.');
      err.code = 'COACH_INVALIDO';
      throw err;
    }
    coachIdFinal = coach_id;
  }

  const password_hash = await hashPassword(password);

  const aplicar = db.transaction(() => {
    const actual = getPlaceholderPorCodigo.get(code);
    if (!actual || actual.id !== placeholder.id) {
      const err = new Error('Codigo de invitacion invalido o ya usado.');
      err.code = 'INVALID_INVITE';
      throw err;
    }
    reclamarPlaceholder.run(nombre, usuario, password_hash, coachIdFinal, placeholder.id);
  });
  aplicar();

  return { id: placeholder.id, nombre, usuario, rol: placeholder.rol, coach_id: coachIdFinal };
}
