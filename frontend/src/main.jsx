import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Service worker (public/sw.js): permite abrir la app sin internet. Solo en la
// versión publicada: en desarrollo se desregistra para que el caché no tape los
// cambios mientras se programa.
if ('serviceWorker' in navigator) {
  if (import.meta.env.PROD) {
    window.addEventListener('load', async () => {
      const registro = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
      // Los archivos de esta primera carga se pidieron antes de que el worker
      // controlara la página: se le avisa cuáles son para que los guarde.
      const listo = await navigator.serviceWorker.ready;
      const urls = performance.getEntriesByType('resource')
        .map((r) => r.name)
        .filter((u) => new URL(u).origin === location.origin && !u.includes('/api/'));
      (registro.active ?? listo.active)?.postMessage({
        type: 'GUARDAR_URLS',
        urls: [...urls, `${import.meta.env.BASE_URL}manifest.webmanifest`],
      });
    });
  } else {
    navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()));
  }
}
