import db from '../index.js';
import { musculos } from './musculos.js';
import { ejercicios } from './ejercicios.js';

const insertMusculo = db.prepare(
  'INSERT INTO musculo (nombre, region) VALUES (@nombre, @region) ON CONFLICT(nombre) DO UPDATE SET region = excluded.region'
);
const insertVolumen = db.prepare(
  `INSERT INTO referencia_volumen_muscular (musculo_id, mev, mav, mrv) VALUES (@musculo_id, @mev, @mav, @mrv)
   ON CONFLICT(musculo_id) DO UPDATE SET mev = excluded.mev, mav = excluded.mav, mrv = excluded.mrv`
);
const getMusculoId = db.prepare('SELECT id FROM musculo WHERE nombre = ?');

const insertEjercicio = db.prepare(`
  INSERT INTO ejercicio (
    nombre, musculo_primario_id, musculos_secundarios_json, tipo, patron_movimiento,
    equipamiento_requerido_json, es_unilateral, es_compuesto_principal_fuerza
  ) VALUES (
    @nombre, @musculo_primario_id, @musculos_secundarios_json, @tipo, @patron_movimiento,
    @equipamiento_requerido_json, @es_unilateral, @es_compuesto_principal_fuerza
  )
`);
const existeEjercicio = db.prepare('SELECT id FROM ejercicio WHERE nombre = ?');

const seedMusculos = db.transaction(() => {
  for (const m of musculos) {
    insertMusculo.run(m);
    const { id: musculo_id } = getMusculoId.get(m.nombre);
    insertVolumen.run({ musculo_id, mev: m.mev, mav: m.mav, mrv: m.mrv });
  }
});

const seedEjercicios = db.transaction(() => {
  for (const e of ejercicios) {
    if (existeEjercicio.get(e.nombre)) continue;
    const primario = getMusculoId.get(e.musculo_primario);
    if (!primario) throw new Error(`Musculo desconocido: ${e.musculo_primario}`);
    insertEjercicio.run({
      nombre: e.nombre,
      musculo_primario_id: primario.id,
      musculos_secundarios_json: JSON.stringify(e.musculos_secundarios || []),
      tipo: e.tipo,
      patron_movimiento: e.patron_movimiento,
      equipamiento_requerido_json: JSON.stringify(e.equipamiento_requerido || []),
      es_unilateral: e.es_unilateral ? 1 : 0,
      es_compuesto_principal_fuerza: e.es_compuesto_principal_fuerza ? 1 : 0,
    });
  }
});

seedMusculos();
seedEjercicios();

console.log(`Seed OK: ${musculos.length} musculos, ${ejercicios.length} ejercicios.`);
