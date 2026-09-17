#!/usr/bin/env node
// Genera un snapshot consistente de la base (usa la Online Backup API de
// SQLite via better-sqlite3, que maneja bien el modo WAL - a diferencia de
// copiar app.db a mano mientras el server esta corriendo, esto nunca deja
// el snapshot a mitad de una escritura) y lo deja en el mismo volumen de
// datos, listo para sacarlo del contenedor con `docker compose cp`.
//
// Uso: node scripts/backup-db.mjs
// (no hace falta --confirmar ni nada, es de solo lectura sobre la base
// original - solo crea un archivo nuevo)

import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'app.db');
const db = new Database(dbPath, { readonly: true });

const fecha = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const destino = path.join(path.dirname(dbPath), `backup-${fecha}.db`);

await db.backup(destino);
db.close();

console.log(destino);
