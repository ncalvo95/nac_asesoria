import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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

app.use(express.json());
app.use(cookieParser());

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRouter);
app.use('/api/guest', guestRouter);
app.use('/api/usuarios', perfilRouter);
app.use('/api', rutinaRouter);
app.use('/api', sesionesRouter);
app.use('/api', reportesRouter);
app.use('/api/catalogo', catalogoRouter);

app.use(express.static(frontendDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(frontendDist, 'index.html'));
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
