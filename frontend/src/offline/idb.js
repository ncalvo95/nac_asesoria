// Envoltorio mínimo de IndexedDB (sin librerías) para el modo sin conexión.
// Dos almacenes: `respuestas` (copia de las lecturas del servidor, clave
// "<usuario>|<ruta>") y `cola` (cambios pendientes de enviar). Si IndexedDB no
// está disponible (navegación privada en algunos navegadores) todo falla con
// gracia: los llamadores atrapan el error y la app sigue funcionando online.

const NOMBRE = 'nac-offline';
const VERSION = 1;
let abierta = null;

function abrir() {
  if (!abierta) {
    abierta = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB no disponible'));
      const req = indexedDB.open(NOMBRE, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore('respuestas');
        db.createObjectStore('cola', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { abierta = null; reject(req.error); };
    });
  }
  return abierta;
}

async function operar(almacen, modo, fn) {
  const db = await abrir();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(almacen, modo);
    const req = fn(tx.objectStore(almacen));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const idb = {
  get: (almacen, clave) => operar(almacen, 'readonly', (s) => s.get(clave)),
  put: (almacen, valor, clave) => operar(almacen, 'readwrite', (s) => (clave === undefined ? s.put(valor) : s.put(valor, clave))),
  del: (almacen, clave) => operar(almacen, 'readwrite', (s) => s.delete(clave)),
  todos: (almacen) => operar(almacen, 'readonly', (s) => s.getAll()),
  claves: (almacen) => operar(almacen, 'readonly', (s) => s.getAllKeys()),
  vaciar: (almacen) => operar(almacen, 'readwrite', (s) => s.clear()),
};
