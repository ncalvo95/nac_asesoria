import { idb } from './idb.js';

// Copia de las lecturas (GET) del servidor para poder seguir usando la app sin
// internet. Cada usuario logueado tiene la suya (clave "<id>|<ruta>"); al cerrar
// sesión se borra. El orden de preferencia es siempre: red primero, copia solo si
// la red falla.

let actor = null;
const MAX_ENTRADAS = 400;

export function fijarActor(id) {
  actor = id ?? null;
}

// Rutas que no se copian: archivos (Excel) y todo lo de auth salvo /auth/me.
export function esCacheable(ruta) {
  if (/\.xlsx(\?|$)/.test(ruta) || ruta.includes('/export')) return false;
  if (ruta.startsWith('/auth/') && ruta !== '/auth/me') return false;
  return true;
}

const clave = (ruta) => (ruta === '/auth/me' ? 'me' : actor == null ? null : `${actor}|${ruta}`);

export async function guardarCopia(ruta, datos) {
  const k = clave(ruta);
  if (!k) return;
  try {
    await idb.put('respuestas', { datos, guardadoEn: new Date().toISOString() }, k);
    // Poda: si hay demasiadas copias se borran las más viejas.
    const claves = await idb.claves('respuestas');
    if (claves.length > MAX_ENTRADAS) {
      const entradas = await Promise.all(claves.map(async (c) => [c, (await idb.get('respuestas', c))?.guardadoEn ?? '']));
      entradas.sort((a, b) => a[1].localeCompare(b[1]));
      await Promise.all(entradas.slice(0, claves.length - MAX_ENTRADAS).map(([c]) => idb.del('respuestas', c)));
    }
  } catch { /* sin IndexedDB: la app sigue online */ }
}

export async function leerCopia(ruta) {
  const k = clave(ruta);
  if (!k) return null;
  try {
    return (await idb.get('respuestas', k)) ?? null;
  } catch {
    return null;
  }
}

// Al cerrar sesión: fuera las copias de esa persona (equipo compartido). La cola
// de cambios pendientes NO se toca: una sesión sin enviar no se pierde por salir.
export async function borrarCopias() {
  try {
    const claves = await idb.claves('respuestas');
    await Promise.all(claves.filter((c) => c === 'me' || (actor != null && String(c).startsWith(`${actor}|`))).map((c) => idb.del('respuestas', c)));
  } catch { /* nada que borrar */ }
}
