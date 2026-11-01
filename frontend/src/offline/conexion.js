import { useSyncExternalStore } from 'react';

// Estado global de conexión y de lo pendiente de enviar. Lo escriben el cliente
// de la API y la cola de sincronización; lo lee el cartel de arriba (hook
// useConexion). No usa navigator.onLine como verdad: esa señal miente (wifi sin
// internet). "Sin conexión" = un pedido real falló por la red.

let estado = {
  sinConexion: typeof navigator !== 'undefined' && navigator.onLine === false,
  datosDesde: null, // ISO de la copia más vieja que se está mostrando, o null si todo es fresco
  pendientes: 0,
  conError: [], // [{ id, error, resumen }]
  sincronizando: false,
  sesionVencida: false, // la sesión de login venció con cosas pendientes de enviar
};
const oyentes = new Set();

export function leerConexion() {
  return estado;
}

export function cambiarConexion(parcial) {
  const siguiente = { ...estado, ...parcial };
  if (JSON.stringify(siguiente) === JSON.stringify(estado)) return;
  estado = siguiente;
  oyentes.forEach((fn) => fn());
}

function suscribir(fn) {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}

export function useConexion() {
  return useSyncExternalStore(suscribir, leerConexion, leerConexion);
}

export function marcarOnline() {
  if (estado.sinConexion || estado.datosDesde) cambiarConexion({ sinConexion: false, datosDesde: null });
}

export function marcarSinConexion() {
  if (!estado.sinConexion) cambiarConexion({ sinConexion: true });
}

// Se está mostrando una copia guardada de `guardadoEn` (ISO): se conserva la más vieja.
export function marcarUsandoCopia(guardadoEn, { sinConexion = true } = {}) {
  const datosDesde = estado.datosDesde && estado.datosDesde < guardadoEn ? estado.datosDesde : guardadoEn;
  cambiarConexion(sinConexion ? { sinConexion: true, datosDesde } : { datosDesde });
}

if (typeof window !== 'undefined') {
  window.addEventListener('offline', () => marcarSinConexion());
  // 'online' no garantiza internet: solo dispara el reintento (lo hace la cola).
}
