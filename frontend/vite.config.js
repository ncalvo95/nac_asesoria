import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
  resolve: {
    alias: {
      // El motor de calculo de nutricion vive en shared/ (fuera de
      // frontend/) para que backend y frontend llamen exactamente al mismo
      // codigo puro - ver shared/nutrition/nutritionEngine.js.
      '@shared/nutrition': path.resolve(__dirname, '../shared/nutrition'),
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
    fs: {
      allow: [path.resolve(__dirname, '..')],
    },
  },
  build: {
    outDir: 'dist',
  },
});
