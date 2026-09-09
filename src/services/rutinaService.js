import db from '../db/index.js';
import { armarRutina, rangoRepsPara, tagsDisponibles, SERIES_MINIMO } from './routineBuilder.js';

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
    equipamiento: {
      tipo: equipamiento.tipo,
      checklist: JSON.parse(equipamiento.checklist_json),
      musculosUbicacion: JSON.parse(equipamiento.musculos_ubicacion_json || '{}'),
    },
    exclusiones,
    duracionPorDia: JSON.parse(disponibilidad.duracion_sesion_json),
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

// Alternativa a crearRutina: el usuario elige el/los ejercicios de cada dia
// el mismo (en vez de que el motor los elija por equipamiento/exclusiones).
// Solo requiere el objetivo ya cargado (para calcular rango de reps por
// ejercicio) - no pasa por disponibilidad/equipamiento/exclusiones, esos
// filtros son justamente lo que esta modalidad deja en manos del usuario.
// dias: [{ dia_semana, ejercicios: [ejercicio_id, ...] }, ...] ya validado
// por la ruta (2-6 dias, ids validos, sin duplicados dentro del dia).
export const crearRutinaManual = db.transaction((usuarioId, { dias }) => {
  const objetivo = getObjetivo.get(usuarioId);
  if (!objetivo) {
    throw new Error('Falta completar el objetivo antes de crear una rutina.');
  }

  desactivarRutinasPrevias.run(usuarioId);
  const { lastInsertRowid: rutinaId } = insertRutina.run({ usuario_id: usuarioId, split_asignado: 'Rutina personalizada' });

  dias.forEach((dia, idx) => {
    const catalogos = dia.ejercicios.map((ejercicioId) => {
      const catalogo = getEjercicioCatalogo.get(ejercicioId);
      if (!catalogo || !catalogo.activo) throw new Error(`Ejercicio ${ejercicioId} no encontrado.`);
      return catalogo;
    });

    // Por musculo, el ejercicio "top" es el que suma la serie extra si el
    // musculo se estanca (ver progressionEngine) - mismo criterio que el
    // generador automatico: prioriza el compuesto, si no el primero elegido.
    const topPorMusculo = new Map();
    for (const c of catalogos) {
      const actual = topPorMusculo.get(c.musculo_nombre);
      if (!actual || (c.tipo === 'compuesto' && actual.tipo !== 'compuesto')) {
        topPorMusculo.set(c.musculo_nombre, c);
      }
    }

    const { lastInsertRowid: diaRutinaId } = insertDiaRutina.run({
      rutina_id: rutinaId,
      numero_dia: idx + 1,
      dia_semana: dia.dia_semana,
      musculos_trabajados_json: JSON.stringify([...new Set(catalogos.map((c) => c.musculo_nombre))]),
    });

    catalogos.forEach((catalogo, i) => {
      const rango = rangoRepsPara({
        musculo: catalogo.musculo_nombre,
        objetivo: objetivo.tipo,
        esCompuestoPrincipalFuerza: Boolean(catalogo.es_compuesto_principal_fuerza),
        region: catalogo.musculo_region,
      });
      insertEjercicioAsignado.run({
        dia_rutina_id: diaRutinaId,
        ejercicio_id: catalogo.id,
        orden: i + 1,
        es_top_de_musculo: topPorMusculo.get(catalogo.musculo_nombre) === catalogo ? 1 : 0,
        musculo_objetivo_id: catalogo.musculo_primario_id,
        series_actuales: 2,
        rango_reps_min: rango.min,
        rango_reps_max: rango.max,
      });
    });
  });

  insertMicrociclo.run(rutinaId, 0);
  return obtenerRutinaActiva(usuarioId);
});

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

const getEjercicioCatalogo = db.prepare(`
  SELECT e.*, m.nombre AS musculo_nombre, m.region AS musculo_region
  FROM ejercicio e JOIN musculo m ON m.id = e.musculo_primario_id
  WHERE e.id = ?
`);
const getMicrocicloEnCurso = db.prepare("SELECT * FROM microciclo WHERE rutina_id = ? AND numero >= 1 AND estado = 'en_curso'");
const getMusculoNombrePorId = db.prepare('SELECT nombre FROM musculo WHERE id = ?');
const insertRegistroSesionSustitucion = db.prepare(`
  INSERT INTO registro_sesion (usuario_id, dia_rutina_id, fecha, salteada, microciclo_id)
  VALUES (?, ?, date('now'), 0, ?)
`);
const insertRegistroSerieSustitucion = db.prepare(`
  INSERT INTO registro_serie (registro_sesion_id, ejercicio_asignado_id, numero_serie, peso, reps)
  VALUES (?, ?, ?, ?, ?)
`);
const upsertProgresoEjercicioSustitucion = db.prepare(`
  INSERT INTO progreso_ejercicio_microciclo (ejercicio_asignado_id, microciclo_id, peso_prescrito, piso_reps, series_prescritas)
  VALUES (@ejercicio_asignado_id, @microciclo_id, @peso_prescrito, @piso_reps, @series_prescritas)
  ON CONFLICT(ejercicio_asignado_id, microciclo_id) DO UPDATE SET
    peso_prescrito = excluded.peso_prescrito, piso_reps = excluded.piso_reps, series_prescritas = excluded.series_prescritas,
    sem1_reps = NULL, sem2_reps = NULL, techo_reps = NULL, mejoro = NULL, serie_agregada = 0, nota = NULL
`);

// Validaciones compartidas por las dos variantes de sustitucion: el nuevo
// ejercicio existe, es del mismo musculo objetivo, y es compatible con el
// equipamiento actual del usuario.
function validarNuevoEjercicio(ea, usuarioId, nuevoEjercicioId) {
  const nuevo = getEjercicioCatalogo.get(nuevoEjercicioId);
  if (!nuevo) throw new Error('Ejercicio destino no encontrado.');
  if (nuevo.musculo_primario_id !== ea.musculo_objetivo_id) {
    throw new Error('El nuevo ejercicio debe ser del mismo musculo objetivo.');
  }

  const equipamiento = getEquipamiento.get(usuarioId);
  const musculoNombre = getMusculoNombrePorId.get(ea.musculo_objetivo_id).nombre;
  const tags = tagsDisponibles({
    tipo: equipamiento.tipo,
    checklist: JSON.parse(equipamiento.checklist_json),
    musculo: musculoNombre,
    musculosUbicacion: JSON.parse(equipamiento.musculos_ubicacion_json || '{}'),
  });
  const requeridos = JSON.parse(nuevo.equipamiento_requerido_json);
  if (!requeridos.every((tag) => tags.has(tag))) {
    throw new Error('El nuevo ejercicio no es compatible con tu equipamiento disponible.');
  }

  // Puede haber mas de un ejercicio por musculo en el mismo dia (ver
  // armarRutina), asi que hay que evitar terminar con el mismo ejercicio
  // repetido dos veces en un mismo dia al sustituir.
  const yaUsadoEnElDia = db.prepare(
    'SELECT 1 FROM ejercicio_asignado WHERE dia_rutina_id = ? AND id != ? AND ejercicio_id = ?'
  ).get(ea.dia_rutina_id, ea.id, nuevoEjercicioId);
  if (yaUsadoEnElDia) {
    throw new Error('Ese ejercicio ya esta asignado en otro musculo de este mismo dia.');
  }

  return { nuevo, musculoNombre };
}

// Sustituye un ejercicio a mitad de rutina por otro del pool (mismo musculo,
// dentro del equipamiento disponible). Pasa por su propio mini-testeo de 2
// series: el piso resultante rige el resto del microciclo en curso, tal
// como si fuera una semana 0 acotada a ese ejercicio.
export const sustituirEjercicio = db.transaction(({ ejercicioAsignadoId, usuarioId, nuevoEjercicioId, peso, repsSerie1, repsSerie2 }) => {
  const ea = db.prepare('SELECT * FROM ejercicio_asignado WHERE id = ?').get(ejercicioAsignadoId);
  const { nuevo, musculoNombre } = validarNuevoEjercicio(ea, usuarioId, nuevoEjercicioId);

  const dia = db.prepare('SELECT dr.rutina_id, dr.id AS dia_rutina_id FROM dia_rutina dr WHERE dr.id = ?').get(ea.dia_rutina_id);
  const microciclo = getMicrocicloEnCurso.get(dia.rutina_id);
  if (!microciclo) throw new Error('No hay un microciclo en curso donde aplicar la sustitucion.');

  const objetivo = getObjetivo.get(usuarioId);
  const rango = rangoRepsPara({
    musculo: musculoNombre,
    objetivo: objetivo.tipo,
    esCompuestoPrincipalFuerza: Boolean(nuevo.es_compuesto_principal_fuerza),
    region: nuevo.musculo_region,
  });

  db.prepare('UPDATE ejercicio_asignado SET ejercicio_id = ?, rango_reps_min = ?, rango_reps_max = ?, peso_actual = ? WHERE id = ?')
    .run(nuevoEjercicioId, rango.min, rango.max, peso, ejercicioAsignadoId);

  const seriesActuales = ea.series_actuales || SERIES_MINIMO;
  upsertProgresoEjercicioSustitucion.run({
    ejercicio_asignado_id: ejercicioAsignadoId, microciclo_id: microciclo.id,
    peso_prescrito: peso, piso_reps: repsSerie2, series_prescritas: seriesActuales,
  });

  const { lastInsertRowid: sesionId } = insertRegistroSesionSustitucion.run(usuarioId, dia.dia_rutina_id, microciclo.id);
  insertRegistroSerieSustitucion.run(sesionId, ejercicioAsignadoId, 1, peso, repsSerie1);
  insertRegistroSerieSustitucion.run(sesionId, ejercicioAsignadoId, 2, peso, repsSerie2);

  return { ejercicio_asignado_id: ejercicioAsignadoId, nuevo_ejercicio_id: nuevoEjercicioId, rango_reps_min: rango.min, rango_reps_max: rango.max };
});

const getMicrociclo0EnCurso = db.prepare("SELECT * FROM microciclo WHERE rutina_id = ? AND numero = 0 AND estado = 'en_curso'");

// Version simple de sustituirEjercicio para antes de guardar la semana 0:
// todavia no hay ningun peso/reps cargado para este slot (el usuario los va
// a completar el mismo, para el ejercicio nuevo, en el propio formulario de
// semana 0), asi que solo hace falta cambiar el ejercicio_id y recalcular su
// rango de reps - sin mini-testeo ni registro_sesion.
export const sustituirEjercicioPreTesteo = db.transaction(({ ejercicioAsignadoId, usuarioId, nuevoEjercicioId }) => {
  const ea = db.prepare('SELECT * FROM ejercicio_asignado WHERE id = ?').get(ejercicioAsignadoId);
  const { nuevo, musculoNombre } = validarNuevoEjercicio(ea, usuarioId, nuevoEjercicioId);

  const dia = db.prepare('SELECT rutina_id FROM dia_rutina WHERE id = ?').get(ea.dia_rutina_id);
  const microciclo0 = getMicrociclo0EnCurso.get(dia.rutina_id);
  if (!microciclo0) throw new Error('Solo se puede cambiar el ejercicio antes de guardar la semana 0.');

  const objetivo = getObjetivo.get(usuarioId);
  const rango = rangoRepsPara({
    musculo: musculoNombre,
    objetivo: objetivo.tipo,
    esCompuestoPrincipalFuerza: Boolean(nuevo.es_compuesto_principal_fuerza),
    region: nuevo.musculo_region,
  });

  db.prepare('UPDATE ejercicio_asignado SET ejercicio_id = ?, rango_reps_min = ?, rango_reps_max = ? WHERE id = ?')
    .run(nuevoEjercicioId, rango.min, rango.max, ejercicioAsignadoId);

  return { ejercicio_asignado_id: ejercicioAsignadoId, nuevo_ejercicio_id: nuevoEjercicioId, rango_reps_min: rango.min, rango_reps_max: rango.max };
});
