// Crea la cuenta admin inicial si todavia no existe ninguna.
// Uso: ADMIN_USUARIO=... ADMIN_PASSWORD=... ADMIN_NOMBRE=... node src/db/seed/bootstrap-admin.js
import db from '../index.js';
import { hashPassword } from '../../services/auth.js';

const usuario = process.env.ADMIN_USUARIO;
const password = process.env.ADMIN_PASSWORD;
const nombre = process.env.ADMIN_NOMBRE || 'Admin';

if (!usuario || !password) {
  console.error('Definí ADMIN_USUARIO y ADMIN_PASSWORD como variables de entorno.');
  process.exit(1);
}

const existente = db.prepare('SELECT id FROM usuarios WHERE rol = ?').get('admin');
if (existente) {
  console.log('Ya existe una cuenta admin, no se crea otra.');
  process.exit(0);
}

const password_hash = await hashPassword(password);
db.prepare(
  'INSERT INTO usuarios (nombre, usuario, password_hash, rol) VALUES (?, ?, ?, ?)'
).run(nombre, usuario, password_hash, 'admin');

console.log(`Cuenta admin creada: ${usuario}`);
