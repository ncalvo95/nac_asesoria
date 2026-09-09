// Prefijo bajo el que cuelga toda la app (API + estaticos) cuando convive con
// otro sitio en el mismo dominio, ej. BASE_PATH=/nac_asesoria para
// www.castielo.io/nac_asesoria. Vacio por defecto: la app sigue viviendo en
// la raiz del dominio - no rompe ningun deploy existente que no defina esta
// variable. Mismo patron que usa Loot Ledger (server/src/base-path.js), asi
// las dos conviven en la misma Pi con la misma convencion.
const raw = (process.env.BASE_PATH || '').trim();
export const BASE_PATH = raw ? '/' + raw.replace(/^\/+|\/+$/g, '') : '';
export const MOUNT_PATH = BASE_PATH || '/';
