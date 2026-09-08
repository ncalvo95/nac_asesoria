import db from '../db/index.js';
import { armarRutina } from './routineBuilder.js';

const getObjetivo = db.prepare('SELECT * FROM objetivo WHERE usuario_id = ?');
const getDisponibilidad = db.prepare('SELECT * FROM disponibilidad WHERE usuario_id = ?');
const getEquipamiento = db.prepare('SELECT * FROM equipamiento WHERE usuario_id = ?');
const getExclusiones = db.prepare(
  "SELECT ejercicio_id FROM preferencia_ejercicio_usuario WHERE usuario_id = ? AND tipo = 'exclusion' AND ejercicio_id IS NOT NULL"
);
const getMusculoId = db.prepare('SELECT id FROM musculo WHERE nombre = ?');

const insertRutina = db.prepare(`
  INSERT INTO rutina (usuario_id, split_asignado, fecha_inicio, estado) VALUES (@usuario_id, @split_asignado, date('now'), 'activa')
`);
const insertDiaRutina = db.prepare(`
  INSERT INTO dia_rutina (rutina_id, numero_dia, dia_semana, musculos_trabajados_json)
  VALUES (@rutina_id, @numero_dia, @dia_semana, @musculos_trabajados_json)
`);
const insertEjercicioAsignado = db.prepare(`
  INSERT INTO ejercicio_asignado (
    dia_rutina_id, ejercicio_id, orden, es_top_de_musculo, musculo_objetivo_id,
    series_actuales, peso_actual, rango_reps_min, rango_reps_max, modo_lineal_forzado
  ) VALUES (
    @dia_rutina_id, @ejercicio_id, @orden, @es_top_de_musculo, @musculo_objetivo_id,
    @series_actuales, NULL, @rango_reps_min, @rango_reps_max, 0
  )
`);
const insertMicrociclo = db.prepare(`
  INSERT INTO microciclo (rutina_id, numero, fecha_inicio, estado) VALUES (?, ?, date('now'), 'en_curso')
`);
const desactivarRutinasPrevias = db.prepare(
  "UPDATE rutina SET estado = 'finalizada' WHERE usuario_id = ? AND estado = 'activa'"
);

// Genera y persiste una rutina nueva para el usuario, en base al perfil ya
// cargado (objetivo, disponibilidad, equipamiento, exclusiones). Finaliza
// cualquier rutina activa previa. Crea el microciclo 0 (semana de testeo).
export const crearRutina = db.transaction((usuarioId) => {
  const objetivo = getObjetivo.get(usuarioId);
  const disponibilidad = getDisponibilidad.get(usuarioId);
  const equipamiento = getEquipamiento.get(usuarioId);
  if (!objetivo || !disponibilidad || !equipamiento) {
    throw new Error('Falta completar objetivo, disponibilidad o equipamiento antes de generar la rutina.');
  }

  const diasEspecificos = JSON.parse(disponibilidad.dias_especificos_json);
  const exclusiones = getExclusiones.all(usuarioId).map((r) => r.ejercicio_id);

  const rutinaPorDia = armarRutina({
    diasEspecificos,
    objetivo: objetivo.tipo,
    equipamiento: { tipo: equipamiento.tipo, checklist: JSON.parse(equipamiento.checklist_json) },
    exclusiones,
  });

  desactivarRutinasPrevias.run(usuarioId);

  const splitNombre = describirSplit(diasEspecificos.length, rutinaPorDia);
  const { lastInsertRowid: rutinaId } = insertRutina.run({ usuario_id: usuarioId, split_asignado: splitNombre });

  for (const dia of rutinaPorDia) {
    const { lastInsertRowid: diaRutinaId } = insertDiaRutina.run({
      rutina_id: rutinaId,
      numero_dia: dia.numero_dia,
      dia_semana: dia.dia_semana,
      musculos_trabajados_json: JSON.stringify(dia.ejercicios.map((e) => e.musculo)),
    });

    for (const ej of dia.ejercicios) {
      insertEjercicioAsignado.run({
        dia_rutina_id: diaRutinaId,
        ejercicio_id: ej.ejercicio_id,
        orden: ej.orden,
        es_top_de_musculo: ej.es_top_de_musculo ? 1 : 0,
        musculo_objetivo_id: getMusculoId.get(ej.musculo).id,
        series_actuales: 2,
        rango_reps_min: ej.rango_reps_min,
        rango_reps_max: ej.rango_reps_max,
      });
    }
  }

  insertMicrociclo.run(rutinaId, 0);

  return obtenerRutinaActiva(usuarioId);
});

function describirSplit(nDias, rutinaPorDia) {
  const tipos = [...new Set(rutinaPorDia.map((d) => d.nombre_tipo))];
  return `${nDias} dias/semana - ${tipos.join('/')}`;
}

export function obtenerRutinaActiva(usuarioId) {
  const rutina = db.prepare("SELECT * FROM rutina WHERE usuario_id = ? AND estado = 'activa'").get(usuarioId);
  if (!rutina) return null;

  const dias = db.prepare('SELECT * FROM dia_rutina WHERE rutina_id = ? ORDER BY numero_dia').all(rutina.id);
  const ejerciciosStmt = db.prepare(`
    SELECT ea.*, e.nombre AS ejercicio_nombre, m.nombre AS musculo_nombre
    FROM ejercicio_asignado ea
    JOIN ejercicio e ON e.id = ea.ejercicio_id
    JOIN musculo m ON m.id = ea.musculo_objetivo_id
    WHERE ea.dia_rutina_id = ?
    ORDER BY ea.orden
  `);
  const microciclos = db.prepare('SELECT * FROM microciclo WHERE rutina_id = ? ORDER BY numero').all(rutina.id);

  return {
    ...rutina,
    dias: dias.map((d) => ({ ...d, ejercicios: ejerciciosStmt.all(d.id) })),
    microciclos,
  };
}

export function reordenarEjercicios(diaRutinaId, orden) {
  const update = db.prepare('UPDATE ejercicio_asignado SET orden = ? WHERE id = ? AND dia_rutina_id = ?');
  const tx = db.transaction((items) => {
    for (const { ejercicio_asignado_id, orden: nuevoOrden } of items) {
      update.run(nuevoOrden, ejercicio_asignado_id, diaRutinaId);
    }
  });
  tx(orden);
}
