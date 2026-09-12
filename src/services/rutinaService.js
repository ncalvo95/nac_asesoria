import db from '../db/index.js';
import {
  armarDia, armarRutina, armarSecuenciaDeDias, elegirEjercicioTop, ORDEN_DIAS,
  rangoRepsPara, tagsDisponibles, topeSeriesPara, SERIES_MINIMO,
} from './routineBuilder.js';
import { aplicarDisponibilidad } from './perfilService.js';

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
// El descanso por defecto es 90s, salvo que el ejercicio sea unilateral (ya
// sea por el flag del catalogo, o porque el nombre -incluidos los
// "particulares" que carga el usuario a mano- dice "unilateral"), en cuyo
// caso arranca en 60s - se puede editar despues igual (PATCH /descanso).
const DESCANSO_SEGUNDOS_SQL = `(
  SELECT CASE WHEN es_unilateral = 1 OR nombre LIKE '%unilateral%' THEN 60 ELSE 90 END
  FROM ejercicio WHERE id = @ejercicio_id
)`;
const insertEjercicioAsignado = db.prepare(`
  INSERT INTO ejercicio_asignado (
    dia_rutina_id, ejercicio_id, orden, es_top_de_musculo, musculo_objetivo_id,
    series_actuales, peso_actual, rango_reps_min, rango_reps_max, descanso_segundos
  ) VALUES (
    @dia_rutina_id, @ejercicio_id, @orden, @es_top_de_musculo, @musculo_objetivo_id,
    @series_actuales, NULL, @rango_reps_min, @rango_reps_max, ${DESCANSO_SEGUNDOS_SQL}
  )
`);
// Siempre numero=0, la semana de testeo inicial de una rutina recien creada
// (las 3 formas de armar rutina la llaman igual) - tipo='testeo' fijo.
const insertMicrociclo = db.prepare(`
  INSERT INTO microciclo (rutina_id, numero, fecha_inicio, estado, tipo) VALUES (?, ?, date('now'), 'en_curso', 'testeo')
`);
const desactivarRutinasPrevias = db.prepare(
  "UPDATE rutina SET estado = 'finalizada' WHERE usuario_id = ? AND estado = 'activa'"
);

// Persiste el resultado de armarRutina (dias + ejercicios) para una rutina
// ya creada - compartido por crearRutina y crearRutinaConSplit, que solo
// difieren en como arman "rutinaPorDia" (split fijo vs elegido a mano).
function persistirDias(rutinaId, rutinaPorDia) {
  for (const dia of rutinaPorDia) {
    // dia.musculos: solo lo trae el modo "diferir ejercicios" de
    // crearRutinaConSplit (dias sin ejercicios todavia) - el resto de los
    // modos derivan los musculos trabajados de los ejercicios ya elegidos.
    const musculos = dia.musculos ?? dia.ejercicios.map((e) => e.musculo);
    const { lastInsertRowid: diaRutinaId } = insertDiaRutina.run({
      rutina_id: rutinaId,
      numero_dia: dia.numero_dia,
      dia_semana: dia.dia_semana,
      musculos_trabajados_json: JSON.stringify(musculos),
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
}

// Genera y persiste una rutina nueva para el usuario, en base al perfil ya
// cargado (objetivo, disponibilidad, equipamiento, exclusiones). Finaliza
// cualquier rutina activa previa. Crea el microciclo 0 (semana de testeo).
export const crearRutina = db.transaction((usuarioId, varianteSplit = 'upper_lower') => {
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
    varianteSplit,
  });

  desactivarRutinasPrevias.run(usuarioId);

  const splitNombre = describirSplit(diasEspecificos.length, rutinaPorDia);
  const { lastInsertRowid: rutinaId } = insertRutina.run({ usuario_id: usuarioId, split_asignado: splitNombre });
  persistirDias(rutinaId, rutinaPorDia);
  insertMicrociclo.run(rutinaId, 0);

  return obtenerRutinaActiva(usuarioId);
});

function describirSplit(nDias, rutinaPorDia) {
  const tipos = [...new Set(rutinaPorDia.map((d) => d.nombre_tipo))];
  return `${nDias} dias/semana - ${tipos.join('/')}`;
}

// Alternativa a crearRutina: el usuario elige el split (que musculos va cada
// dia) y el motor sigue eligiendo los ejercicios dentro de cada uno (a
// diferencia de crearRutinaManual, donde el usuario tambien elige los
// ejercicios). No pasa por disponibilidad (mismo criterio que
// crearRutinaManual: el split ya lo define el propio "dias" del payload) -
// si requiere equipamiento, porque el motor SI filtra por el al elegir.
// dias: [{ dia_semana, musculos: [...], duracion_minutos }] ya validado por
// la ruta.
// diferirEjercicios: en vez de que el motor elija los ejercicios de una,
// los dias quedan armados solo con sus musculos - el usuario los va
// agregando el mismo despues, desde Entrenamiento (agregarEjercicioADia),
// a su propio ritmo. Pasa igual por la semana 0 de testeo (queda vacia,
// sin nada que testear) y arranca el microciclo 1 sin ejercicios; cada uno
// que se agregue ahi pide su propia serie de referencia (ver
// registrarReferenciaEjercicioNuevo), asi que no hace falta otro testeo.
export const crearRutinaConSplit = db.transaction((usuarioId, { dias, diferirEjercicios = false }) => {
  const objetivo = getObjetivo.get(usuarioId);
  const equipamiento = getEquipamiento.get(usuarioId);
  if (!objetivo || !equipamiento) {
    throw new Error('Falta completar objetivo o equipamiento antes de generar la rutina.');
  }

  let rutinaPorDia;
  if (diferirEjercicios) {
    rutinaPorDia = dias.map((d, idx) => ({ numero_dia: idx + 1, dia_semana: d.dia_semana, musculos: d.musculos, ejercicios: [] }));
  } else {
    const exclusiones = getExclusiones.all(usuarioId).map((r) => r.ejercicio_id);
    const diasEspecificos = dias.map((d) => d.dia_semana);
    const duracionPorDia = Object.fromEntries(dias.map((d) => [d.dia_semana, d.duracion_minutos]));
    const secuenciaPersonalizada = dias.map((d) => ({ dia_semana: d.dia_semana, musculos: d.musculos }));

    rutinaPorDia = armarRutina({
      diasEspecificos,
      objetivo: objetivo.tipo,
      equipamiento: {
        tipo: equipamiento.tipo,
        checklist: JSON.parse(equipamiento.checklist_json),
        musculosUbicacion: JSON.parse(equipamiento.musculos_ubicacion_json || '{}'),
      },
      exclusiones,
      duracionPorDia,
      secuenciaPersonalizada,
    });
  }

  desactivarRutinasPrevias.run(usuarioId);
  const { lastInsertRowid: rutinaId } = insertRutina.run({ usuario_id: usuarioId, split_asignado: 'Split personalizado' });
  persistirDias(rutinaId, rutinaPorDia);
  insertMicrociclo.run(rutinaId, 0);

  return obtenerRutinaActiva(usuarioId);
});

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

  const dias = db.prepare("SELECT * FROM dia_rutina WHERE rutina_id = ? AND activo = 1 ORDER BY numero_dia").all(rutina.id);
  const microciclos = db.prepare('SELECT * FROM microciclo WHERE rutina_id = ? ORDER BY numero').all(rutina.id);
  const microcicloActual = microciclos.find((m) => m.estado === 'en_curso');

  // piso_reps del microciclo en curso: el piso de referencia contra el que
  // se compara el techo al cerrar - se manda al frontend para mostrarlo
  // como sugerencia en gris en la 1ra serie (ver construirEstadoInicial en
  // EntrenamientoPage.jsx), no como valor precargado.
  const ejerciciosStmt = db.prepare(`
    SELECT ea.*, e.nombre AS ejercicio_nombre, e.patron_movimiento, m.nombre AS musculo_nombre, pem.piso_reps,
      EXISTS(SELECT 1 FROM registro_serie rs WHERE rs.ejercicio_asignado_id = ea.id) AS tiene_series
    FROM ejercicio_asignado ea
    JOIN ejercicio e ON e.id = ea.ejercicio_id
    JOIN musculo m ON m.id = ea.musculo_objetivo_id
    LEFT JOIN progreso_ejercicio_microciclo pem
      ON pem.ejercicio_asignado_id = ea.id AND pem.microciclo_id = ?
    WHERE ea.dia_rutina_id = ?
    ORDER BY ea.orden
  `);

  return {
    ...rutina,
    dias: dias.map((d) => ({ ...d, ejercicios: ejerciciosStmt.all(microcicloActual?.id ?? -1, d.id) })),
    microciclos,
  };
}

// Historial de rutinas del usuario (activa + finalizadas) para la pantalla
// "Mis rutinas" - un resumen liviano, sin dias/ejercicios completos.
export function listarRutinas(usuarioId) {
  const rutinas = db.prepare('SELECT * FROM rutina WHERE usuario_id = ? ORDER BY id DESC').all(usuarioId);
  const contarDias = db.prepare('SELECT COUNT(*) AS n FROM dia_rutina WHERE rutina_id = ?');
  const ultimoMicrociclo = db.prepare('SELECT MAX(numero) AS n FROM microciclo WHERE rutina_id = ?');
  return rutinas.map((r) => ({
    ...r,
    cantidad_dias: contarDias.get(r.id).n,
    ultimo_microciclo: ultimoMicrociclo.get(r.id).n,
  }));
}

// Vuelve a poner como activa una rutina finalizada (finaliza la que este
// activa en ese momento, si hay una - mismo mecanismo que crear una rutina
// nueva). No toca el estado de sus microciclos: retoma donde haya quedado.
export const reactivarRutina = db.transaction((rutinaId, usuarioId) => {
  const rutina = db.prepare('SELECT * FROM rutina WHERE id = ?').get(rutinaId);
  if (!rutina) throw new Error('Rutina no encontrada.');
  if (rutina.estado === 'activa') return;
  desactivarRutinasPrevias.run(usuarioId);
  db.prepare("UPDATE rutina SET estado = 'activa' WHERE id = ?").run(rutinaId);
});

// Borra una rutina para siempre (dias, ejercicios asignados, microciclos e
// historial de sesiones/series caen en cascada). Se puede borrar tambien la
// activa - si era la unica, el usuario simplemente queda sin rutina, que ya
// es un estado que el resto de la app maneja bien (HomePage/CoachPage lo
// mandan a onboarding, igual que a alguien que nunca genero una).
export function eliminarRutina(rutinaId) {
  const rutina = db.prepare('SELECT * FROM rutina WHERE id = ?').get(rutinaId);
  if (!rutina) throw new Error('Rutina no encontrada.');
  db.prepare('DELETE FROM rutina WHERE id = ?').run(rutinaId);
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

const insertEjercicioPersonalizado = db.prepare(`
  INSERT INTO ejercicio (nombre, musculo_primario_id, tipo, patron_movimiento, equipamiento_requerido_json, activo)
  VALUES (?, ?, 'aislado', 'personalizado', '[]', 1)
`);
const getMusculoPorId = db.prepare('SELECT nombre, region FROM musculo WHERE id = ?');

// Da de alta un ejercicio "particular" (no esta en el catalogo global ni en
// el de preferencias) con equipamiento_requerido_json vacio (siempre
// compatible), para el musculo indicado. Devuelve el mismo shape que
// getEjercicioCatalogo (con musculo_nombre/musculo_region via JOIN) para que
// el resto del codigo (rangoRepsPara, etc.) no tenga que distinguir de donde
// salio el ejercicio.
function crearEjercicioPersonalizado(nombre, musculoId) {
  const nombreLimpio = (nombre || '').trim();
  if (!nombreLimpio) throw new Error('El nombre del ejercicio no puede estar vacio.');
  const musculo = getMusculoPorId.get(musculoId);
  if (!musculo) throw new Error('Musculo no encontrado.');
  const { lastInsertRowid: ejercicioId } = insertEjercicioPersonalizado.run(nombreLimpio, musculoId);
  return getEjercicioCatalogo.get(ejercicioId);
}

// Corrige el nombre de un ejercicio "particular" ya cargado (por si se
// anoto mal) - solo estos, nunca uno del catalogo global/de preferencias
// (patron_movimiento = 'personalizado' es la marca que deja
// crearEjercicioPersonalizado). Como "ejercicio" es una tabla global
// (se reutiliza entre asignaciones, incluso de otros usuarios que lo hayan
// elegido despues), el nombre nuevo queda para todos los que lo usen.
export function renombrarEjercicioParticular(ejercicioAsignadoId, nuevoNombre) {
  const ea = db.prepare(`
    SELECT ea.ejercicio_id, e.patron_movimiento
    FROM ejercicio_asignado ea JOIN ejercicio e ON e.id = ea.ejercicio_id
    WHERE ea.id = ?
  `).get(ejercicioAsignadoId);
  if (!ea) throw new Error('Ejercicio asignado no encontrado.');
  if (ea.patron_movimiento !== 'personalizado') {
    throw new Error('Solo se puede editar el nombre de un ejercicio particular, no uno del catalogo.');
  }
  const nombreLimpio = (nuevoNombre || '').trim();
  if (!nombreLimpio) throw new Error('El nombre no puede estar vacio.');
  db.prepare('UPDATE ejercicio SET nombre = ? WHERE id = ?').run(nombreLimpio, ea.ejercicio_id);
  return { ejercicio_id: ea.ejercicio_id, nombre: nombreLimpio };
}

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

// Resuelve el ejercicio destino de una sustitucion: si viene nombrePersonalizado
// se da de alta un ejercicio nuevo para el mismo musculo objetivo (sin las
// validaciones de equipamiento/duplicado, que no aplican a uno recien
// creado); si no, es el flujo normal de elegir uno del catalogo.
function resolverEjercicioDestino({ ea, usuarioId, nuevoEjercicioId, nombrePersonalizado }) {
  if (nombrePersonalizado) {
    const nuevo = crearEjercicioPersonalizado(nombrePersonalizado, ea.musculo_objetivo_id);
    return { nuevo, musculoNombre: nuevo.musculo_nombre, nuevoEjercicioId: nuevo.id };
  }
  const { nuevo, musculoNombre } = validarNuevoEjercicio(ea, usuarioId, nuevoEjercicioId);
  return { nuevo, musculoNombre, nuevoEjercicioId };
}

// Sustituye un ejercicio a mitad de rutina por otro del pool (mismo musculo,
// dentro del equipamiento disponible). Pasa por su propio mini-testeo de 1
// serie de referencia (peso + reps): el piso resultante rige el resto del
// microciclo en curso, tal como si fuera una semana 0 acotada a ese ejercicio.
export const sustituirEjercicio = db.transaction(({ ejercicioAsignadoId, usuarioId, nuevoEjercicioId, nombrePersonalizado, peso, reps }) => {
  const ea = db.prepare('SELECT * FROM ejercicio_asignado WHERE id = ?').get(ejercicioAsignadoId);
  const { nuevo, musculoNombre, nuevoEjercicioId: destinoId } = resolverEjercicioDestino({ ea, usuarioId, nuevoEjercicioId, nombrePersonalizado });

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
    .run(destinoId, rango.min, rango.max, peso, ejercicioAsignadoId);

  const seriesActuales = ea.series_actuales || SERIES_MINIMO;
  upsertProgresoEjercicioSustitucion.run({
    ejercicio_asignado_id: ejercicioAsignadoId, microciclo_id: microciclo.id,
    peso_prescrito: peso, piso_reps: reps, series_prescritas: seriesActuales,
  });

  const { lastInsertRowid: sesionId } = insertRegistroSesionSustitucion.run(usuarioId, dia.dia_rutina_id, microciclo.id);
  insertRegistroSerieSustitucion.run(sesionId, ejercicioAsignadoId, 1, peso, reps);

  return { ejercicio_asignado_id: ejercicioAsignadoId, nuevo_ejercicio_id: destinoId, nuevo_ejercicio_nombre: nuevo.nombre, rango_reps_min: rango.min, rango_reps_max: rango.max };
});

const getMicrociclo0EnCurso = db.prepare("SELECT * FROM microciclo WHERE rutina_id = ? AND tipo = 'testeo' AND estado = 'en_curso'");

// Version simple de sustituirEjercicio para antes de guardar la semana 0:
// todavia no hay ningun peso/reps cargado para este slot (el usuario los va
// a completar el mismo, para el ejercicio nuevo, en el propio formulario de
// semana 0), asi que solo hace falta cambiar el ejercicio_id y recalcular su
// rango de reps - sin mini-testeo ni registro_sesion.
export const sustituirEjercicioPreTesteo = db.transaction(({ ejercicioAsignadoId, usuarioId, nuevoEjercicioId, nombrePersonalizado }) => {
  const ea = db.prepare('SELECT * FROM ejercicio_asignado WHERE id = ?').get(ejercicioAsignadoId);
  const { nuevo, musculoNombre, nuevoEjercicioId: destinoId } = resolverEjercicioDestino({ ea, usuarioId, nuevoEjercicioId, nombrePersonalizado });

  const dia = db.prepare('SELECT rutina_id FROM dia_rutina WHERE id = ?').get(ea.dia_rutina_id);
  const microciclo0 = getMicrociclo0EnCurso.get(dia.rutina_id);
  if (!microciclo0) throw new Error('Solo se puede cambiar el ejercicio antes de guardar los resultados de la semana de testeo.');

  const objetivo = getObjetivo.get(usuarioId);
  const rango = rangoRepsPara({
    musculo: musculoNombre,
    objetivo: objetivo.tipo,
    esCompuestoPrincipalFuerza: Boolean(nuevo.es_compuesto_principal_fuerza),
    region: nuevo.musculo_region,
  });

  db.prepare('UPDATE ejercicio_asignado SET ejercicio_id = ?, rango_reps_min = ?, rango_reps_max = ? WHERE id = ?')
    .run(destinoId, rango.min, rango.max, ejercicioAsignadoId);

  return { ejercicio_asignado_id: ejercicioAsignadoId, nuevo_ejercicio_id: destinoId, nuevo_ejercicio_nombre: nuevo.nombre, rango_reps_min: rango.min, rango_reps_max: rango.max };
});

const getMaxOrdenDia = db.prepare('SELECT COALESCE(MAX(orden), 0) AS maxOrden FROM ejercicio_asignado WHERE dia_rutina_id = ?');
const getDiaRutinaPorId = db.prepare('SELECT * FROM dia_rutina WHERE id = ?');
const hayEjercicioDelMusculoEnElDia = db.prepare(
  'SELECT 1 FROM ejercicio_asignado WHERE dia_rutina_id = ? AND musculo_objetivo_id = ?'
);
const insertEjercicioAsignadoExtra = db.prepare(`
  INSERT INTO ejercicio_asignado (
    dia_rutina_id, ejercicio_id, orden, es_top_de_musculo, musculo_objetivo_id,
    series_actuales, peso_actual, rango_reps_min, rango_reps_max, descanso_segundos
  ) VALUES (
    @dia_rutina_id, @ejercicio_id, @orden, @es_top_de_musculo, @musculo_objetivo_id,
    @series_actuales, NULL, @rango_reps_min, @rango_reps_max, ${DESCANSO_SEGUNDOS_SQL}
  )
`);

// Si el musculo ya esta presente ese dia, el nuevo ejercicio entra como
// EXTRA (no reemplaza nada, el "top" sigue siendo el que ya estaba). Si el
// musculo todavia no tenia ningun ejercicio ese dia -tipicamente porque no
// era parte del split original y se decide sumarlo sobre la marcha, durante
// el entrenamiento- el nuevo ejercicio pasa a ser el top de ese musculo ahi
// (y se suma al musculos_trabajados_json del dia, solo a fines
// informativos/exportacion). En cualquier caso arranca con
// series_actuales = SERIES_MINIMO y sin peso (a testear), como cualquier
// ejercicio agregado a mitad de rutina.
function calcularTopYActualizarDia(diaRutinaId, musculoId, musculoNombre) {
  const yaPresente = hayEjercicioDelMusculoEnElDia.get(diaRutinaId, musculoId);
  if (!yaPresente) {
    const dia = getDiaRutinaPorId.get(diaRutinaId);
    const musculos = new Set(JSON.parse(dia.musculos_trabajados_json));
    musculos.add(musculoNombre);
    db.prepare('UPDATE dia_rutina SET musculos_trabajados_json = ? WHERE id = ?').run(JSON.stringify([...musculos]), diaRutinaId);
  }
  return !yaPresente;
}

// Registra la serie de referencia (peso+reps) de un ejercicio recien
// agregado a mitad de rutina - mismo patron que sustituirEjercicio (1 serie
// de referencia, no un mini-testeo de 2), para que el piso de reps y el
// peso base queden fijados desde ya en el microciclo en curso, en vez de
// arrancar "a ciegas" hasta el primer cierre.
function registrarReferenciaEjercicioNuevo({ ejercicioAsignadoId, diaRutinaId, usuarioId, peso, reps, seriesActuales }) {
  // El peso siempre queda precargado, sea o no todavia semana de testeo.
  db.prepare('UPDATE ejercicio_asignado SET peso_actual = ? WHERE id = ?').run(peso, ejercicioAsignadoId);

  const dia = getDiaRutinaPorId.get(diaRutinaId);
  const microciclo = getMicrocicloEnCurso.get(dia.rutina_id);
  // Si todavia es la semana 0 (testeo), el ejercicio recien agregado entra
  // a la lista general de esa semana (Semana0Form ya lo precarga con este
  // mismo peso/reps) y pasa por registrarSemana0 como cualquier otro - no
  // hay microciclo 1 todavia donde fijar el piso de referencia.
  if (!microciclo) return;
  upsertProgresoEjercicioSustitucion.run({
    ejercicio_asignado_id: ejercicioAsignadoId, microciclo_id: microciclo.id,
    peso_prescrito: peso, piso_reps: reps, series_prescritas: seriesActuales,
  });
  const { lastInsertRowid: sesionId } = insertRegistroSesionSustitucion.run(usuarioId, diaRutinaId, microciclo.id);
  insertRegistroSerieSustitucion.run(sesionId, ejercicioAsignadoId, 1, peso, reps);
}

export const agregarEjercicioADia = db.transaction(({ diaRutinaId, usuarioId, musculoId, ejercicioId, peso, reps }) => {
  const nuevo = getEjercicioCatalogo.get(ejercicioId);
  if (!nuevo) throw new Error('Ejercicio no encontrado.');
  if (nuevo.musculo_primario_id !== musculoId) throw new Error('El ejercicio no es del musculo indicado.');

  const yaUsado = db.prepare('SELECT 1 FROM ejercicio_asignado WHERE dia_rutina_id = ? AND ejercicio_id = ?').get(diaRutinaId, ejercicioId);
  if (yaUsado) throw new Error('Ese ejercicio ya esta asignado en este dia.');

  const equipamiento = getEquipamiento.get(usuarioId);
  const tags = tagsDisponibles({
    tipo: equipamiento.tipo,
    checklist: JSON.parse(equipamiento.checklist_json),
    musculo: nuevo.musculo_nombre,
    musculosUbicacion: JSON.parse(equipamiento.musculos_ubicacion_json || '{}'),
  });
  const requeridos = JSON.parse(nuevo.equipamiento_requerido_json);
  if (!requeridos.every((tag) => tags.has(tag))) {
    throw new Error('El ejercicio no es compatible con tu equipamiento disponible.');
  }

  const objetivo = getObjetivo.get(usuarioId);
  const rango = rangoRepsPara({
    musculo: nuevo.musculo_nombre,
    objetivo: objetivo.tipo,
    esCompuestoPrincipalFuerza: Boolean(nuevo.es_compuesto_principal_fuerza),
    region: nuevo.musculo_region,
  });

  const esTop = calcularTopYActualizarDia(diaRutinaId, musculoId, nuevo.musculo_nombre);
  const { maxOrden } = getMaxOrdenDia.get(diaRutinaId);
  const info = insertEjercicioAsignadoExtra.run({
    dia_rutina_id: diaRutinaId, ejercicio_id: ejercicioId, orden: maxOrden + 1, es_top_de_musculo: esTop ? 1 : 0,
    musculo_objetivo_id: musculoId, series_actuales: SERIES_MINIMO, rango_reps_min: rango.min, rango_reps_max: rango.max,
  });
  registrarReferenciaEjercicioNuevo({ ejercicioAsignadoId: info.lastInsertRowid, diaRutinaId, usuarioId, peso, reps, seriesActuales: SERIES_MINIMO });
  return {
    id: info.lastInsertRowid, ejercicio_id: ejercicioId, ejercicio_nombre: nuevo.nombre,
    musculo_objetivo_id: musculoId, rango_reps_min: rango.min, rango_reps_max: rango.max,
    es_top_de_musculo: esTop, series_actuales: SERIES_MINIMO, peso_actual: peso, reps,
  };
});

// Igual que agregarEjercicioADia, pero para cuando el ejercicio que se
// quiere sumar no esta en el catalogo (ni el global del admin ni el de
// preferencias) - lo da de alta con equipamiento_requerido_json vacio
// (siempre compatible) y lo asigna en el mismo paso. Queda en el catalogo
// para poder reutilizarlo despues.
export const agregarEjercicioPersonalizadoADia = db.transaction(({ diaRutinaId, usuarioId, musculoId, nombre, peso, reps }) => {
  const nuevo = crearEjercicioPersonalizado(nombre, musculoId);

  const objetivo = getObjetivo.get(usuarioId);
  const rango = rangoRepsPara({
    musculo: nuevo.musculo_nombre,
    objetivo: objetivo.tipo,
    esCompuestoPrincipalFuerza: false,
    region: nuevo.musculo_region,
  });

  const esTop = calcularTopYActualizarDia(diaRutinaId, musculoId, nuevo.musculo_nombre);
  const { maxOrden } = getMaxOrdenDia.get(diaRutinaId);
  const info = insertEjercicioAsignadoExtra.run({
    dia_rutina_id: diaRutinaId, ejercicio_id: nuevo.id, orden: maxOrden + 1, es_top_de_musculo: esTop ? 1 : 0,
    musculo_objetivo_id: musculoId, series_actuales: SERIES_MINIMO, rango_reps_min: rango.min, rango_reps_max: rango.max,
  });
  registrarReferenciaEjercicioNuevo({ ejercicioAsignadoId: info.lastInsertRowid, diaRutinaId, usuarioId, peso, reps, seriesActuales: SERIES_MINIMO });
  return {
    id: info.lastInsertRowid, ejercicio_id: nuevo.id, ejercicio_nombre: nuevo.nombre,
    musculo_objetivo_id: musculoId, rango_reps_min: rango.min, rango_reps_max: rango.max,
    es_top_de_musculo: esTop, series_actuales: SERIES_MINIMO, peso_actual: peso, reps,
  };
});

// Inversa de agregarEjercicioADia - solo se puede sacar un ejercicio que NO
// sea el top de su musculo (el top se sustituye, nunca se saca sin
// reemplazo) y que todavia no tenga ninguna serie registrada (si ya
// entreno con el, sacarlo de golpe le haria perder ese historial).
// Se puede quitar el ejercicio "top" (principal) de un musculo, o incluso el
// unico ejercicio que le queda a ese musculo en el dia - el frontend avisa
// con una confirmacion en esos casos, pero el backend no lo bloquea: si era
// top y quedan otros ejercicios del mismo musculo, uno pasa a ser el nuevo
// top (reacomodarMusculoTrasQuitar); si no queda ninguno, el musculo se cae
// de musculos_trabajados_json.
// Si el ejercicio ya tiene series registradas, se pierden en cascada (ON
// DELETE CASCADE en registro_serie) - el frontend ya avisa fuerte de esto
// en la confirmacion (siempre pide confirmar para quitar un ejercicio, ver
// ConfirmarQuitarEjercicio en EntrenamientoPage.jsx) antes de llamar esto.
export const quitarEjercicioAsignado = db.transaction((ejercicioAsignadoId) => {
  const ea = db.prepare('SELECT * FROM ejercicio_asignado WHERE id = ?').get(ejercicioAsignadoId);
  if (!ea) throw new Error('Ejercicio asignado no encontrado.');
  db.prepare('DELETE FROM ejercicio_asignado WHERE id = ?').run(ejercicioAsignadoId);
  reacomodarMusculoTrasQuitar(ea.dia_rutina_id, ea.musculo_objetivo_id, Boolean(ea.es_top_de_musculo));
});

const getEjercicioAsignadoConTipo = db.prepare(`
  SELECT ea.*, e.es_compuesto_principal_fuerza
  FROM ejercicio_asignado ea JOIN ejercicio e ON e.id = ea.ejercicio_id
  WHERE ea.id = ?
`);
const getUsuarioIdDeEjercicioAsignado = db.prepare(`
  SELECT r.usuario_id FROM ejercicio_asignado ea
  JOIN dia_rutina dr ON dr.id = ea.dia_rutina_id
  JOIN rutina r ON r.id = dr.rutina_id
  WHERE ea.id = ?
`);

// Ajuste manual de series (+1/-1) sin esperar al cierre de microciclo, que
// solo las sube automaticamente cuando detecta estancamiento. Respeta el
// mismo piso (SERIES_MINIMO) y tope (topeSeriesPara segun objetivo/tipo de
// ejercicio) que ya usa el motor de progresion, para no quedar inconsistente
// con lo que haria el cierre automatico.
const getMicrocicloEnCursoDeEjercicio = db.prepare(`
  SELECT m.id FROM microciclo m
  JOIN dia_rutina dr ON dr.rutina_id = m.rutina_id
  JOIN ejercicio_asignado ea ON ea.dia_rutina_id = dr.id
  WHERE ea.id = ? AND m.estado = 'en_curso'
`);

export function ajustarSeriesManual(ejercicioAsignadoId, delta) {
  const ea = getEjercicioAsignadoConTipo.get(ejercicioAsignadoId);
  if (!ea) throw new Error('Ejercicio asignado no encontrado.');

  const { usuario_id: usuarioId } = getUsuarioIdDeEjercicioAsignado.get(ejercicioAsignadoId);
  const objetivo = getObjetivo.get(usuarioId);
  const tope = topeSeriesPara({ objetivo: objetivo?.tipo, esCompuestoPrincipalFuerza: Boolean(ea.es_compuesto_principal_fuerza) });

  const actuales = ea.series_actuales || SERIES_MINIMO;
  const nuevas = actuales + delta;
  if (nuevas < SERIES_MINIMO) throw new Error(`No se puede bajar de ${SERIES_MINIMO} series.`);
  if (nuevas > tope) throw new Error(`Este ejercicio ya esta en su tope de ${tope} series.`);

  db.prepare('UPDATE ejercicio_asignado SET series_actuales = ? WHERE id = ?').run(nuevas, ejercicioAsignadoId);

  // Tambien hay que pisar el progreso_ejercicio_microciclo del microciclo EN
  // CURSO - si no, esto quedaba solo cosmetico: al cerrar el microciclo,
  // cerrarMicrociclo usa progreso.series_prescritas (no series_actuales)
  // como base para el proximo, asi que un ajuste manual se perdia solo con
  // que pasara un cierre. Con este update, el ajuste persiste microciclo
  // tras microciclo hasta que el usuario lo cambie o pida una descarga.
  const microciclo = getMicrocicloEnCursoDeEjercicio.get(ejercicioAsignadoId);
  if (microciclo) {
    db.prepare(
      'UPDATE progreso_ejercicio_microciclo SET series_prescritas = ? WHERE ejercicio_asignado_id = ? AND microciclo_id = ?'
    ).run(nuevas, ejercicioAsignadoId, microciclo.id);
  }

  return { id: ejercicioAsignadoId, series_actuales: nuevas };
}

// ---------------------------------------------------------------------------
// Agregar / quitar un dia entero de una rutina activa, sin rehacerla desde
// cero (eso ya existia via crearRutina/crearRutinaManual/crearRutinaConSplit,
// pero finaliza la rutina actual y arranca todo de nuevo en Semana 0 -
// perdiendo la continuidad de TODOS los dias, no solo el que cambia).
// ---------------------------------------------------------------------------

const getDiasActivosRutina = db.prepare('SELECT * FROM dia_rutina WHERE rutina_id = ? AND activo = 1');
const getEjerciciosDeDia = db.prepare('SELECT * FROM ejercicio_asignado WHERE dia_rutina_id = ? ORDER BY es_top_de_musculo DESC, orden');

function equipamientoPara(usuarioId) {
  const equipamiento = getEquipamiento.get(usuarioId);
  if (!equipamiento) return null;
  return {
    tipo: equipamiento.tipo,
    checklist: JSON.parse(equipamiento.checklist_json),
    musculosUbicacion: JSON.parse(equipamiento.musculos_ubicacion_json || '{}'),
  };
}

function ordenarPorDiaSemana(dias) {
  return [...dias].sort((a, b) => ORDEN_DIAS.indexOf(a) - ORDEN_DIAS.indexOf(b));
}

// Recalcula numero_dia (1..N) de los dias activos segun su orden cronologico
// real - hace falta despues de agregar/quitar un dia, porque el nuevo puede
// caer en cualquier posicion de la semana, no solo al final.
function renumerarDias(rutinaId) {
  const ordenados = [...getDiasActivosRutina.all(rutinaId)]
    .sort((a, b) => ORDEN_DIAS.indexOf(a.dia_semana) - ORDEN_DIAS.indexOf(b.dia_semana));
  ordenados.forEach((d, i) => {
    if (d.numero_dia !== i + 1) db.prepare('UPDATE dia_rutina SET numero_dia = ? WHERE id = ?').run(i + 1, d.id);
  });
}

// Antes de dejar quitar un dia, calculamos que musculos se entrenaban SOLO
// ahi (perderian toda frecuencia semanal si se quita sin redistribuir) y
// cuales tambien se entrenan en otro dia activo (perder este dia solo les
// baja la frecuencia, no los deja en cero) - el frontend usa esto para
// mostrarle el impacto real al usuario antes de confirmar.
export function obtenerImpactoQuitarDia(diaRutinaId) {
  const dia = db.prepare('SELECT dr.*, r.id AS rutina_id FROM dia_rutina dr JOIN rutina r ON r.id = dr.rutina_id WHERE dr.id = ?').get(diaRutinaId);
  if (!dia) throw new Error('Dia no encontrado.');

  const musculosDelDia = [...new Set(getEjerciciosDeDia.all(diaRutinaId).map((ea) => ea.musculo_objetivo_id))];
  const otrosDias = getDiasActivosRutina.all(dia.rutina_id).filter((d) => d.id !== Number(diaRutinaId));
  const musculosEnOtrosDias = new Set();
  for (const otro of otrosDias) {
    for (const ea of getEjerciciosDeDia.all(otro.id)) musculosEnOtrosDias.add(ea.musculo_objetivo_id);
  }

  const musculos = musculosDelDia.map((musculoId) => ({
    musculo_id: musculoId,
    musculo_nombre: getMusculoNombrePorId.get(musculoId).nombre,
    solo_en_este_dia: !musculosEnOtrosDias.has(musculoId),
  }));

  return { dia_semana: dia.dia_semana, musculos, quedarian_dias_activos: otrosDias.length };
}

// Recalcula el split completo (dias viejos + el nuevo) para la nueva
// cantidad de dias, reutilizando los ejercicios ya asignados en la rutina.
// Clave: el diff se hace DIA POR DIA (cada dia_semana conserva su propia
// identidad - "lunes" sigue siendo "lunes"), no "musculo por musculo a
// nivel global" - eso ultimo rompe cuando un musculo se entrenaba 2x/semana
// (upper_lower, push_pull): terminaria juntando las dos apariciones viejas
// en un solo dia nuevo en vez de repartirlas entre los dos dias nuevos que
// tambien lo entrenan 2x. Por cada dia (viejo reutilizado o nuevo):
//   - un musculo que ese mismo dia ya tenia y el nuevo split le sigue
//     pidiendo: se deja intacto (mismo ejercicio, mismo peso/series).
//   - un musculo que ese dia tenia pero ya no le corresponde: pasa a un
//     pool de "huerfanos" disponibles para otro dia.
//   - un musculo nuevo para ese dia: primero se busca en el pool (reusando
//     peso/series de otro dia que lo solto), si no hay se arma un ejercicio
//     nuevo (a testear, sin peso todavia, como cualquier ejercicio agregado
//     a mitad de rutina).
// Al final, los huerfanos que nadie reclamo (sobrantes del reparto por
// tiempo, ej. un musculo con 2 ejercicios ese dia) se adjuntan como extra a
// algun dia que SI entrene ese musculo, en vez de quedar tirados en un dia
// que ya no tiene nada que ver. Los dias viejos que no quedan en el nuevo
// split se borran (si nunca tuvieron una sesion registrada) o se desactivan
// (si ya tienen historial, para no perderlo). Devuelve un
// Map<dia_semana, dia_rutina_id> del resultado.
function reorganizarRutina(rutinaId, nuevosDiasEspecificos, varianteSplit, { objetivo, equipamiento, exclusiones }) {
  const nuevaSecuencia = armarSecuenciaDeDias(nuevosDiasEspecificos, varianteSplit);
  const diasActivos = getDiasActivosRutina.all(rutinaId);
  const diaPorSemana = new Map(diasActivos.map((d) => [d.dia_semana, d]));

  // Snapshot de lo que tenia cada dia ANTES de tocar nada, para diffear
  // contra lo que el nuevo split le pide a ESE MISMO dia.
  const ejerciciosPorDia = new Map(); // dia_rutina_id -> Map<musculo_objetivo_id, ejercicio[]>
  for (const dia of diasActivos) {
    const porMusculo = new Map();
    for (const ea of getEjerciciosDeDia.all(dia.id)) {
      if (!porMusculo.has(ea.musculo_objetivo_id)) porMusculo.set(ea.musculo_objetivo_id, []);
      porMusculo.get(ea.musculo_objetivo_id).push(ea);
    }
    ejerciciosPorDia.set(dia.id, porMusculo);
  }

  const idsResultantes = new Map();
  const diasUsados = new Set();
  const musculoADiasNuevos = new Map(); // musculo_objetivo_id -> [dia_rutina_id, ...]
  const pool = new Map(); // musculo_objetivo_id -> ejercicio[] huerfanos disponibles

  nuevaSecuencia.forEach((entry, idx) => {
    const numeroDia = idx + 1;
    const existente = diaPorSemana.get(entry.dia_semana);
    let diaRutinaId;
    let existentesAqui = new Map();
    if (existente) {
      db.prepare('UPDATE dia_rutina SET numero_dia = ? WHERE id = ?').run(numeroDia, existente.id);
      diaRutinaId = existente.id;
      existentesAqui = ejerciciosPorDia.get(existente.id) || new Map();
    } else {
      const { lastInsertRowid } = insertDiaRutina.run({
        rutina_id: rutinaId, numero_dia: numeroDia, dia_semana: entry.dia_semana, musculos_trabajados_json: '[]',
      });
      diaRutinaId = lastInsertRowid;
    }
    diasUsados.add(diaRutinaId);
    idsResultantes.set(entry.dia_semana, diaRutinaId);

    const targetMuscleIds = entry.musculos.map((m) => getMusculoId.get(m).id);
    const targetSet = new Set(targetMuscleIds);

    for (const [musculoId, ejs] of existentesAqui) {
      if (targetSet.has(musculoId)) continue;
      if (!pool.has(musculoId)) pool.set(musculoId, []);
      pool.get(musculoId).push(...ejs);
    }

    let orden = Math.max(0, ...[...existentesAqui.values()].flat().map((e) => e.orden));
    for (const musculoNombre of entry.musculos) {
      const musculoId = getMusculoId.get(musculoNombre).id;
      if (!musculoADiasNuevos.has(musculoId)) musculoADiasNuevos.set(musculoId, []);
      musculoADiasNuevos.get(musculoId).push(diaRutinaId);

      if (existentesAqui.has(musculoId)) continue;

      const disponible = pool.get(musculoId)?.shift();
      if (disponible) {
        db.prepare('UPDATE ejercicio_asignado SET dia_rutina_id = ?, orden = ? WHERE id = ?').run(diaRutinaId, ++orden, disponible.id);
        continue;
      }

      const elegido = elegirEjercicioTop({ musculo: musculoNombre, equipamiento, exclusiones });
      if (elegido) {
        const rango = rangoRepsPara({
          musculo: musculoNombre, objetivo,
          esCompuestoPrincipalFuerza: Boolean(elegido.es_compuesto_principal_fuerza), region: elegido.musculo_region,
        });
        insertEjercicioAsignado.run({
          dia_rutina_id: diaRutinaId, ejercicio_id: elegido.id, orden: ++orden,
          es_top_de_musculo: 1, musculo_objetivo_id: musculoId,
          series_actuales: SERIES_MINIMO, rango_reps_min: rango.min, rango_reps_max: rango.max,
        });
      }
    }
    db.prepare('UPDATE dia_rutina SET musculos_trabajados_json = ? WHERE id = ?').run(JSON.stringify(entry.musculos), diaRutinaId);
  });

  for (const [musculoId, restantes] of pool) {
    const destino = musculoADiasNuevos.get(musculoId)?.[0];
    if (!destino) continue;
    for (const ea of restantes) {
      if (destino === ea.dia_rutina_id) continue;
      const { maxOrden } = getMaxOrdenDia.get(destino);
      db.prepare('UPDATE ejercicio_asignado SET dia_rutina_id = ?, orden = ? WHERE id = ?').run(destino, maxOrden + 1, ea.id);
    }
  }

  for (const dia of diasActivos) {
    if (diasUsados.has(dia.id)) continue;
    const tieneSesiones = db.prepare('SELECT 1 FROM registro_sesion WHERE dia_rutina_id = ?').get(dia.id);
    if (tieneSesiones) db.prepare('UPDATE dia_rutina SET activo = 0 WHERE id = ?').run(dia.id);
    else db.prepare('DELETE FROM dia_rutina WHERE id = ?').run(dia.id);
  }

  return idsResultantes;
}

// Suma un dia nuevo a la rutina activa del usuario, sin tocar el progreso de
// los dias existentes (microciclo en curso, pesos, series ya cargadas).
// modo:
//   - 'manual': el usuario elige los ejercicios del dia nuevo el mismo
//     (ejercicios: [ejercicio_id, ...], igual que crearRutinaManual).
//   - 'auto_solo_dia': el motor arma SOLO el dia nuevo, con el/los musculo/s
//     que le corresponderian segun el split actual si este dia siempre
//     hubiera estado - el resto de los dias no se toca.
//   - 'auto_reorganizar': ver reorganizarRutina - recalcula el split
//     completo para la nueva cantidad de dias, reutilizando lo ya cargado.
export const agregarDiaRutina = db.transaction((usuarioId, { diaSemana, duracionMinutos, modo, varianteSplit = 'upper_lower', ejercicios = [] }) => {
  const rutina = db.prepare("SELECT * FROM rutina WHERE usuario_id = ? AND estado = 'activa'").get(usuarioId);
  if (!rutina) throw new Error('El usuario no tiene una rutina activa.');

  const diasActivos = getDiasActivosRutina.all(rutina.id);
  if (diasActivos.some((d) => d.dia_semana === diaSemana)) throw new Error('Ese dia ya esta activo en la rutina.');
  if (diasActivos.length >= 6) throw new Error('No se pueden tener mas de 6 dias por semana.');

  const disponibilidad = getDisponibilidad.get(usuarioId);
  const diasEspecificosViejos = disponibilidad ? JSON.parse(disponibilidad.dias_especificos_json) : diasActivos.map((d) => d.dia_semana);
  const nuevosDiasEspecificos = ordenarPorDiaSemana([...new Set([...diasEspecificosViejos, diaSemana])]);

  const objetivo = getObjetivo.get(usuarioId);
  if (!objetivo) throw new Error('Falta completar el objetivo antes de agregar un dia.');
  const equipamiento = equipamientoPara(usuarioId);
  if (modo !== 'manual' && !equipamiento) {
    throw new Error('Falta completar el equipamiento antes de agregar un dia automatico.');
  }
  const exclusiones = getExclusiones.all(usuarioId).map((r) => r.ejercicio_id);

  if (modo === 'manual') {
    if (!Array.isArray(ejercicios) || ejercicios.length === 0) {
      throw new Error('Elegi al menos un ejercicio para el dia nuevo.');
    }
    const catalogos = ejercicios.map((ejercicioId) => {
      const catalogo = getEjercicioCatalogo.get(ejercicioId);
      if (!catalogo || !catalogo.activo) throw new Error(`Ejercicio ${ejercicioId} no encontrado.`);
      return catalogo;
    });
    const topPorMusculo = new Map();
    for (const c of catalogos) {
      const actual = topPorMusculo.get(c.musculo_nombre);
      if (!actual || (c.tipo === 'compuesto' && actual.tipo !== 'compuesto')) topPorMusculo.set(c.musculo_nombre, c);
    }

    const { lastInsertRowid: diaRutinaId } = insertDiaRutina.run({
      rutina_id: rutina.id, numero_dia: diasActivos.length + 1, dia_semana: diaSemana,
      musculos_trabajados_json: JSON.stringify([...new Set(catalogos.map((c) => c.musculo_nombre))]),
    });
    catalogos.forEach((catalogo, i) => {
      const rango = rangoRepsPara({
        musculo: catalogo.musculo_nombre, objetivo: objetivo.tipo,
        esCompuestoPrincipalFuerza: Boolean(catalogo.es_compuesto_principal_fuerza), region: catalogo.musculo_region,
      });
      insertEjercicioAsignado.run({
        dia_rutina_id: diaRutinaId, ejercicio_id: catalogo.id, orden: i + 1,
        es_top_de_musculo: topPorMusculo.get(catalogo.musculo_nombre) === catalogo ? 1 : 0,
        musculo_objetivo_id: getMusculoId.get(catalogo.musculo_nombre).id,
        series_actuales: SERIES_MINIMO, rango_reps_min: rango.min, rango_reps_max: rango.max,
      });
    });
  } else if (modo === 'auto_reorganizar') {
    reorganizarRutina(rutina.id, nuevosDiasEspecificos, varianteSplit, { objetivo: objetivo.tipo, equipamiento, exclusiones });
  } else {
    const secuencia = armarSecuenciaDeDias(nuevosDiasEspecificos, varianteSplit);
    const entry = secuencia.find((d) => d.dia_semana === diaSemana);
    const ejerciciosDia = armarDia({
      musculos: entry.musculos, objetivo: objetivo.tipo, equipamiento, exclusiones,
      minutosDisponibles: duracionMinutos || 60,
    });
    const { lastInsertRowid: diaRutinaId } = insertDiaRutina.run({
      rutina_id: rutina.id, numero_dia: diasActivos.length + 1, dia_semana: diaSemana,
      musculos_trabajados_json: JSON.stringify(entry.musculos),
    });
    ejerciciosDia.forEach((ej) => {
      insertEjercicioAsignado.run({
        dia_rutina_id: diaRutinaId, ejercicio_id: ej.ejercicio_id, orden: ej.orden,
        es_top_de_musculo: ej.es_top_de_musculo ? 1 : 0, musculo_objetivo_id: getMusculoId.get(ej.musculo).id,
        series_actuales: SERIES_MINIMO, rango_reps_min: ej.rango_reps_min, rango_reps_max: ej.rango_reps_max,
      });
    });
  }

  renumerarDias(rutina.id);
  aplicarDisponibilidad(usuarioId, {
    dias_especificos: nuevosDiasEspecificos,
    duracion_sesion: { ...(disponibilidad ? JSON.parse(disponibilidad.duracion_sesion_json) : {}), [diaSemana]: duracionMinutos || 60 },
  });

  return obtenerRutinaActiva(usuarioId);
});

// Inversa de agregarDiaRutina. redistribuir=true: a los musculos que
// quedarian sin ningun dia activo (ver obtenerImpactoQuitarDia) se les arma
// un ejercicio nuevo (a testear, sin peso todavia) en el dia activo que
// menos ejercicios tenga, para no perder frecuencia de golpe. El dia en si
// se borra directo si todavia no tiene ninguna sesion registrada; si ya
// tiene historial, se desactiva (activo=0) en vez de borrarlo, para no
// perder ese historial de Reportes/exportacion.
export const quitarDiaRutina = db.transaction((diaRutinaId, { redistribuir = false } = {}) => {
  const dia = db.prepare(`
    SELECT dr.*, r.id AS rutina_id, r.usuario_id FROM dia_rutina dr JOIN rutina r ON r.id = dr.rutina_id WHERE dr.id = ?
  `).get(diaRutinaId);
  if (!dia) throw new Error('Dia no encontrado.');
  if (!dia.activo) throw new Error('Ese dia ya esta quitado.');
  const usuarioId = dia.usuario_id;

  const diasActivos = getDiasActivosRutina.all(dia.rutina_id);
  if (diasActivos.length <= 2) throw new Error('La rutina necesita al menos 2 dias activos.');

  const impacto = obtenerImpactoQuitarDia(diaRutinaId);

  if (redistribuir) {
    const objetivo = getObjetivo.get(usuarioId);
    const equipamiento = equipamientoPara(usuarioId);
    const exclusiones = getExclusiones.all(usuarioId).map((r) => r.ejercicio_id);
    const otrosDias = diasActivos.filter((d) => d.id !== Number(diaRutinaId));
    const contarEjercicios = db.prepare('SELECT COUNT(*) AS n FROM ejercicio_asignado WHERE dia_rutina_id = ?');

    for (const m of impacto.musculos.filter((m) => m.solo_en_este_dia)) {
      const destino = [...otrosDias].sort((a, b) => contarEjercicios.get(a.id).n - contarEjercicios.get(b.id).n)[0];
      if (!destino || !equipamiento) continue;
      const elegido = elegirEjercicioTop({ musculo: m.musculo_nombre, equipamiento, exclusiones });
      if (!elegido) continue;
      const rango = rangoRepsPara({
        musculo: m.musculo_nombre, objetivo: objetivo?.tipo,
        esCompuestoPrincipalFuerza: Boolean(elegido.es_compuesto_principal_fuerza), region: elegido.musculo_region,
      });
      const { maxOrden } = getMaxOrdenDia.get(destino.id);
      insertEjercicioAsignado.run({
        dia_rutina_id: destino.id, ejercicio_id: elegido.id, orden: maxOrden + 1,
        es_top_de_musculo: 1, musculo_objetivo_id: m.musculo_id,
        series_actuales: SERIES_MINIMO, rango_reps_min: rango.min, rango_reps_max: rango.max,
      });
      const musculosDestino = new Set(JSON.parse(destino.musculos_trabajados_json));
      musculosDestino.add(m.musculo_nombre);
      db.prepare('UPDATE dia_rutina SET musculos_trabajados_json = ? WHERE id = ?').run(JSON.stringify([...musculosDestino]), destino.id);
    }
  }

  const tieneSesiones = db.prepare('SELECT 1 FROM registro_sesion WHERE dia_rutina_id = ?').get(diaRutinaId);
  if (tieneSesiones) {
    db.prepare('UPDATE dia_rutina SET activo = 0 WHERE id = ?').run(diaRutinaId);
  } else {
    db.prepare('DELETE FROM dia_rutina WHERE id = ?').run(diaRutinaId);
  }

  renumerarDias(dia.rutina_id);

  const disponibilidad = getDisponibilidad.get(usuarioId);
  if (disponibilidad) {
    const diasEspecificosViejos = JSON.parse(disponibilidad.dias_especificos_json);
    const duracionNueva = JSON.parse(disponibilidad.duracion_sesion_json);
    delete duracionNueva[dia.dia_semana];
    aplicarDisponibilidad(usuarioId, {
      dias_especificos: diasEspecificosViejos.filter((d) => d !== dia.dia_semana),
      duracion_sesion: duracionNueva,
    });
  }

  return obtenerRutinaActiva(usuarioId);
});

// Cambia el dia de la semana de un dia_rutina ENTERO (todos sus ejercicios
// se mueven juntos, con su peso/series/progreso intactos) - para cuando el
// usuario pasa lo que entrenaba un dia a otro (ej. "lo que hacia el lunes
// ahora lo hago el martes") sin tener que mover ejercicio por ejercicio via
// moverEjercicioADia. Si el dia destino ya tiene otro dia activo, hay que
// decidir que hacer con ese - conflicto:
//   - { accion: 'mover', dia_semana_destino } - el dia en conflicto pasa a
//     un dia de la semana que este libre (no puede ser uno ya activo).
//   - { accion: 'eliminar' } - el dia en conflicto se borra (si nunca tuvo
//     sesiones) o se desactiva (si ya tiene historial), igual que
//     quitarDiaRutina pero sin ofrecer redistribuir sus musculos - el
//     usuario ya eligio conscientemente sacarlo.
// El frontend ya conoce los dias activos (los tiene en pantalla), asi que
// en el camino normal manda `conflicto` de una si hace falta; este chequeo
// server-side es solo una red de seguridad ante una condicion de carrera.
export const cambiarDiaSemana = db.transaction((diaRutinaId, nuevoDiaSemana, conflicto) => {
  const dia = db.prepare(`
    SELECT dr.*, r.id AS rutina_id, r.usuario_id FROM dia_rutina dr JOIN rutina r ON r.id = dr.rutina_id WHERE dr.id = ?
  `).get(diaRutinaId);
  if (!dia) throw new Error('Dia no encontrado.');
  if (!dia.activo) throw new Error('Ese dia no esta activo.');
  if (!ORDEN_DIAS.includes(nuevoDiaSemana)) throw new Error('Dia de la semana invalido.');
  if (dia.dia_semana === nuevoDiaSemana) throw new Error('Ese ya es el dia actual de este dia de rutina.');

  const usuarioId = dia.usuario_id;
  const diaSemanaOriginal = dia.dia_semana;
  const diasActivos = getDiasActivosRutina.all(dia.rutina_id);
  const diaEnConflicto = diasActivos.find((d) => d.dia_semana === nuevoDiaSemana && d.id !== Number(diaRutinaId));

  const disponibilidad = getDisponibilidad.get(usuarioId);
  const duracion = disponibilidad ? JSON.parse(disponibilidad.duracion_sesion_json) : {};

  if (diaEnConflicto) {
    if (!conflicto || !['mover', 'eliminar'].includes(conflicto.accion)) {
      throw new Error(`Ya hay un dia activo en "${nuevoDiaSemana}" - elegi si moverlo o eliminarlo.`);
    }
    if (conflicto.accion === 'mover') {
      const destino = conflicto.dia_semana_destino;
      if (!destino || !ORDEN_DIAS.includes(destino)) throw new Error('Elegi a que dia mover el dia en conflicto.');
      if (destino === nuevoDiaSemana || diasActivos.some((d) => d.dia_semana === destino && d.id !== diaEnConflicto.id)) {
        throw new Error('Ese dia tambien esta ocupado.');
      }
      duracion[destino] = duracion[diaEnConflicto.dia_semana];
      delete duracion[diaEnConflicto.dia_semana];
      db.prepare('UPDATE dia_rutina SET dia_semana = ? WHERE id = ?').run(destino, diaEnConflicto.id);
    } else {
      const tieneSesiones = db.prepare('SELECT 1 FROM registro_sesion WHERE dia_rutina_id = ?').get(diaEnConflicto.id);
      if (tieneSesiones) db.prepare('UPDATE dia_rutina SET activo = 0 WHERE id = ?').run(diaEnConflicto.id);
      else db.prepare('DELETE FROM dia_rutina WHERE id = ?').run(diaEnConflicto.id);
      delete duracion[diaEnConflicto.dia_semana];
    }
  }

  duracion[nuevoDiaSemana] = duracion[diaSemanaOriginal];
  delete duracion[diaSemanaOriginal];
  db.prepare('UPDATE dia_rutina SET dia_semana = ? WHERE id = ?').run(nuevoDiaSemana, diaRutinaId);

  renumerarDias(dia.rutina_id);

  const diasEspecificosFinal = ordenarPorDiaSemana(getDiasActivosRutina.all(dia.rutina_id).map((d) => d.dia_semana));
  aplicarDisponibilidad(usuarioId, { dias_especificos: diasEspecificosFinal, duracion_sesion: duracion });

  return obtenerRutinaActiva(usuarioId);
});

// ---------------------------------------------------------------------------
// Mover / copiar un ejercicio ya asignado a otro dia de la MISMA rutina -
// por si durante el entrenamiento se decide que un ejercicio queda mejor en
// otro dia, o que conviene repetirlo en dos dias.
// ---------------------------------------------------------------------------

// Despues de sacar un ejercicio de un dia (mover a otro lado), si era el top
// de su musculo y todavia queda algun otro ejercicio del mismo musculo en
// ese dia, uno de ellos pasa a ser el nuevo top - nunca se deja un musculo
// sin top mientras tenga al menos un ejercicio asignado ahi. Si no queda
// ninguno, el musculo se saca de musculos_trabajados_json (cosmetico).
function reacomodarMusculoTrasQuitar(diaRutinaId, musculoId, eraTop) {
  const restantes = db.prepare(
    'SELECT id FROM ejercicio_asignado WHERE dia_rutina_id = ? AND musculo_objetivo_id = ? ORDER BY orden'
  ).all(diaRutinaId, musculoId);
  if (restantes.length === 0) {
    const dia = getDiaRutinaPorId.get(diaRutinaId);
    const musculoNombre = getMusculoNombrePorId.get(musculoId).nombre;
    const musculos = JSON.parse(dia.musculos_trabajados_json).filter((m) => m !== musculoNombre);
    db.prepare('UPDATE dia_rutina SET musculos_trabajados_json = ? WHERE id = ?').run(JSON.stringify(musculos), diaRutinaId);
  } else if (eraTop) {
    db.prepare('UPDATE ejercicio_asignado SET es_top_de_musculo = 1 WHERE id = ?').run(restantes[0].id);
  }
}

function validarDestinoMismaRutina(ea, diaRutinaIdDestino) {
  const destino = getDiaRutinaPorId.get(diaRutinaIdDestino);
  if (!destino) throw new Error('Dia destino no encontrado.');
  const origen = getDiaRutinaPorId.get(ea.dia_rutina_id);
  if (origen.rutina_id !== destino.rutina_id) throw new Error('El dia destino tiene que ser de la misma rutina.');
  const yaUsado = db.prepare('SELECT 1 FROM ejercicio_asignado WHERE dia_rutina_id = ? AND ejercicio_id = ?')
    .get(diaRutinaIdDestino, ea.ejercicio_id);
  if (yaUsado) throw new Error('Ese ejercicio ya esta asignado en el dia destino.');
  return { origen, destino };
}

// Mueve el ejercicio_asignado a otro dia, conservando su peso/series
// actuales (es la misma instancia de progresion, solo cambia de dia).
export const moverEjercicioADia = db.transaction((ejercicioAsignadoId, diaRutinaIdDestino) => {
  const ea = db.prepare('SELECT * FROM ejercicio_asignado WHERE id = ?').get(ejercicioAsignadoId);
  if (!ea) throw new Error('Ejercicio asignado no encontrado.');
  if (ea.dia_rutina_id === diaRutinaIdDestino) throw new Error('Ese ejercicio ya esta en ese dia.');
  const { origen } = validarDestinoMismaRutina(ea, diaRutinaIdDestino);

  const musculoNombre = getMusculoNombrePorId.get(ea.musculo_objetivo_id).nombre;
  const esTopEnDestino = calcularTopYActualizarDia(diaRutinaIdDestino, ea.musculo_objetivo_id, musculoNombre);
  const { maxOrden } = getMaxOrdenDia.get(diaRutinaIdDestino);

  db.prepare('UPDATE ejercicio_asignado SET dia_rutina_id = ?, orden = ?, es_top_de_musculo = ? WHERE id = ?')
    .run(diaRutinaIdDestino, maxOrden + 1, esTopEnDestino ? 1 : 0, ejercicioAsignadoId);

  reacomodarMusculoTrasQuitar(origen.id, ea.musculo_objetivo_id, Boolean(ea.es_top_de_musculo));

  const catalogo = getEjercicioCatalogo.get(ea.ejercicio_id);
  return {
    id: ejercicioAsignadoId, dia_rutina_id: diaRutinaIdDestino, ejercicio_id: ea.ejercicio_id,
    ejercicio_nombre: catalogo.nombre, es_top_de_musculo: esTopEnDestino,
  };
});

// Duplica el ejercicio en otro dia - a diferencia de mover, queda una
// instancia nueva (peso_actual NULL, a testear) en vez de heredar el
// peso/series del original, para no asumir que el mismo peso sirve ahora
// con la frecuencia mas alta que implica repetirlo en dos dias.
export const copiarEjercicioADia = db.transaction((ejercicioAsignadoId, diaRutinaIdDestino) => {
  const ea = db.prepare('SELECT * FROM ejercicio_asignado WHERE id = ?').get(ejercicioAsignadoId);
  if (!ea) throw new Error('Ejercicio asignado no encontrado.');
  validarDestinoMismaRutina(ea, diaRutinaIdDestino);

  const musculoNombre = getMusculoNombrePorId.get(ea.musculo_objetivo_id).nombre;
  const esTop = calcularTopYActualizarDia(diaRutinaIdDestino, ea.musculo_objetivo_id, musculoNombre);
  const { maxOrden } = getMaxOrdenDia.get(diaRutinaIdDestino);

  const info = insertEjercicioAsignadoExtra.run({
    dia_rutina_id: diaRutinaIdDestino, ejercicio_id: ea.ejercicio_id, orden: maxOrden + 1, es_top_de_musculo: esTop ? 1 : 0,
    musculo_objetivo_id: ea.musculo_objetivo_id, series_actuales: SERIES_MINIMO, rango_reps_min: ea.rango_reps_min, rango_reps_max: ea.rango_reps_max,
  });
  const catalogo = getEjercicioCatalogo.get(ea.ejercicio_id);
  return {
    id: info.lastInsertRowid, dia_rutina_id: diaRutinaIdDestino, ejercicio_id: ea.ejercicio_id,
    ejercicio_nombre: catalogo.nombre, musculo_objetivo_id: ea.musculo_objetivo_id,
    rango_reps_min: ea.rango_reps_min, rango_reps_max: ea.rango_reps_max,
    es_top_de_musculo: esTop, series_actuales: SERIES_MINIMO,
  };
});
