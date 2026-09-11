import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import db from './index.js';
import { musculos } from './seed/musculos.js';
import { ejercicios } from './seed/ejercicios.js';

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
  { tabla: 'dia_rutina', columna: 'comentario', definicion: 'TEXT' },
  { tabla: 'dia_rutina', columna: 'comentario_recordar', definicion: 'INTEGER NOT NULL DEFAULT 0' },
  { tabla: 'ejercicio_asignado', columna: 'comentario', definicion: 'TEXT' },
  { tabla: 'ejercicio_asignado', columna: 'comentario_recordar', definicion: 'INTEGER NOT NULL DEFAULT 0' },
  { tabla: 'microciclo', columna: 'tipo', definicion: "TEXT NOT NULL DEFAULT 'normal'" },
  { tabla: 'registro_serie', columna: 'es_dropset', definicion: 'INTEGER NOT NULL DEFAULT 0' },
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

// Abductores/aductores/lumbares son musculos nuevos que no reemplazan nada
// existente (a diferencia del deltoides) - solo hay que insertarlos junto
// con sus ejercicios de catalogo si la base ya estaba seedeada antes de
// este cambio. Idempotente igual que migrarDeltoides, corre en cada arranque.
function agregarMusculosNuevos() {
  const getMusculoPorNombre = db.prepare('SELECT id FROM musculo WHERE nombre = ?');
  const insertMusculo = db.prepare('INSERT INTO musculo (nombre, region) VALUES (?, ?) ON CONFLICT(nombre) DO NOTHING');
  const insertVolumen = db.prepare(
    'INSERT INTO referencia_volumen_muscular (musculo_id, mev, mav, mrv) VALUES (?, ?, ?, ?) ON CONFLICT(musculo_id) DO NOTHING'
  );

  const nombresNuevos = ['abductores', 'aductores', 'lumbares'];
  const idPorMusculo = {};
  for (const nombre of nombresNuevos) {
    const m = musculos.find((x) => x.nombre === nombre);
    insertMusculo.run(m.nombre, m.region);
    idPorMusculo[m.nombre] = getMusculoPorNombre.get(m.nombre).id;
    insertVolumen.run(idPorMusculo[m.nombre], m.mev, m.mav, m.mrv);
  }

  const existeEjercicio = db.prepare('SELECT id FROM ejercicio WHERE nombre = ?');
  const insertEjercicio = db.prepare(`
    INSERT INTO ejercicio (
      nombre, musculo_primario_id, musculos_secundarios_json, tipo, patron_movimiento,
      equipamiento_requerido_json, es_unilateral, es_compuesto_principal_fuerza
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const e of ejercicios) {
    if (!nombresNuevos.includes(e.musculo_primario) || existeEjercicio.get(e.nombre)) continue;
    insertEjercicio.run(
      e.nombre, idPorMusculo[e.musculo_primario], JSON.stringify(e.musculos_secundarios || []),
      e.tipo, e.patron_movimiento, JSON.stringify(e.equipamiento_requerido || []),
      e.es_unilateral ? 1 : 0, e.es_compuesto_principal_fuerza ? 1 : 0
    );
  }
}
agregarMusculosNuevos();

// El microciclo 0 siempre fue "la semana de testeo", pero recien ahora eso
// quedo explicito en una columna (tipo) en vez de estar implicito en
// numero===0 - hace falta para poder distinguir una semana de testeo
// PEDIDA DE NUEVO mas adelante en la rutina (que no es numero 0) de un
// microciclo normal. Retroactivo e idempotente.
function marcarTesteoInicialRetroactivo() {
  db.exec("UPDATE microciclo SET tipo = 'testeo' WHERE numero = 0 AND tipo != 'testeo'");
}
marcarTesteoInicialRetroactivo();

// deload.microciclo_asociado_id no tenia ON DELETE CASCADE - borrar una
// rutina que alguna vez tuvo una descarga marcada rompia con "FOREIGN KEY
// constraint failed" (el microciclo se borraba en cascada desde rutina,
// pero el deload que lo referenciaba quedaba huerfano bloqueando el borrado).
// SQLite no deja alterar un FK existente, asi que hay que reconstruir la
// tabla - solo si todavia no tiene el cascade (idempotente).
function fixDeloadCascade() {
  const yaTieneCascade = db.prepare('PRAGMA foreign_key_list(deload)').all()
    .some((fk) => fk.table === 'microciclo' && fk.on_delete === 'CASCADE');
  if (yaTieneCascade) return;

  db.exec(`
    ALTER TABLE deload RENAME TO deload_old;
    CREATE TABLE deload (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      fecha TEXT NOT NULL DEFAULT (date('now')),
      microciclo_asociado_id INTEGER REFERENCES microciclo(id) ON DELETE CASCADE,
      detalle_json TEXT NOT NULL DEFAULT '{}'
    );
    INSERT INTO deload (id, usuario_id, fecha, microciclo_asociado_id, detalle_json)
      SELECT id, usuario_id, fecha, microciclo_asociado_id, detalle_json FROM deload_old;
    DROP TABLE deload_old;
  `);
}
fixDeloadCascade();

// "Lineal forzado" (modo por ejercicio que evitaba que el peso bajara solo
// si no se llegaba al minimo de reps) se saco por confuso: la baja de
// rendimiento entre series manteniendo el mismo peso es la expectativa
// normal, no algo que necesite un modo aparte. Columna vieja, sin uso.
function sacarColumnaLinealForzado() {
  const existe = db.prepare('PRAGMA table_info(ejercicio_asignado)').all()
    .some((c) => c.name === 'modo_lineal_forzado');
  if (!existe) return;
  db.exec('ALTER TABLE ejercicio_asignado DROP COLUMN modo_lineal_forzado');
}
sacarColumnaLinealForzado();

console.log('Migracion aplicada correctamente.');
