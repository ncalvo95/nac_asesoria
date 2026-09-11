import ExcelJS from 'exceljs';
import db from '../db/index.js';
import { armarRutina, topeSeriesPara } from './routineBuilder.js';

const NUM_MICROCICLOS_DEFAULT = 13; // 13 bloques de 2 semanas = 26 semanas ~ 6 meses
const INCREMENTO_KG_DEFAULT = 2.5;

const TODOS_MUSCULOS = [
  'pecho', 'espalda', 'dorsales', 'deltoides', 'biceps', 'triceps',
  'abdominales', 'cuadriceps', 'isquiotibiales', 'gluteos', 'pantorrillas',
];

const getMusculosConVolumen = db.prepare(`
  SELECT m.nombre, r.mev, r.mav, r.mrv
  FROM musculo m JOIN referencia_volumen_muscular r ON r.musculo_id = m.id
  ORDER BY m.id
`);

// ---------------------------------------------------------------------------
// Construccion generica del workbook. `filas` es la lista de ejercicios (ya
// sea deduplicada por tipo de dia para el invitado, o una fila por cada
// ejercicio_asignado real para un usuario registrado). `semana0Datos` y
// `progresionDatos` permiten pre-sembrar valores reales conocidos (peso/reps
// ya cargados) dejando el resto como formulas vivas para lo que todavia no
// paso - asi el archivo sirve como respaldo y continuacion, no solo backup.
// ---------------------------------------------------------------------------
function construirWorkbook({ filas, meta, numMicrociclos = NUM_MICROCICLOS_DEFAULT, semana0Datos = null, progresionDatos = null }) {
  const nRows = filas.length;
  if (nRows === 0) {
    throw new Error('No se pudo armar ningun ejercicio con el equipamiento indicado.');
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = 'nac_asesoria';
  wb.created = new Date();

  // ---- Config ----
  const config = wb.addWorksheet('Config');
  config.addRow(['Parametro', 'Valor']);
  config.addRow(['Incremento minimo de peso (kg)', INCREMENTO_KG_DEFAULT]);
  config.getColumn(1).width = 32;

  // ---- Info ----
  const info = wb.addWorksheet('Info');
  info.addRow([meta.titulo]);
  info.addRow(['Nombre', meta.nombre || '']);
  info.addRow(['Objetivo', meta.objetivo.tipo]);
  info.addRow(['Sub-objetivo', meta.objetivo.sub_objetivo || '']);
  if (meta.objetivo.deporte) info.addRow(['Deporte', meta.objetivo.deporte]);
  info.addRow(['Dias por semana', meta.dias_especificos.join(', ')]);
  info.addRow(['Fecha de generacion', new Date().toLocaleDateString('es-AR')]);
  info.addRow([]);
  info.addRow(['Como usar este archivo']);
  info.addRow(['1. La hoja "Semana0_Testeo" y los microciclos ya completados vienen precargados con tus datos reales (si los tenes).']);
  info.addRow(['2. La hoja "Progresion" se autocompleta: cada bloque de 2 semanas (microciclo) toma como piso el techo del bloque anterior.']);
  info.addRow(['3. Por cada microciclo sin completar, cargá las repeticiones logradas en semana 1 y semana 2 de cada ejercicio (columnas K y L). El resto de las columnas de esa fila son formulas, no las edites.']);
  info.addRow(['4. Trabajá siempre en RIR 0-2 (idealmente 1). No se usa RPE ni tempo.']);
  info.addRow(['5. Si una sesion no entra en el tiempo que tenes disponible, priorizá los ejercicios compuestos y recorta accesorios (filas) antes que apurar la tecnica.']);
  info.addRow([]);
  info.addRow(['Simplificaciones de esta version de Excel']);
  info.addRow(['- No incluye sustitucion de ejercicios a mitad de rutina ni ajustes manuales de series - esos cambios los tenes que reflejar en la app.']);
  info.addRow(['- No incluye semana de descarga (deload): es opcional y a pedido, agregala manualmente si la necesitas.']);
  info.getColumn(1).width = 90;

  // ---- Rutina ----
  const rutinaSheet = wb.addWorksheet('Rutina');
  rutinaSheet.addRow(['Dia', 'Orden', 'Ejercicio', 'Musculo', 'Top de musculo', 'Rango reps']);
  filas.forEach((f) => {
    rutinaSheet.addRow([f.dia_nombre, f.orden, f.nombre, f.musculo, f.es_top_de_musculo ? 'Si' : 'No', `${f.rango_reps_min}-${f.rango_reps_max}`]);
  });
  rutinaSheet.columns.forEach((c) => { c.width = 20; });
  rutinaSheet.getColumn(3).width = 34;

  // ---- Musculos (MEV/MAV/MRV) ----
  const musculosSheet = wb.addWorksheet('Musculos');
  musculosSheet.addRow(['Musculo', 'MEV', 'MAV', 'MRV']);
  for (const m of getMusculosConVolumen.all()) {
    musculosSheet.addRow([m.nombre, m.mev, m.mav, m.mrv]);
  }
  musculosSheet.getColumn(1).width = 20;

  // ---- Semana0 Testeo ----
  const semana0 = wb.addWorksheet('Semana0_Testeo');
  semana0.addRow(['Ejercicio', 'Musculo', 'EsTop', 'PesoTest (completar)', 'RepsSerie1 (completar)', 'RepsSerie2 (completar)', 'PisoPeso', 'PisoReps']);
  filas.forEach((f, i) => {
    const row = 2 + i;
    const datos = semana0Datos?.[i] ?? null;
    semana0.addRow([
      f.nombre, f.musculo, f.es_top_de_musculo ? 1 : 0,
      datos?.peso ?? null, datos?.reps1 ?? null, datos?.reps2 ?? null,
      { formula: `D${row}` },
      { formula: `F${row}` },
    ]);
  });
  semana0.getColumn(1).width = 34;
  for (let i = 4; i <= 6; i++) {
    semana0.getColumn(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
  }

  // ---- Progresion ----
  const prog = wb.addWorksheet('Progresion');
  prog.addRow(['MicroCiclo', 'Ejercicio', 'Musculo', 'EsTop', 'RangoMin', 'RangoMax', 'TopeSeries', 'PesoPrescrito', 'PisoReps', 'Series', 'Sem1Reps (completar)', 'Sem2Reps (completar)', 'TechoReps', 'Mejoro', 'MusculoEstancado', 'MusculoCercaMAV', 'SeriesSugeridas', 'PesoSugerido', 'Nota']);

  const muscleIndex = new Map(TODOS_MUSCULOS.map((m, i) => [m, i]));

  for (let mc = 1; mc <= numMicrociclos; mc++) {
    filas.forEach((f, i) => {
      const row = 2 + (mc - 1) * nRows + i;
      const semana0Row = 2 + i;
      const prevRow = row - nRows;
      const muscleRow = 2 + (mc - 1) * TODOS_MUSCULOS.length + muscleIndex.get(f.musculo);
      const datos = progresionDatos ? progresionDatos(i, mc) : null;

      const pesoPrescrito = mc === 1
        ? { formula: `Semana0_Testeo!G${semana0Row}` }
        : { formula: `R${prevRow}` };
      const pisoReps = mc === 1
        ? { formula: `Semana0_Testeo!H${semana0Row}` }
        : { formula: `M${prevRow}` };
      const series = mc === 1
        ? 2
        : { formula: `Q${prevRow}` };

      const techoFormula = `IF(OR(K${row}="",L${row}=""),"",IF(OR(ABS(K${row}-L${row})>=0.2*MAX(K${row},L${row}),AND(MAX(K${row},L${row})>12,ABS(K${row}-L${row})>=3)),ROUND(AVERAGE(K${row},L${row}),0),MAX(K${row},L${row})))`;
      const mejoroFormula = `IF(M${row}="","",IF(M${row}>I${row},1,0))`;
      const estancadoFormula = `MusculosResumen!E${muscleRow}`;
      const cercaMavFormula = `MusculosResumen!F${muscleRow}`;
      const seriesSugFormula = `IF(M${row}="",J${row},IF(D${row}=0,J${row},IF(AND(O${row}=1,P${row}=0,J${row}<G${row}),J${row}+1,J${row})))`;
      const pesoSugFormula = `IF(M${row}="",H${row},IF(M${row}>F${row},H${row}+Config!$B$2,IF(M${row}<E${row},H${row}-Config!$B$2,H${row})))`;
      const notaFormula = `IF(M${row}="","",IF(M${row}>F${row},"Supero el rango: sube el peso minimo la proxima vez",IF(AND(D${row}=1,O${row}=1,P${row}=1),"Musculo estancado y en tope de volumen: no sumamos serie. Subi peso, cambia de ejercicio o revisa sueno y alimentacion.",IF(AND(D${row}=1,O${row}=1,P${row}=0,J${row}<G${row}),"Musculo estancado: se suma 1 serie el proximo microciclo.",IF(M${row}<E${row},"No llegaste al minimo de reps: baja el peso.","En progreso")))))`;

      prog.addRow([
        mc, f.nombre, f.musculo, f.es_top_de_musculo ? 1 : 0,
        f.rango_reps_min, f.rango_reps_max, f.tope_series,
        pesoPrescrito, pisoReps, series,
        datos?.sem1 ?? null, datos?.sem2 ?? null,
        { formula: techoFormula },
        { formula: mejoroFormula },
        { formula: estancadoFormula },
        { formula: cercaMavFormula },
        { formula: seriesSugFormula },
        { formula: pesoSugFormula },
        { formula: notaFormula },
      ]);
    });
  }
  prog.getColumn(2).width = 34;
  prog.getColumn(19).width = 60;
  for (let i = 11; i <= 12; i++) {
    prog.getColumn(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
  }

  // ---- MusculosResumen ----
  const resumen = wb.addWorksheet('MusculosResumen');
  resumen.addRow(['MicroCiclo', 'Musculo', 'MAV', 'VolumenDirecto', 'Estancado', 'CercaDeMAV']);
  const progUltimaFila = 1 + nRows * numMicrociclos;
  for (let mc = 1; mc <= numMicrociclos; mc++) {
    TODOS_MUSCULOS.forEach((musculo) => {
      const mavFormula = `VLOOKUP(B${resumen.rowCount + 1},Musculos!$A:$D,3,FALSE)`;
      const volFormula = `SUMIFS(Progresion!$J$2:$J$${progUltimaFila},Progresion!$C$2:$C$${progUltimaFila},B${resumen.rowCount + 1},Progresion!$A$2:$A$${progUltimaFila},A${resumen.rowCount + 1})`;
      const estFormula = `IF(COUNTIFS(Progresion!$C$2:$C$${progUltimaFila},B${resumen.rowCount + 1},Progresion!$A$2:$A$${progUltimaFila},A${resumen.rowCount + 1},Progresion!$N$2:$N$${progUltimaFila},1)=0,1,0)`;
      const cercaFormula = `IF(D${resumen.rowCount + 1}>=C${resumen.rowCount + 1},1,0)`;
      resumen.addRow([
        mc, musculo,
        { formula: mavFormula },
        { formula: volFormula },
        { formula: estFormula },
        { formula: cercaFormula },
      ]);
    });
  }
  resumen.getColumn(2).width = 20;

  return wb;
}

// ---------------------------------------------------------------------------
// Invitado: sin cuenta, sin historial. Dedupea por tipo de dia (Upper x2 =
// una sola fila) porque no hay tracking real por sesion.
// ---------------------------------------------------------------------------
function deduplicarDiasPorTipo(rutinaPorDia) {
  const porTipo = new Map();
  for (const dia of rutinaPorDia) {
    if (!porTipo.has(dia.nombre_tipo)) {
      porTipo.set(dia.nombre_tipo, { ...dia, dias_semana: [dia.dia_semana] });
    } else {
      porTipo.get(dia.nombre_tipo).dias_semana.push(dia.dia_semana);
    }
  }
  return [...porTipo.values()];
}

export function generarWorkbookInvitado(payload) {
  const { nombre, objetivo, equipamiento, dias_especificos, exclusiones } = payload;

  const rutinaPorDia = armarRutina({
    diasEspecificos: dias_especificos,
    objetivo: objetivo.tipo,
    equipamiento: { ...equipamiento, musculosUbicacion: equipamiento.musculos_ubicacion },
    exclusiones,
  });
  const diasUnicos = deduplicarDiasPorTipo(rutinaPorDia);
  const filas = diasUnicos.flatMap((dia) =>
    dia.ejercicios.map((ej) => ({ dia_nombre: `${dia.nombre_tipo} (${dia.dias_semana.join(' y ')})`, ...ej }))
  );

  const workbook = construirWorkbook({
    filas,
    meta: { titulo: 'Plan de entrenamiento - 6 meses', nombre, objetivo, dias_especificos },
  });
  return { workbook };
}

// ---------------------------------------------------------------------------
// Usuario registrado: exporta la rutina activa con el historial real ya
// cargado (microciclos cerrados o en curso) y formulas vivas para lo que
// todavia no paso, para que sirva de respaldo/continuacion offline.
// ---------------------------------------------------------------------------
const CAPITALIZAR = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function generarWorkbookUsuario(usuarioId) {
  const rutina = db.prepare("SELECT * FROM rutina WHERE usuario_id = ? AND estado = 'activa'").get(usuarioId);
  if (!rutina) throw new Error('El usuario no tiene una rutina activa.');

  const usuario = db.prepare('SELECT nombre FROM usuarios WHERE id = ?').get(usuarioId);
  const objetivo = db.prepare('SELECT * FROM objetivo WHERE usuario_id = ?').get(usuarioId);
  const disponibilidad = db.prepare('SELECT * FROM disponibilidad WHERE usuario_id = ?').get(usuarioId);
  const diasEspecificos = JSON.parse(disponibilidad.dias_especificos_json);

  const dias = db.prepare('SELECT * FROM dia_rutina WHERE rutina_id = ? AND activo = 1 ORDER BY numero_dia').all(rutina.id);
  const ejStmt = db.prepare(`
    SELECT ea.*, e.nombre AS ejercicio_nombre, m.nombre AS musculo_nombre, e.es_compuesto_principal_fuerza
    FROM ejercicio_asignado ea
    JOIN ejercicio e ON e.id = ea.ejercicio_id
    JOIN musculo m ON m.id = ea.musculo_objetivo_id
    WHERE ea.dia_rutina_id = ?
    ORDER BY ea.orden
  `);

  const filas = [];
  for (const dia of dias) {
    for (const ea of ejStmt.all(dia.id)) {
      filas.push({
        ejercicio_asignado_id: ea.id,
        dia_nombre: CAPITALIZAR(dia.dia_semana),
        orden: ea.orden,
        nombre: ea.ejercicio_nombre,
        musculo: ea.musculo_nombre,
        es_top_de_musculo: Boolean(ea.es_top_de_musculo),
        rango_reps_min: ea.rango_reps_min,
        rango_reps_max: ea.rango_reps_max,
        tope_series: topeSeriesPara({ objetivo: objetivo.tipo, esCompuestoPrincipalFuerza: Boolean(ea.es_compuesto_principal_fuerza) }),
      });
    }
  }

  const microciclos = db.prepare('SELECT * FROM microciclo WHERE rutina_id = ? ORDER BY numero').all(rutina.id);
  const microciclo0 = microciclos.find((m) => m.numero === 0);
  const microciclosPorNumero = new Map(microciclos.map((m) => [m.numero, m]));
  const maxNumero = Math.max(0, ...microciclos.map((m) => m.numero));
  const numMicrociclos = Math.max(NUM_MICROCICLOS_DEFAULT, maxNumero + 2);

  const getProgreso = db.prepare('SELECT * FROM progreso_ejercicio_microciclo WHERE ejercicio_asignado_id = ? AND microciclo_id = ?');
  const getSerie1Testeo = db.prepare(`
    SELECT rs.reps FROM registro_serie rs JOIN registro_sesion s ON s.id = rs.registro_sesion_id
    WHERE rs.ejercicio_asignado_id = ? AND s.microciclo_id = ? AND rs.numero_serie = 1 LIMIT 1
  `);

  const semana0Datos = microciclo0
    ? filas.map((f) => {
        const microciclo1 = microciclosPorNumero.get(1);
        if (!microciclo1) return null;
        const progreso = getProgreso.get(f.ejercicio_asignado_id, microciclo1.id);
        if (!progreso) return null;
        const serie1 = getSerie1Testeo.get(f.ejercicio_asignado_id, microciclo0.id);
        return { peso: progreso.peso_prescrito, reps1: serie1?.reps ?? null, reps2: progreso.piso_reps };
      })
    : null;

  const progresionDatos = (filaIndex, mc) => {
    const microciclo = microciclosPorNumero.get(mc);
    if (!microciclo) return null;
    const progreso = getProgreso.get(filas[filaIndex].ejercicio_asignado_id, microciclo.id);
    if (!progreso || (progreso.sem1_reps == null && progreso.sem2_reps == null)) return null;
    return { sem1: progreso.sem1_reps, sem2: progreso.sem2_reps };
  };

  const workbook = construirWorkbook({
    filas,
    meta: { titulo: `Plan de entrenamiento - ${usuario.nombre}`, nombre: usuario.nombre, objetivo, dias_especificos: diasEspecificos },
    numMicrociclos,
    semana0Datos,
    progresionDatos,
  });
  return { workbook };
}
