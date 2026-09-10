import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import db from './index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, 'schema.sql');

const schema = fs.readFileSync(schemaPath, 'utf8');
db.exec(schema);

// CREATE TABLE IF NOT EXISTS no agrega columnas nuevas a una tabla que ya
// existia de una version anterior del schema - para esos casos puntuales
// (columnas sumadas despues del primer deploy) hace falta un ALTER TABLE
// explicito, tolerante a que ya exista (por eso el try/catch: correr esto
// de nuevo sobre una base ya migrada no debe romper nada).
const columnasNuevas = [
  { tabla: 'dia_rutina', columna: 'activo', definicion: 'INTEGER NOT NULL DEFAULT 1' },
  { tabla: 'ejercicio_asignado', columna: 'descanso_segundos', definicion: 'INTEGER NOT NULL DEFAULT 90' },
];
for (const { tabla, columna, definicion } of columnasNuevas) {
  try {
    db.exec(`ALTER TABLE ${tabla} ADD COLUMN ${columna} ${definicion}`);
  } catch (err) {
    if (!/duplicate column name/i.test(err.message)) throw err;
  }
}

console.log('Migracion aplicada correctamente.');
