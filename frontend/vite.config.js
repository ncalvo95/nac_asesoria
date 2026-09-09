import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// BASE_PATH permite que el build cuelgue de un subpath (ej. "/nac_asesoria"
// para www.castielo.io/nac_asesoria) en vez de la raiz del dominio. Vacio por
// defecto: mismo comportamiento de siempre. Tiene que coincidir con el
// BASE_PATH que lee el server (src/base-path.js) - una sola variable en el
// entorno controla los dos lados. Mismo patron que Loot Ledger
// (client/vite.config.js), para convivir en la misma Pi con la misma
// convencion.
const rawBase = (process.env.BASE_PATH || '').trim();
const base = rawBase ? `/${rawBase.replace(/^\/+|\/+$/g, '')}/` : '/';

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  build: {
    outDir: 'dist',
  },
});
