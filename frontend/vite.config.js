import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// VITE_BASE_PATH permite servir la app bajo un subpath (ej. castielo.io/nac_asesoria)
// sin tocar el codigo: en produccion se define en build time, en dev queda en "/".
// Debe terminar en "/" (ej. "/nac_asesoria/").
export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
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
