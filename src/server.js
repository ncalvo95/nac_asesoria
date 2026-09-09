import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MOUNT_PATH } from './base-path.js';
import authRouter from './routes/auth.js';
import guestRouter from './routes/guest.js';
import perfilRouter from './routes/perfil.js';
import rutinaRouter from './routes/rutina.js';
import sesionesRouter from './routes/sesiones.js';
import reportesRouter from './routes/reportes.js';
import catalogoRouter from './routes/catalogo.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');

const app = express();
// Necesario para que req.secure refleje la conexion real del cliente (HTTP
// directo vs HTTPS a traves de Caddy/el tunel), leyendo X-Forwarded-Proto en
// vez de mirar la conexion interna reverse-proxy->Node (siempre HTTP plano).
app.set('trust proxy', true);

app.use(express.json());
app.use(cookieParser());

// Todo (API + estaticos) cuelga de un router montado en MOUNT_PATH, para
// poder convivir con otro sitio bajo el mismo dominio (ver base-path.js). En
// un deploy normal MOUNT_PATH es "/" y esto se comporta exactamente igual
// que antes. Mismo patron que Loot Ledger (server/src/index.js).
const router = express.Router();

router.get('/api/health', (req, res) => res.json({ ok: true }));
router.use('/api/auth', authRouter);
router.use('/api/guest', guestRouter);
router.use('/api/usuarios', perfilRouter);
router.use('/api', rutinaRouter);
router.use('/api', sesionesRouter);
router.use('/api', reportesRouter);
router.use('/api/catalogo', catalogoRouter);

router.use(express.static(frontendDist));
router.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(frontendDist, 'index.html'));
});

app.use(MOUNT_PATH, router);

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
