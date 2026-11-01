import { pedirSinCopia } from '../api/client.js';
import { idb } from './idb.js';
import { cambiarConexion, leerConexion } from './conexion.js';
import { aIso } from '../utils/fechas.js';

// Cola de sesiones pendientes de enviar. Registrar una sesión SIEMPRE intenta
// el servidor primero; si no hay red, la sesión queda guardada en el celular y
// se envía sola cuando vuelve la conexión. Cada sesión lleva un `client_id`
// único: el servidor la registra una sola vez aunque el mismo envío llegue dos
// veces (por ejemplo si la respuesta se perdió).

const ESPERA_ENVIO_MS = 15000;
let actor = null;
let sincronizando = false;

export function fijarActorCola(id) {
  actor = id ?? null;
  if (actor != null) { refrescarEstado(); sincronizar(); } else cambiarConexion({ pendientes: 0, conError: [], sesionVencida: false });
}

function nuevoId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

async function items() {
  try {
    const todos = await idb.todos('cola');
    return todos.filter((i) => i.actorId === actor).sort((a, b) => a.creadoEn.localeCompare(b.creadoEn));
  } catch {
    return [];
  }
}

async function refrescarEstado() {
  const lista = await items();
  cambiarConexion({
    pendientes: lista.filter((i) => i.estado === 'pendiente').length,
    conError: lista.filter((i) => i.estado === 'error').map((i) => ({ id: i.id, error: i.error, resumen: i.resumen })),
  });
}

const resumenDe = (payload) => (payload.salteada ? 'Sesión salteada' : `Sesión de ${payload.series?.length ?? 0} series`) + ` del ${payload.fecha}`;

async function encolar(usuarioId, payload, borradorKey) {
  const item = {
    id: payload.client_id, actorId: actor, usuarioId, creadoEn: new Date().toISOString(),
    estado: 'pendiente', error: null, borradorKey: borradorKey ?? null, payload, resumen: resumenDe(payload),
  };
  await idb.put('cola', item);
  await refrescarEstado();
  return item;
}

// Registra (o saltea) una sesión. Devuelve { pendiente: false, id } si llegó al
// servidor, o { pendiente: true } si quedó guardada en el celular para enviarla
// después. Los errores del servidor (pausa, datos inválidos...) se lanzan tal
// cual: esos no se arreglan reintentando.
export async function enviarSesion(usuarioId, datos, borradorKey) {
  const payload = { ...datos, fecha: datos.fecha ?? aIso(new Date()), client_id: nuevoId() };
  // Si ya hay sesiones esperando, esta va detrás para conservar el orden.
  if ((await items()).some((i) => i.estado === 'pendiente')) {
    await encolar(usuarioId, payload, borradorKey);
    sincronizar();
    return { pendiente: true };
  }
  try {
    const r = await pedirSinCopia('POST', `/usuarios/${usuarioId}/sesiones`, payload, { timeoutMs: ESPERA_ENVIO_MS });
    return { pendiente: false, id: r?.id };
  } catch (err) {
    if (!err.sinConexion) throw err;
    await encolar(usuarioId, payload, borradorKey);
    return { pendiente: true };
  }
}

// Envía lo pendiente en orden. Se corta ante un fallo de red o de servidor (se
// reintenta luego); un rechazo del servidor (400/403/404/409) deja esa sesión
// marcada con error para que la persona decida, y sigue con las demás.
export async function sincronizar() {
  if (sincronizando || actor == null) return { enviadas: 0 };
  sincronizando = true;
  cambiarConexion({ sincronizando: true });
  let enviadas = 0;
  if (leerConexion().sesionVencida) cambiarConexion({ sesionVencida: false });
  try {
    for (const item of (await items()).filter((i) => i.estado === 'pendiente')) {
      try {
        await pedirSinCopia('POST', `/usuarios/${item.usuarioId}/sesiones`, item.payload, { timeoutMs: ESPERA_ENVIO_MS });
      } catch (err) {
        if (err.status === 401) { cambiarConexion({ sesionVencida: true }); break; }
        if (err.sinConexion || err.status >= 500) break;
        await idb.put('cola', { ...item, estado: 'error', error: err.message });
        continue;
      }
      await idb.del('cola', item.id);
      if (item.borradorKey) { try { localStorage.removeItem(item.borradorKey); } catch { /* sin storage */ } }
      enviadas += 1;
    }
  } finally {
    sincronizando = false;
    await refrescarEstado();
    cambiarConexion({ sincronizando: false });
  }
  if (enviadas > 0 && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('nac:sincronizado', { detail: { enviadas } }));
  }
  return { enviadas };
}

export async function reintentar(id) {
  const item = (await items()).find((i) => i.id === id);
  if (item) await idb.put('cola', { ...item, estado: 'pendiente', error: null });
  await refrescarEstado();
  return sincronizar();
}

export async function descartar(id) {
  try { await idb.del('cola', id); } catch { /* ya no está */ }
  await refrescarEstado();
}

export function hayPendientes() {
  const e = leerConexion();
  return e.pendientes > 0 || e.conError.length > 0;
}

// Antes de acciones que dependen de que el servidor tenga TODO lo anotado (cerrar
// un bloque): intenta enviar lo pendiente y avisa si no se pudo.
export async function asegurarSincronizado() {
  await sincronizar();
  const e = leerConexion();
  if (e.pendientes > 0) throw new Error('Tenés sesiones guardadas en el celular sin enviar. Conectate a internet y esperá a que se envíen antes de cerrar el bloque.');
  if (e.conError.length > 0) throw new Error('Hay sesiones que no se pudieron enviar. Revisalas (arriba) antes de cerrar el bloque.');
}

// Sincronización automática: al volver la conexión, al volver a abrir la app y
// cada tanto mientras haya algo pendiente.
let iniciada = false;
export function iniciarSincronizacionAutomatica() {
  if (iniciada || typeof window === 'undefined') return;
  iniciada = true;
  window.addEventListener('online', () => sincronizar());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sincronizar(); });
  setInterval(() => { if (leerConexion().pendientes > 0) sincronizar(); }, 45000);
}
