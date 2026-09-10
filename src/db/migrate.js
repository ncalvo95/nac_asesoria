import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import db from './index.js';
import { musculos } from './seed/musculos.js';

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
  { tabla: 'musculo', columna: 'activo', definicion: 'INTEGER NOT NULL DEFAULT 1' },
];
for (const { tabla, columna, definicion } of columnasNuevas) {
  try {
    db.exec(`ALTER TABLE ${tabla} ADD COLUMN ${columna} ${definicion}`);
  } catch (err) {
    if (!/duplicate column name/i.test(err.message)) throw err;
  }
}

// "deltoides" a secas se separo en 3 cabezas (deltoides_lateral/anterior/
// posterior, ver seed/musculos.js) porque el lateral necesita volumen
// directo propio que el anterior/posterior no necesitan en la misma
// medida. Esto es una migracion de DATOS (no solo de schema), asi que va
// aparte de columnasNuevas -y corre en cada arranque, idempotente- para
// que una base ya seedeada antes de este cambio quede al dia sola, igual
// que ya pasa con las columnas nuevas.
function migrarDeltoides() {
  const getMusculoPorNombre = db.prepare('SELECT id FROM musculo WHERE nombre = ?');
  const insertMusculo = db.prepare('INSERT INTO musculo (nombre, region) VALUES (?, ?) ON CONFLICT(nombre) DO NOTHING');
  const insertVolumen = db.prepare(
    'INSERT INTO referencia_volumen_muscular (musculo_id, mev, mav, mrv) VALUES (?, ?, ?, ?) ON CONFLICT(musculo_id) DO NOTHING'
  );

  const cabezas = musculos.filter((m) => m.nombre.startsWith('deltoides_'));
  const idPorCabeza = {};
  for (const c of cabezas) {
    insertMusculo.run(c.nombre, c.region);
    const { id } = getMusculoPorNombre.get(c.nombre);
    insertVolumen.run(id, c.mev, c.mav, c.mrv);
    idPorCabeza[c.nombre] = id;
  }

  const deltoidesViejo = getMusculoPorNombre.get('deltoides');
  if (!deltoidesViejo) return; // instalacion nueva: "deltoides" a secas nunca llego a existir

  db.prepare('UPDATE musculo SET activo = 0 WHERE id = ?').run(deltoidesViejo.id);

  // A que cabeza pasa cada ejercicio del catalogo que antes apuntaba a
  // "deltoides" (primario o secundario) - mismo mapeo que en seed/ejercicios.js.
  const primarioPorNombre = {
    'Press militar con barra': 'deltoides_anterior',
    'Press militar con mancuernas': 'deltoides_anterior',
    'Elevaciones laterales con mancuernas': 'deltoides_lateral',
    'Elevaciones posteriores (pajaro)': 'deltoides_posterior',
    'Elevaciones laterales con banda': 'deltoides_lateral',
  };
  const secundarioPorNombre = {
    'Press banca plano con barra': 'deltoides_anterior',
    'Press banca plano con mancuernas': 'deltoides_anterior',
    'Press banca inclinado con mancuernas': 'deltoides_anterior',
    'Fondos en paralelas': 'deltoides_anterior',
    'Flexiones de brazos': 'deltoides_anterior',
    'Press banca con banda': 'deltoides_anterior',
    'Face pull en polea': 'deltoides_posterior',
    'Fondos entre bancos': 'deltoides_anterior',
    'Rueda abdominal': 'deltoides_anterior',
  };

  const getEjercicio = db.prepare('SELECT id, musculo_primario_id, musculos_secundarios_json FROM ejercicio WHERE nombre = ?');
  const updatePrimario = db.prepare('UPDATE ejercicio SET musculo_primario_id = ? WHERE id = ?');
  const updateSecundarios = db.prepare('UPDATE ejercicio SET musculos_secundarios_json = ? WHERE id = ?');

  for (const [nombre, cabeza] of Object.entries(primarioPorNombre)) {
    const ej = getEjercicio.get(nombre);
    if (ej && ej.musculo_primario_id === deltoidesViejo.id) {
      updatePrimario.run(idPorCabeza[cabeza], ej.id);
    }
  }
  for (const [nombre, cabeza] of Object.entries(secundarioPorNombre)) {
    const ej = getEjercicio.get(nombre);
    if (!ej) continue;
    const secundarios = JSON.parse(ej.musculos_secundarios_json);
    if (!secundarios.includes('deltoides')) continue;
    updateSecundarios.run(JSON.stringify(secundarios.map((m) => (m === 'deltoides' ? cabeza : m))), ej.id);
  }

  // Las rutinas YA generadas (ejercicio_asignado) para esos mismos 5
  // ejercicios tambien pasan a trackearse por cabeza especifica, para que
  // el Progreso de una rutina activa se ponga al dia sin que el usuario
  // tenga que regenerarla.
  const getAsignadosDeDeltoidesViejo = db.prepare(`
    SELECT ea.id, e.nombre AS ejercicio_nombre
    FROM ejercicio_asignado ea JOIN ejercicio e ON e.id = ea.ejercicio_id
    WHERE ea.musculo_objetivo_id = ?
  `);
  const updateMusculoObjetivo = db.prepare('UPDATE ejercicio_asignado SET musculo_objetivo_id = ? WHERE id = ?');
  for (const ea of getAsignadosDeDeltoidesViejo.all(deltoidesViejo.id)) {
    const cabeza = primarioPorNombre[ea.ejercicio_nombre];
    if (cabeza) updateMusculoObjetivo.run(idPorCabeza[cabeza], ea.id);
  }
}
migrarDeltoides();

console.log('Migracion aplicada correctamente.');
