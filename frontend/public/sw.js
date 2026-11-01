// Service worker: deja abrir la app SIN internet.
//
// - Navegación (HTML): red primero; si falla, la última versión guardada de la
//   página (es una SPA: toda ruta devuelve el mismo index.html).
// - Archivos estáticos (JS/CSS/íconos hasheados por Vite): primero lo guardado,
//   y si no está se pide a la red y se guarda. Los nombres cambian con cada
//   versión, así que lo guardado nunca queda "viejo".
// - Todo lo de /api queda afuera: de los datos se ocupa la propia app (copias
//   en IndexedDB y cola de sesiones, ver src/offline/), que sabe qué es seguro
//   guardar y a nombre de quién.
//
// Subir VERSION fuerza a limpiar lo guardado por versiones anteriores.
const VERSION = "v2";
const CACHE = `nac-app-${VERSION}`;
const MAX_ARCHIVOS = 80;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const nombre of await caches.keys()) {
        if (nombre.startsWith("nac-app-") && nombre !== CACHE) await caches.delete(nombre);
      }
      await self.clients.claim();
    })()
  );
});

// La app avisa qué archivos cargó (los de la primera visita se pidieron antes de
// que este worker controlara la página, así que no pasaron por acá).
self.addEventListener("message", (event) => {
  if (event.data?.type !== "GUARDAR_URLS") return;
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      for (const url of event.data.urls ?? []) {
        try {
          if (new URL(url, self.location).origin !== self.location.origin) continue;
          if (await cache.match(url)) continue;
          const res = await fetch(url, { credentials: "same-origin" });
          if (res.ok) await cache.put(url, res);
        } catch {
          /* sin red: se guardará la próxima vez */
        }
      }
    })()
  );
});

async function podar(cache) {
  const claves = await cache.keys();
  // Se borran los más viejos (los primeros guardados) pasado el tope.
  for (const req of claves.slice(0, Math.max(0, claves.length - MAX_ARCHIVOS))) await cache.delete(req);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes("/api/")) return;

  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        try {
          const res = await fetch(req);
          if (res.ok) cache.put(self.registration.scope, res.clone());
          return res;
        } catch {
          return (await cache.match(self.registration.scope)) ?? Response.error();
        }
      })()
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const guardado = await cache.match(req);
      if (guardado) return guardado;
      const res = await fetch(req);
      if (res.ok) {
        await cache.put(req, res.clone());
        podar(cache);
      }
      return res;
    })()
  );
});
