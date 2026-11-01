// import.meta.env.BASE_URL viene del `base` configurado en vite.config.js
// (siempre termina en "/"), asi que esto arma bien tanto en la raiz ("/")
// como servido bajo un subpath (ej. "/nac_asesoria/") sin tocar nada mas.
import { esCacheable, guardarCopia, leerCopia } from '../offline/cache.js';
import { marcarOnline, marcarSinConexion, marcarUsandoCopia } from '../offline/conexion.js';

export const API_BASE = `${import.meta.env.BASE_URL}api`;

// Un GET con copia guardada espera como mucho esto antes de usar la copia: con
// señal mala (típico en un gimnasio) el pedido puede quedar colgado minutos.
const ESPERA_GET_MS = 20000;

async function request(method, path, body, { timeoutMs } = {}) {
  const controller = timeoutMs ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      credentials: 'include',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller?.signal,
    });
  } catch (err) {
    // Se cortó la espera propia: el servidor está lento o la señal es mala, pero
    // NO es lo mismo que no tener internet (no se marca "sin conexión": en una
    // Raspberry cargada una respuesta lenta es normal).
    if (err?.name === 'AbortError') throw new ApiError('El servidor tardó demasiado en responder.', 0, null, false, true);
    // fetch solo rechaza por red (sin conexión, DNS, corte): un error HTTP (400,
    // 500...) llega como respuesta y se maneja más abajo.
    marcarSinConexion();
    throw new ApiError('Sin conexión a internet.', 0, null, true);
  } finally {
    if (timer) clearTimeout(timer);
  }

  marcarOnline(); // cualquier respuesta HTTP (aun un error) prueba que hay red
  if (res.status === 204) return null;

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    const message = (isJson && data?.error) || `Error ${res.status}`;
    throw new ApiError(message, res.status, isJson ? data : null);
  }
  return data;
}

export class ApiError extends Error {
  constructor(message, status, body, sinConexion = false, lenta = false) {
    super(message);
    this.status = status;
    this.body = body;
    // true si el pedido ni siquiera llegó al servidor (no hay internet).
    this.sinConexion = sinConexion;
    // true si se cortó la espera (servidor o señal lentos).
    this.lenta = lenta;
  }
}

// GET con copia: red primero (y se guarda la respuesta); si no hay red se
// devuelve la última copia guardada de esa misma ruta. Sin copia, el error sube.
async function get(path) {
  if (!esCacheable(path)) return request('GET', path);
  try {
    const datos = await request('GET', path, undefined, { timeoutMs: ESPERA_GET_MS });
    guardarCopia(path, datos);
    return datos;
  } catch (err) {
    if (err.sinConexion || err.lenta) {
      const copia = await leerCopia(path);
      if (copia) {
        marcarUsandoCopia(copia.guardadoEn, { sinConexion: Boolean(err.sinConexion) });
        return copia.datos;
      }
    }
    throw err;
  }
}

export { request as pedirSinCopia };

export const api = {
  get,
  post: (path, body) => request('POST', path, body ?? {}),
  put: (path, body) => request('PUT', path, body ?? {}),
  patch: (path, body) => request('PATCH', path, body ?? {}),
  del: (path, body) => request('DELETE', path, body),
};
