import db from '../db/index.js';
import { INCREMENTO_KG_DEFAULT, SERIES_MINIMO, topeSeriesPara } from './routineBuilder.js';

// Umbral para decidir "mejor marca" vs "promedio" al cerrar un bloque de 2
// semanas (supuesto #1 del prompt original, configurable aca).
const UMBRAL_VARIACION_PORCENTUAL = 0.2;
const UMBRAL_VARIACION_REPS_ABS = 3;
const UMBRAL_SERIE_LARGA = 12;

// "Repeticiones efectivas": de las reps hechas en una serie, cuantas caen
// dentro de la ventana de las ultimas REPS_EFECTIVAS_UMBRAL reps antes del
// fallo (el resto son reps de "calentamiento" dentro de la propia serie,
// que aportan poco estimulo). Si hiciste `reps` y terminaste a `rir` reps
// del fallo, el fallo habria sido en la repeticion (reps + rir); las
// efectivas son las que caen en [fallo - umbral + 1, fallo] Y ademas se
// llegaron a hacer de verdad (<= reps). Sin RIR cargado (ej. series de
// Semana 0, que no lo piden) no hay forma de calcularlo -> null.
export const REPS_EFECTIVAS_UMBRAL = 3;
export function repsEfectivas(reps, rir) {
  if (reps == null || rir == null) return null;
  return Math.max(0, Math.min(reps, REPS_EFECTIVAS_UMBRAL - rir));
}

function techoDesde(sem1, sem2) {
  if (sem1 == null || sem2 == null) return null;
  const max = Math.max(sem1, sem2);
  const diff = Math.abs(sem1 - sem2);
  const muchaVariacion = diff >= UMBRAL_VARIACION_PORCENTUAL * max || (max > UMBRAL_SERIE_LARGA && diff >= UMBRAL_VARIACION_REPS_ABS);
  return muchaVariacion ? Math.round((sem1 + sem2) / 2) : max;
}

const getRutina = db.prepare('SELECT * FROM rutina WHERE id = ?');
const getEjerciciosDeRutina = db.prepare(`
  SELECT ea.*, e.es_compuesto_principal_fuerza, e.nombre AS ejercicio_nombre, m.nombre AS musculo_nombre
  FROM ejercicio_asignado ea
  JOIN dia_rutina dr ON dr.id = ea.dia_rutina_id
  JOIN ejercicio e ON e.id = ea.ejercicio_id
  JOIN musculo m ON m.id = ea.musculo_objetivo_id
  WHERE dr.rutina_id = ? AND dr.activo = 1
`);
const getMicrociclo = db.prepare('SELECT * FROM microciclo WHERE rutina_id = ? AND numero = ?');
const getMicrocicloTesteoActual = db.prepare(
  "SELECT * FROM microciclo WHERE rutina_id = ? AND tipo = 'testeo' AND estado = 'en_curso'"
);
const insertMicrociclo = db.prepare(`INSERT INTO microciclo (rutina_id, numero, fecha_inicio, estado) VALUES (?, ?, ?, 'en_curso')`);
const cerrarMicrocicloRow = db.prepare(`UPDATE microciclo SET estado = 'cerrado', fecha_fin = date('now') WHERE id = ?`);

const upsertProgresoEjercicio = db.prepare(`
  INSERT INTO progreso_ejercicio_microciclo (ejercicio_asignado_id, microciclo_id, peso_prescrito, piso_reps, series_prescritas)
  VALUES (@ejercicio_asignado_id, @microciclo_id, @peso_prescrito, @piso_reps, @series_prescritas)
  ON CONFLICT(ejercicio_asignado_id, microciclo_id) DO UPDATE SET
    peso_prescrito = excluded.peso_prescrito, piso_reps = excluded.piso_reps, series_prescritas = excluded.series_prescritas
`);
const getProgresoEjercicio = db.prepare(
  'SELECT * FROM progreso_ejercicio_microciclo WHERE ejercicio_asignado_id = ? AND microciclo_id = ?'
);
const updateProgresoResultado = db.prepare(`
  UPDATE progreso_ejercicio_microciclo
  SET sem1_reps = @sem1_reps, sem2_reps = @sem2_reps, techo_reps = @techo_reps, mejoro = @mejoro,
      serie_agregada = @serie_agregada, nota = @nota
  WHERE id = @id
`);
const updateEjercicioAsignadoEstado = db.prepare(
  'UPDATE ejercicio_asignado SET peso_actual = ?, series_actuales = ? WHERE id = ?'
);

const insertRegistroSesion = db.prepare(`
  INSERT INTO registro_sesion (usuario_id, dia_rutina_id, fecha, salteada, microciclo_id)
  VALUES (@usuario_id, @dia_rutina_id, COALESCE(@fecha, date('now')), @salteada, @microciclo_id)
`);
const insertRegistroSerie = db.prepare(`
  INSERT INTO registro_serie (registro_sesion_id, ejercicio_asignado_id, numero_serie, peso, reps, rir, molestia)
  VALUES (@registro_sesion_id, @ejercicio_asignado_id, @numero_serie, @peso, @reps, @rir, @molestia)
`);

const getUltimaSerieEnRango = db.prepare(`
  SELECT rs.reps
  FROM registro_serie rs
  JOIN registro_sesion s ON s.id = rs.registro_sesion_id
  WHERE rs.ejercicio_asignado_id = ? AND s.fecha BETWEEN ? AND ? AND s.salteada = 0
  ORDER BY s.fecha DESC, rs.numero_serie DESC
  LIMIT 1
`);

const getMavMusculo = db.prepare(`
  SELECT r.mav FROM referencia_volumen_muscular r JOIN musculo m ON m.id = r.musculo_id WHERE m.nombre = ?
`);

const upsertProgresoMuscular = db.prepare(`
  INSERT INTO progreso_muscular_microciclo (usuario_id, musculo_id, microciclo_id, estancado, serie_agregada, volumen_directo, volumen_indirecto, cerca_de_mav)
  VALUES (@usuario_id, @musculo_id, @microciclo_id, @estancado, @serie_agregada, @volumen_directo, @volumen_indirecto, @cerca_de_mav)
  ON CONFLICT(usuario_id, musculo_id, microciclo_id) DO UPDATE SET
    estancado = excluded.estancado, serie_agregada = excluded.serie_agregada, volumen_directo = excluded.volumen_directo,
    volumen_indirecto = excluded.volumen_indirecto, cerca_de_mav = excluded.cerca_de_mav
`);
const getMusculoIdPorNombre = db.prepare('SELECT id FROM musculo WHERE nombre = ?');

function sumarDias(fechaIso, dias) {
  const d = new Date(`${fechaIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

const diaDeEjercicioAsignado = db.prepare(`
  SELECT dr.id FROM dia_rutina dr JOIN ejercicio_asignado ea ON ea.dia_rutina_id = dr.id WHERE ea.id = ? LIMIT 1
`);

// Registra una semana de testeo (la inicial, numero=0, o una repetida mas
// adelante en la rutina - ver marcarNuevoTesteo) de una o mas ejercicios
// asignados: guarda el registro real (2 series al mismo peso) y setea el
// piso del microciclo siguiente (peso = peso testeado, piso_reps = la mas
// alta de las 2 series).
export const registrarSemana0 = db.transaction((rutinaId, usuarioId, resultados) => {
  const microcicloTesteo = getMicrocicloTesteoActual.get(rutinaId);
  if (!microcicloTesteo) throw new Error('La rutina no tiene una semana de testeo en curso.');

  const siguienteNumero = microcicloTesteo.numero + 1;
  let siguiente = getMicrociclo.get(rutinaId, siguienteNumero);
  if (!siguiente) {
    const { lastInsertRowid } = insertMicrociclo.run(rutinaId, siguienteNumero, sumarDias(microcicloTesteo.fecha_inicio, 0));
    siguiente = getMicrociclo.get(rutinaId, siguienteNumero) || { id: lastInsertRowid };
  }

  for (const r of resultados) {
    const { ejercicio_asignado_id, peso, reps_serie1, reps_serie2 } = r;
    const dia_rutina_id = diaDeEjercicioAsignado.get(ejercicio_asignado_id).id;

    const { lastInsertRowid: sesionId } = insertRegistroSesion.run({
      usuario_id: usuarioId, dia_rutina_id, fecha: null, salteada: 0, microciclo_id: microcicloTesteo.id,
    });
    insertRegistroSerie.run({ registro_sesion_id: sesionId, ejercicio_asignado_id, numero_serie: 1, peso, reps: reps_serie1, rir: null, molestia: null });
    insertRegistroSerie.run({ registro_sesion_id: sesionId, ejercicio_asignado_id, numero_serie: 2, peso, reps: reps_serie2, rir: null, molestia: null });

    // Piso de referencia para la semana siguiente: la mas alta de las 2
    // series del testeo (no siempre la serie 2 - a veces la persona elige
    // mal el peso y la serie 1 le sale mejor que la 2, o al reves).
    const pisoReferencia = Math.max(reps_serie1, reps_serie2);
    upsertProgresoEjercicio.run({
      ejercicio_asignado_id, microciclo_id: siguiente.id, peso_prescrito: peso, piso_reps: pisoReferencia, series_prescritas: SERIES_MINIMO,
    });
    updateEjercicioAsignadoEstado.run(peso, SERIES_MINIMO, ejercicio_asignado_id);
  }

  cerrarMicrocicloRow.run(microcicloTesteo.id);
  return { microciclo0: microcicloTesteo, microciclo1: siguiente };
});

// Salta la semana de testeo en curso: en vez de pedir 2 series de prueba por
// ejercicio, arranca directo el microciclo siguiente con el peso en blanco
// (el usuario lo carga en su primera sesion real, como con cualquier
// ejercicio nuevo) y sin piso de reps (0 - cualquier resultado real de la
// primera sesion va a "superarlo", asi se establece la base organicamente
// en el primer cierre en vez de compararse contra un testeo que no paso).
export const saltearTesteo = db.transaction((rutinaId) => {
  const microcicloTesteo = getMicrocicloTesteoActual.get(rutinaId);
  if (!microcicloTesteo) throw new Error('La rutina no tiene una semana de testeo en curso.');

  const siguienteNumero = microcicloTesteo.numero + 1;
  let siguiente = getMicrociclo.get(rutinaId, siguienteNumero);
  if (!siguiente) {
    const { lastInsertRowid } = insertMicrociclo.run(rutinaId, siguienteNumero, sumarDias(microcicloTesteo.fecha_inicio, 0));
    siguiente = getMicrociclo.get(rutinaId, siguienteNumero) || { id: lastInsertRowid };
  }

  const ejercicios = getEjerciciosDeRutina.all(rutinaId);
  for (const ej of ejercicios) {
    upsertProgresoEjercicio.run({
      ejercicio_asignado_id: ej.id, microciclo_id: siguiente.id, peso_prescrito: 0, piso_reps: 0, series_prescritas: SERIES_MINIMO,
    });
    db.prepare('UPDATE ejercicio_asignado SET peso_actual = NULL, series_actuales = ? WHERE id = ?').run(SERIES_MINIMO, ej.id);
  }

  cerrarMicrocicloRow.run(microcicloTesteo.id);
  return { microciclo0: microcicloTesteo, microciclo1: siguiente };
});

export function registrarSesion({ usuarioId, diaRutinaId, microcicloId, fecha, salteada, series }) {
  const { lastInsertRowid: sesionId } = insertRegistroSesion.run({
    usuario_id: usuarioId, dia_rutina_id: diaRutinaId, fecha: fecha || null, salteada: salteada ? 1 : 0, microciclo_id: microcicloId,
  });
  if (!salteada) {
    for (const s of series || []) {
      insertRegistroSerie.run({
        registro_sesion_id: sesionId,
        ejercicio_asignado_id: s.ejercicio_asignado_id,
        numero_serie: s.numero_serie,
        peso: s.peso,
        reps: s.reps,
        rir: s.rir,
        molestia: s.molestia || null,
      });
    }
  }
  return sesionId;
}

// El nucleo del sistema: cierra un microciclo (bloque de 2 semanas),
// calcula techo/piso/estancamiento por musculo, ajusta series y peso, y
// crea el siguiente microciclo con los valores resultantes.
export const cerrarMicrociclo = db.transaction((rutinaId, numero) => {
  const rutina = getRutina.get(rutinaId);
  const microciclo = getMicrociclo.get(rutinaId, numero);
  if (!microciclo) throw new Error(`No existe el microciclo ${numero} para esta rutina.`);
  if (microciclo.estado === 'cerrado') throw new Error('Ese microciclo ya esta cerrado.');
  if (microciclo.tipo === 'testeo') {
    throw new Error('Esta semana es de testeo: completala con los resultados de las 2 series por ejercicio, o salteala, en vez de cerrarla directo.');
  }

  // Una semana de descarga no progresa nada (§marcarSemanaDescarga: los
  // valores de progreso_ejercicio_microciclo de este microciclo quedaron
  // intactos, son los del ultimo microciclo normal completado antes de la
  // descarga) - cerrarla solo copia esos valores intactos al siguiente
  // microciclo tal cual, sin tocar techo/piso/estancamiento/series.
  if (microciclo.tipo === 'descarga') {
    const siguienteNumero = numero + 1;
    let siguiente = getMicrociclo.get(rutinaId, siguienteNumero);
    if (!siguiente) {
      insertMicrociclo.run(rutinaId, siguienteNumero, sumarDias(microciclo.fecha_inicio, 14));
      siguiente = getMicrociclo.get(rutinaId, siguienteNumero);
    }
    const ejercicios = getEjerciciosDeRutina.all(rutinaId);
    for (const ej of ejercicios) {
      const progreso = getProgresoEjercicio.get(ej.id, microciclo.id);
      if (!progreso) continue;
      upsertProgresoEjercicio.run({
        ejercicio_asignado_id: ej.id, microciclo_id: siguiente.id,
        peso_prescrito: progreso.peso_prescrito, piso_reps: progreso.piso_reps, series_prescritas: progreso.series_prescritas,
      });
      updateEjercicioAsignadoEstado.run(progreso.peso_prescrito, progreso.series_prescritas, ej.id);
    }
    cerrarMicrocicloRow.run(microciclo.id);
    return { microciclo, siguiente, esDescarga: true };
  }

  const objetivo = db.prepare('SELECT tipo FROM objetivo WHERE usuario_id = ?').get(rutina.usuario_id);
  const ejercicios = getEjerciciosDeRutina.all(rutinaId);

  const semana1 = [microciclo.fecha_inicio, sumarDias(microciclo.fecha_inicio, 6)];
  const semana2 = [sumarDias(microciclo.fecha_inicio, 7), sumarDias(microciclo.fecha_inicio, 13)];

  const resultadosPorEjercicio = [];
  for (const ej of ejercicios) {
    const progreso = getProgresoEjercicio.get(ej.id, microciclo.id);
    if (!progreso) continue; // ejercicio incorporado despues de que arranco este microciclo

    const sem1 = getUltimaSerieEnRango.get(ej.id, ...semana1)?.reps ?? null;
    const sem2 = getUltimaSerieEnRango.get(ej.id, ...semana2)?.reps ?? null;
    const techo = techoDesde(sem1, sem2);
    const mejoro = techo == null ? null : techo > progreso.piso_reps ? 1 : 0;

    resultadosPorEjercicio.push({ ejercicio: ej, progreso, sem1, sem2, techo, mejoro });
  }

  // --- Agregacion por musculo ---
  const musculos = [...new Set(ejercicios.map((e) => e.musculo_nombre))];
  const estancadoPorMusculo = {};
  const cercaMavPorMusculo = {};
  const volumenPorMusculo = {};

  for (const musculo of musculos) {
    const directos = resultadosPorEjercicio.filter((r) => r.ejercicio.musculo_nombre === musculo);
    const volumenDirecto = directos.reduce((acc, r) => acc + r.progreso.series_prescritas, 0);
    const volumenIndirecto = ejercicios
      .filter((e) => {
        const secundarios = JSON.parse(db.prepare('SELECT musculos_secundarios_json FROM ejercicio WHERE id = ?').get(e.ejercicio_id).musculos_secundarios_json);
        return secundarios.includes(musculo);
      })
      .reduce((acc, e) => {
        const p = getProgresoEjercicio.get(e.id, microciclo.id);
        return acc + (p ? p.series_prescritas : 0);
      }, 0);

    const algunoMejoro = directos.some((r) => r.mejoro === 1);
    const estancado = directos.length > 0 && !algunoMejoro && directos.every((r) => r.mejoro != null);
    const mav = getMavMusculo.get(musculo)?.mav ?? Infinity;
    const cercaDeMav = volumenDirecto >= mav;

    estancadoPorMusculo[musculo] = estancado;
    cercaMavPorMusculo[musculo] = cercaDeMav;
    volumenPorMusculo[musculo] = volumenDirecto;

    upsertProgresoMuscular.run({
      usuario_id: rutina.usuario_id,
      musculo_id: getMusculoIdPorNombre.get(musculo).id,
      microciclo_id: microciclo.id,
      estancado: estancado ? 1 : 0,
      serie_agregada: 0, // se corrige mas abajo si corresponde
      volumen_directo: volumenDirecto,
      volumen_indirecto: volumenIndirecto,
      cerca_de_mav: cercaDeMav ? 1 : 0,
    });
  }

  // --- Siguiente microciclo ---
  const siguienteNumero = numero + 1;
  let siguiente = getMicrociclo.get(rutinaId, siguienteNumero);
  if (!siguiente) {
    insertMicrociclo.run(rutinaId, siguienteNumero, sumarDias(microciclo.fecha_inicio, 14));
    siguiente = getMicrociclo.get(rutinaId, siguienteNumero);
  }

  const musculosConSerieAgregada = new Set();

  for (const r of resultadosPorEjercicio) {
    const { ejercicio: ej, progreso, sem1, sem2, techo, mejoro } = r;
    const musculo = ej.musculo_nombre;
    const topeSeries = topeSeriesPara({ objetivo: objetivo?.tipo, esCompuestoPrincipalFuerza: Boolean(ej.es_compuesto_principal_fuerza) });

    let seriesSugeridas = progreso.series_prescritas;
    let serieAgregada = 0;
    let nota = 'En progreso.';

    if (techo == null) {
      nota = 'Sin datos suficientes de la semana 1 y/o 2: no se pudo cerrar este ejercicio.';
    } else if (techo > ej.rango_reps_max) {
      nota = 'Superaste el techo del rango de reps: se sube el peso minimo el proximo microciclo.';
    } else if (Boolean(ej.es_top_de_musculo) && estancadoPorMusculo[musculo]) {
      if (!cercaMavPorMusculo[musculo] && progreso.series_prescritas < topeSeries) {
        seriesSugeridas = progreso.series_prescritas + 1;
        serieAgregada = 1;
        musculosConSerieAgregada.add(musculo);
        nota = 'Musculo estancado: se suma 1 serie para el proximo microciclo.';
      } else if (cercaMavPorMusculo[musculo]) {
        nota = 'Musculo estancado y en el tope de volumen (MAV): no se suma serie. Subi el peso, cambia de ejercicio o revisa sueno/alimentacion.';
      } else {
        nota = 'Musculo estancado, pero este ejercicio ya esta en su tope de series.';
      }
    } else if (techo < ej.rango_reps_min) {
      nota = 'No llegaste al minimo de reps: se baja el peso el proximo microciclo.';
    }

    let pesoSugerido = progreso.peso_prescrito;
    if (techo != null) {
      if (techo > ej.rango_reps_max) pesoSugerido = progreso.peso_prescrito + INCREMENTO_KG_DEFAULT;
      else if (techo < ej.rango_reps_min) pesoSugerido = progreso.peso_prescrito - INCREMENTO_KG_DEFAULT;
    }

    updateProgresoResultado.run({
      id: progreso.id, sem1_reps: sem1, sem2_reps: sem2, techo_reps: techo, mejoro, serie_agregada: serieAgregada, nota,
    });

    if (techo != null) {
      upsertProgresoEjercicio.run({
        ejercicio_asignado_id: ej.id, microciclo_id: siguiente.id, peso_prescrito: pesoSugerido, piso_reps: techo, series_prescritas: seriesSugeridas,
      });
      updateEjercicioAsignadoEstado.run(pesoSugerido, seriesSugeridas, ej.id);
    }
  }

  for (const musculo of musculosConSerieAgregada) {
    upsertProgresoMuscular.run({
      usuario_id: rutina.usuario_id,
      musculo_id: getMusculoIdPorNombre.get(musculo).id,
      microciclo_id: microciclo.id,
      estancado: 1,
      serie_agregada: 1,
      volumen_directo: volumenPorMusculo[musculo],
      volumen_indirecto: 0,
      cerca_de_mav: cercaMavPorMusculo[musculo] ? 1 : 0,
    });
  }

  cerrarMicrocicloRow.run(microciclo.id);

  return { microciclo, siguiente, resultadosPorEjercicio, estancadoPorMusculo, cercaMavPorMusculo, volumenPorMusculo };
});

const insertDeload = db.prepare(
  'INSERT INTO deload (usuario_id, microciclo_asociado_id, detalle_json) VALUES (?, ?, ?)'
);
const getMicrocicloEnCursoNormal = db.prepare(
  "SELECT * FROM microciclo WHERE rutina_id = ? AND numero >= 1 AND estado = 'en_curso'"
);

// Semana de descarga real: solo a pedido explicito del usuario, nunca
// automatica (§6). A diferencia de una version anterior (que solo generaba
// una sugerencia informativa), esto SI transforma la semana en curso: cambia
// lo que se le muestra al usuario para entrenar (peso_actual/series_actuales
// en ejercicio_asignado) pero deja INTACTO el registro de progreso de este
// microciclo (progreso_ejercicio_microciclo) - son los valores del ultimo
// microciclo normal completado, y quedan ahi a proposito para que
// cerrarMicrociclo los use tal cual al cerrar la descarga (retoma la rutina
// exactamente donde estaba, la descarga no cuenta para la progresion).
export const marcarSemanaDescarga = db.transaction((rutinaId) => {
  const rutina = getRutina.get(rutinaId);
  const microciclo = getMicrocicloEnCursoNormal.get(rutinaId);
  if (!microciclo) throw new Error('No hay microciclo en curso para marcar como descarga.');
  if (microciclo.tipo === 'descarga') throw new Error('Esta semana ya es tu semana de descarga.');
  if (microciclo.tipo === 'testeo') throw new Error('No se puede convertir una semana de testeo en descarga.');

  const ejercicios = getEjerciciosDeRutina.all(rutinaId);
  const detalle = [];
  for (const ej of ejercicios) {
    const progreso = getProgresoEjercicio.get(ej.id, microciclo.id);
    if (!progreso) continue;

    const seriesDeload = Math.max(2, Math.ceil(progreso.series_prescritas / 2));
    const pesoTopSet = progreso.peso_prescrito;
    const pesoResto = Math.round(progreso.peso_prescrito * 0.75 * 2) / 2;

    detalle.push({
      ejercicio_asignado_id: ej.id,
      ejercicio_nombre: ej.ejercicio_nombre,
      series: seriesDeload,
      meta_reps: progreso.piso_reps,
      series_detalle: Array.from({ length: seriesDeload }, (_, i) => ({
        numero_serie: i + 1,
        peso: i === 0 ? pesoTopSet : pesoResto,
        meta_reps: progreso.piso_reps,
      })),
    });

    updateEjercicioAsignadoEstado.run(pesoTopSet, seriesDeload, ej.id);
  }

  const info = insertDeload.run(rutina.usuario_id, microciclo.id, JSON.stringify(detalle));
  db.prepare("UPDATE microciclo SET tipo = 'descarga' WHERE id = ?").run(microciclo.id);
  return { id: info.lastInsertRowid, microciclo_id: microciclo.id, detalle };
});

// Convierte el microciclo en curso en una nueva semana de testeo (2 series
// por ejercicio, como la inicial) para recalibrar peso/reps sin perder la
// rutina ni el historial - el usuario la completa con registrarSemana0
// (generalizada para encontrar CUALQUIER microciclo tipo='testeo' en curso,
// no solo el numero 0), que crea el siguiente microciclo normal con los
// resultados y cierra este.
export function marcarNuevoTesteo(rutinaId) {
  const microciclo = getMicrocicloEnCursoNormal.get(rutinaId);
  if (!microciclo) throw new Error('No hay microciclo en curso para convertir en una nueva semana de testeo.');
  if (microciclo.tipo === 'testeo') throw new Error('Esta semana ya es una semana de testeo.');
  if (microciclo.tipo === 'descarga') throw new Error('No se puede convertir una semana de descarga en testeo.');

  db.prepare("UPDATE microciclo SET tipo = 'testeo' WHERE id = ?").run(microciclo.id);
  return { ...microciclo, tipo: 'testeo' };
}

// Todas las semanas de testeo ya cerradas de una rutina (la inicial y
// cualquier repetida via marcarNuevoTesteo), con sus resultados por
// ejercicio, para poder compararlas entre si en Progreso.
export function obtenerTesteos(rutinaId) {
  const microciclos = db.prepare(
    "SELECT * FROM microciclo WHERE rutina_id = ? AND tipo = 'testeo' AND estado = 'cerrado' ORDER BY numero"
  ).all(rutinaId);

  const getFilas = db.prepare(`
    SELECT e.nombre AS ejercicio_nombre, rs.ejercicio_asignado_id, rs.numero_serie, rs.peso, rs.reps
    FROM registro_serie rs
    JOIN registro_sesion s ON s.id = rs.registro_sesion_id
    JOIN ejercicio_asignado ea ON ea.id = rs.ejercicio_asignado_id
    JOIN ejercicio e ON e.id = ea.ejercicio_id
    WHERE s.microciclo_id = ?
    ORDER BY ea.orden, rs.numero_serie
  `);

  return microciclos.map((m) => {
    const porEjercicio = new Map();
    for (const f of getFilas.all(m.id)) {
      if (!porEjercicio.has(f.ejercicio_asignado_id)) {
        porEjercicio.set(f.ejercicio_asignado_id, {
          ejercicio_asignado_id: f.ejercicio_asignado_id, ejercicio_nombre: f.ejercicio_nombre,
          peso: f.peso, reps_serie1: null, reps_serie2: null,
        });
      }
      const entry = porEjercicio.get(f.ejercicio_asignado_id);
      if (f.numero_serie === 1) entry.reps_serie1 = f.reps;
      else if (f.numero_serie === 2) entry.reps_serie2 = f.reps;
    }
    return { microciclo: m, ejercicios: [...porEjercicio.values()] };
  });
}
