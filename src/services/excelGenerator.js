import ExcelJS from 'exceljs';
import db from '../db/index.js';
import { armarRutina, topeSeriesPara } from './routineBuilder.js';
import { repsEfectivas } from './progressionEngine.js';
import { obtenerEvolucionNutricional } from './nutritionService.js';
import { obtenerConfigActiva, resolverConfigEntrenamiento } from './trainingConfigService.js';

// Labels igual que frontend/src/utils/nutricionLabels.js, duplicados aca por
// el mismo motivo que formatearMusculo (este archivo corre en el servidor).
const LABEL_FASE = { mantenimiento: 'Mantenimiento', volumen: 'Volumen', definicion: 'Definición' };
const LABEL_ENFOQUE = { estandar: 'Estándar', carbohidratos: 'Enfoque carbohidratos' };
const LABEL_NIVEL = { sin_entrenar: 'Sin entrenar', bajo: 'Bajo', intermedio: 'Intermedio', alto: 'Alto' };

// "deltoides_lateral" -> "deltoides lateral" (igual que formatearMusculo en
// frontend/src/utils/musculo.js, pero este archivo corre en el servidor).
const formatearMusculo = (nombre) => (nombre || '').replace(/_/g, ' ');

const NUM_MICROCICLOS_DEFAULT = 13; // 13 bloques de 2 semanas = 26 semanas ~ 6 meses

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
  config.addRow(['Incremento minimo de peso (kg)', meta.incrementoKg]);
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
  // Un invitado no tiene cuenta (ni usuario_id), asi que no puede tener
  // override propio - siempre arma con la config global vigente.
  const config = obtenerConfigActiva().config;

  const rutinaPorDia = armarRutina({
    diasEspecificos: dias_especificos,
    objetivo: objetivo.tipo,
    equipamiento: { ...equipamiento, musculosUbicacion: equipamiento.musculos_ubicacion },
    exclusiones,
    config,
  });
  const diasUnicos = deduplicarDiasPorTipo(rutinaPorDia);
  const filas = diasUnicos.flatMap((dia) =>
    dia.ejercicios.map((ej) => ({ dia_nombre: `${dia.nombre_tipo} (${dia.dias_semana.join(' y ')})`, ...ej }))
  );

  const workbook = construirWorkbook({
    filas,
    meta: { titulo: 'Plan de entrenamiento - 6 meses', nombre, objetivo, dias_especificos, incrementoKg: config.incrementoKg },
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
  const config = resolverConfigEntrenamiento(usuarioId);

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
        tope_series: topeSeriesPara({ objetivo: objetivo.tipo, esCompuestoPrincipalFuerza: Boolean(ea.es_compuesto_principal_fuerza) }, config),
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
    meta: { titulo: `Plan de entrenamiento - ${usuario.nombre}`, nombre: usuario.nombre, objetivo, dias_especificos: diasEspecificos, incrementoKg: config.incrementoKg },
    numMicrociclos,
    semana0Datos,
    progresionDatos,
  });
  return { workbook };
}

// ---------------------------------------------------------------------------
// Historial de entrenamiento: a diferencia de generarWorkbookUsuario (una
// planilla de calculo con formulas vivas para PROYECTAR el resto de la
// rutina), esta exporta lo que REALMENTE se entreno - una tabla por sesion
// ya registrada, pensada para leerse/imprimirse de corrido (pedido del
// usuario: "no hay una forma simple de seguir una rutina"), con los colores
// de la app (bordo/ambar, ver frontend/src/index.css --accent/--warning).
// ---------------------------------------------------------------------------
const COLOR_BORDO = 'FF7A2E2B'; // --accent (claro)
const COLOR_AMBAR = 'FFB8842E'; // --warning (claro)
const COLOR_HEADER_TABLA = 'FFF3E7E6'; // tinte claro del bordo
const COLOR_FILA_PAR = 'FFFBF7F6';
const COLOR_BLANCO = 'FFFFFFFF';
const COLOR_TEXTO = 'FF23221F';
// Comparacion contra lo pactado (progreso_ejercicio_microciclo): mejoro
// respecto al microciclo -> verde; por debajo -> rojo.
const COLOR_MEJORA_BG = 'FFDCEFE0';
const COLOR_MEJORA_TEXTO = 'FF1E6B3A';
const COLOR_EMPEORA_BG = 'FFF7DEDC';
const COLOR_EMPEORA_TEXTO = 'FF9C3B33';

// Color de fondo por grupo muscular (toda la fila de un ejercicio, para
// distinguir de un vistazo que musculo se trabaja sin tener que leer la
// celda de Ejercicio). 18 musculos en el catalogo son demasiados matices
// para distinguirse a simple vista (y la mayoria quedarian casi iguales en
// un tono pastel) - se agrupan en 7 categorias por funcion/zona, el mismo
// criterio con el que ya se arman los splits (empuje/traccion/piernas) en
// routineBuilder.js. Tintes claros (~85% blanco) de una paleta categorica
// de 7 matices bien diferenciables, con texto oscuro (COLOR_TEXTO) encima.
const GRUPO_POR_MUSCULO = {
  pecho: 'empuje', triceps: 'empuje', deltoides_anterior: 'empuje',
  espalda: 'traccion', dorsales: 'traccion', biceps: 'traccion', deltoides_posterior: 'traccion', trapecio: 'traccion',
  deltoides_lateral: 'hombro_lateral', deltoides: 'hombro_lateral', // "deltoides" a secas: musculo legado, ver migrarDeltoides en migrate.js
  cuadriceps: 'cuadriceps_gluteos', gluteos: 'cuadriceps_gluteos',
  isquiotibiales: 'isquios_cadera', abductores: 'isquios_cadera', aductores: 'isquios_cadera',
  pantorrillas: 'pantorrillas',
  abdominales: 'core', lumbares: 'core',
};
const COLOR_POR_GRUPO = {
  empuje: 'FFDFEBF9', // azul
  traccion: 'FFFCE8E1', // naranja
  hombro_lateral: 'FFDDF3EB', // agua
  cuadriceps_gluteos: 'FFFCF1D9', // amarillo
  isquios_cadera: 'FFFCEBF1', // magenta
  pantorrillas: 'FFD9ECD9', // verde
  core: 'FFE4E1F2', // violeta
};
const COLOR_GRUPO_DEFAULT = COLOR_FILA_PAR; // musculo nuevo sin mapear todavia

function colorDeMusculo(nombreMusculo) {
  const grupo = GRUPO_POR_MUSCULO[nombreMusculo];
  return COLOR_POR_GRUPO[grupo] || COLOR_GRUPO_DEFAULT;
}

// La cantidad de pares P/R (una por serie real) se arma a medida segun el
// maximo de series reales de TODO lo que se este exportando (no por tabla
// individual), para que todas las tablas del archivo tengan el mismo ancho
// de columnas - una serie extra cargada a mano (#64) o un compuesto de
// fuerza con tope de 6 (ver topeSeriesPara) puede necesitar mas de 4.
function construirColumnasHistorial(maxSeriesReales) {
  const columnas = ['Ejercicio', 'S'];
  for (let i = 1; i <= maxSeriesReales; i++) columnas.push(`P${i}`, `R${i}`);
  columnas.push('P-ds', 'R-ds', 'Descanso', 'RIR', 'RE');
  return columnas;
}
function anchoColumnasHistorial(maxSeriesReales) {
  const anchos = [{ width: 30 }, { width: 5 }];
  for (let i = 1; i <= maxSeriesReales; i++) anchos.push({ width: 6 }, { width: 6 });
  anchos.push({ width: 6 }, { width: 6 }, { width: 10 }, { width: 6 }, { width: 6 });
  return anchos;
}

const getDiaDeSesion = db.prepare('SELECT dia_semana, musculos_trabajados_json FROM dia_rutina WHERE id = ?');
const getMicrocicloInfo = db.prepare('SELECT numero, fecha_inicio FROM microciclo WHERE id = ?');
const getProgresoEjercicioMicrociclo = db.prepare(
  'SELECT peso_prescrito, piso_reps FROM progreso_ejercicio_microciclo WHERE ejercicio_asignado_id = ? AND microciclo_id = ?'
);
const getSeriesDeSesion = db.prepare(`
  SELECT rs.*, ea.orden, ea.descanso_segundos, e.nombre AS ejercicio_nombre, m.nombre AS musculo_nombre
  FROM registro_serie rs
  JOIN ejercicio_asignado ea ON ea.id = rs.ejercicio_asignado_id
  JOIN ejercicio e ON e.id = ea.ejercicio_id
  JOIN musculo m ON m.id = ea.musculo_objetivo_id
  WHERE rs.registro_sesion_id = ?
  ORDER BY ea.orden, rs.numero_serie
`);

// Arma una fila por ejercicio con las series reales en columnas P/R lado a
// lado (P1/R1, P2/R2...) en vez de comprimidas en texto ("20-18-16-14") -
// mas facil de leer/imprimir de un vistazo, igual que la planilla de papel
// que se usaba a mano. El peso/reps del dropset van en su propia columna.
//
// `progreso` (peso_prescrito/piso_reps de progreso_ejercicio_microciclo,
// o null si no hay - ej. semana de testeo) es "lo pactado" para ese
// ejercicio en ese microciclo, lo mismo que ya usa el motor de progresion
// para decidir "mejoro" al cerrar el bloque. El peso se compara contra el
// peso de la primera serie real; las reps, contra la ultima serie real
// (la mas cercana al fallo, mismo criterio que `techoDesde`) - pero SOLO
// si el peso no cambio: si subiste el peso es normal/esperable hacer
// menos reps, y si lo bajaste es esperable hacer mas, asi que en ambos
// casos comparar las reps contra el piso no dice nada util.
function resumirEjercicioDeSesion(series, progreso) {
  const reales = series.filter((s) => !s.es_dropset);
  const dropsets = series.filter((s) => s.es_dropset);
  const configEntrenamiento = obtenerConfigActiva().config;
  const repsEfectivasTotal = series.reduce((acc, s) => acc + (repsEfectivas(s.reps, s.rir, configEntrenamiento) ?? 0), 0);
  const ultimaReal = reales[reales.length - 1];

  let pesoColor = null;
  let repsColor = null;
  if (progreso && reales.length > 0) {
    const pesoUsado = reales[0].peso;
    if (pesoUsado > progreso.peso_prescrito) pesoColor = 'verde';
    else if (pesoUsado < progreso.peso_prescrito) pesoColor = 'rojo';

    if (pesoColor == null && ultimaReal) {
      if (ultimaReal.reps > progreso.piso_reps) repsColor = 'verde';
      else if (ultimaReal.reps < progreso.piso_reps) repsColor = 'rojo';
    }
  }

  return {
    nombre: series[0].ejercicio_nombre,
    musculo: series[0].musculo_nombre,
    series: reales.length,
    // Un par [peso, reps] por cada serie real, en orden - el caller rellena
    // con celdas vacias las columnas que sobren si otro ejercicio de la
    // misma tabla tuvo mas series.
    sets: reales.map((s) => ({ peso: s.peso, reps: s.reps })),
    // Multiples dropsets en el mismo ejercicio (raro, pero posible) se
    // comprimen en una sola celda - a diferencia de las series reales, no
    // tienen una columna propia por cada una.
    dropsetPeso: dropsets.length ? dropsets.map((d) => d.peso).join('-') : '',
    dropsetReps: dropsets.length ? dropsets.map((d) => d.reps).join('-') : '',
    descansoMin: Math.round(((series[0].descanso_segundos || 90) / 60) * 10) / 10,
    rir: ultimaReal?.rir ?? '',
    repsEfectivas: repsEfectivasTotal,
    pesoColor,
    repsColor,
  };
}

function estilarBanner(row, worksheet, color, numColumnas) {
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
    cell.font = { bold: true, color: { argb: COLOR_BLANCO }, size: 12 };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });
  worksheet.mergeCells(row.number, 1, row.number, numColumnas);
  // Altura fija para el banner de fecha (una linea); el de dia/musculos se
  // deja mas alto porque un dia con varios musculos entrenados (ej. "Lunes -
  // Pecho, Espalda, Biceps, Triceps...") puede necesitar 2 lineas para no
  // quedar clippeado con wrapText.
  row.height = color === COLOR_AMBAR ? 30 : 22;
}

// Separador grueso entre bloques (microciclos): distinto de los banners de
// sesion (bordo/ambar) para que se distinga de un vistazo donde termina un
// microciclo y empieza el siguiente al scrollear una rutina larga.
function agregarBannerMicrociclo(worksheet, numero, fechaInicio, numColumnas) {
  const inicio = new Date(`${fechaInicio}T00:00:00`);
  const fin = new Date(inicio);
  fin.setDate(fin.getDate() + 13);
  const rango = `${inicio.toLocaleDateString('es-AR')} al ${fin.toLocaleDateString('es-AR')}`;
  const fila = worksheet.addRow([`MICROCICLO ${numero}  ·  ${rango}`]);
  fila.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_TEXTO } };
    cell.font = { bold: true, color: { argb: COLOR_BLANCO }, size: 13 };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  worksheet.mergeCells(fila.number, 1, fila.number, numColumnas);
  fila.height = 24;
}

// `maxSeriesReales` viene de generarWorkbookHistorial (calculado sobre TODA
// la exportacion, no solo esta sesion) para que todas las tablas del
// archivo tengan el mismo ancho de columnas P/R.
function agregarSesionAlSheet(worksheet, sesion, maxSeriesReales) {
  const numColumnas = 2 + maxSeriesReales * 2 + 2 + 3; // Ejercicio+S, pares P/R, P-ds+R-ds, Descanso+RIR+RE
  const dia = getDiaDeSesion.get(sesion.dia_rutina_id);
  const musculos = JSON.parse(dia?.musculos_trabajados_json || '[]').map(formatearMusculo);
  const fechaFmt = new Date(`${sesion.fecha}T00:00:00`).toLocaleDateString('es-AR');

  const filaFecha = worksheet.addRow([`Fecha: ${fechaFmt}`]);
  const filaInicio = filaFecha.number;
  estilarBanner(filaFecha, worksheet, COLOR_BORDO, numColumnas);

  const tituloDia = `${CAPITALIZAR(dia?.dia_semana || '')} - ${musculos.map(CAPITALIZAR).join(', ')}`;
  const filaTitulo = worksheet.addRow([tituloDia]);
  estilarBanner(filaTitulo, worksheet, COLOR_AMBAR, numColumnas);

  const columnas = construirColumnasHistorial(maxSeriesReales);
  const filaHeader = worksheet.addRow(columnas);
  filaHeader.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_HEADER_TABLA } };
    cell.font = { bold: true, color: { argb: COLOR_TEXTO }, size: 11 };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = { bottom: { style: 'thin', color: { argb: COLOR_BORDO } } };
  });

  const seriesPorEjercicio = new Map();
  for (const s of getSeriesDeSesion.all(sesion.id)) {
    if (!seriesPorEjercicio.has(s.ejercicio_asignado_id)) seriesPorEjercicio.set(s.ejercicio_asignado_id, []);
    seriesPorEjercicio.get(s.ejercicio_asignado_id).push(s);
  }

  // Indices de columna (1-based) de cada bloque, para ubicar las celdas a
  // resaltar sin tener que contarlas a mano cada vez.
  const COL_EJERCICIO = 1;
  const COL_SERIES = 2;
  const COL_PRIMER_P = 3; // P1 esta en la 3, R1 en la 4, P2 en la 5...
  const colPds = COL_PRIMER_P + maxSeriesReales * 2;
  const colRds = colPds + 1;
  const colDescanso = colRds + 1;
  const colRir = colDescanso + 1;
  const colRe = colRir + 1;

  for (const [ejercicioAsignadoId, series] of seriesPorEjercicio.entries()) {
    const progreso = getProgresoEjercicioMicrociclo.get(ejercicioAsignadoId, sesion.microciclo_id);
    const r = resumirEjercicioDeSesion(series, progreso);

    const valores = new Array(numColumnas).fill('');
    valores[COL_EJERCICIO - 1] = r.nombre;
    valores[COL_SERIES - 1] = r.series;
    r.sets.forEach((set, idx) => {
      valores[COL_PRIMER_P - 1 + idx * 2] = set.peso;
      valores[COL_PRIMER_P + idx * 2] = set.reps;
    });
    valores[colPds - 1] = r.dropsetPeso;
    valores[colRds - 1] = r.dropsetReps;
    valores[colDescanso - 1] = r.descansoMin;
    valores[colRir - 1] = r.rir;
    valores[colRe - 1] = r.repsEfectivas;

    const fila = worksheet.addRow(valores);
    const colorFila = colorDeMusculo(r.musculo);
    fila.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.alignment = { horizontal: colNumber === COL_EJERCICIO ? 'left' : 'center', vertical: 'middle' };
      cell.border = { bottom: { style: 'hair', color: { argb: 'FFE4E2DC' } } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colorFila } };
    });

    // El peso/reps que entran en la comparacion contra lo pactado son los
    // de la PRIMERA serie real (peso) y la ULTIMA (reps) - ver el criterio
    // completo en el comentario de resumirEjercicioDeSesion.
    if (r.pesoColor === 'verde' || r.pesoColor === 'rojo') {
      const celdaPeso = fila.getCell(COL_PRIMER_P);
      const [bg, texto] = r.pesoColor === 'verde' ? [COLOR_MEJORA_BG, COLOR_MEJORA_TEXTO] : [COLOR_EMPEORA_BG, COLOR_EMPEORA_TEXTO];
      celdaPeso.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      celdaPeso.font = { color: { argb: texto }, bold: true };
    }
    if (r.repsColor === 'verde' || r.repsColor === 'rojo') {
      const colUltimaReps = COL_PRIMER_P + 1 + (r.sets.length - 1) * 2;
      const celdaReps = fila.getCell(colUltimaReps);
      const [bg, texto] = r.repsColor === 'verde' ? [COLOR_MEJORA_BG, COLOR_MEJORA_TEXTO] : [COLOR_EMPEORA_BG, COLOR_EMPEORA_TEXTO];
      celdaReps.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      celdaReps.font = { color: { argb: texto }, bold: true };
    }
  }

  worksheet.addRow([]); // separador entre sesiones

  return { filaInicio, dia, musculos, cantEjercicios: seriesPorEjercicio.size };
}

// microcicloDesde/microcicloHasta (numero de microciclo, inclusive) filtran
// el rango de bloques a incluir; sesionId, si viene, ignora el rango y
// exporta esa unica sesion. Sin ninguno de los dos, exporta toda la rutina.
export function generarWorkbookHistorial(usuarioId, { microcicloDesde = null, microcicloHasta = null, sesionId = null } = {}) {
  const rutina = db.prepare("SELECT * FROM rutina WHERE usuario_id = ? AND estado = 'activa'").get(usuarioId);
  if (!rutina) throw new Error('El usuario no tiene una rutina activa.');
  const usuario = db.prepare('SELECT nombre FROM usuarios WHERE id = ?').get(usuarioId);

  let sesiones;
  if (sesionId) {
    sesiones = db.prepare('SELECT * FROM registro_sesion WHERE id = ? AND usuario_id = ? AND salteada = 0').all(sesionId, usuarioId);
    if (sesiones.length === 0) throw new Error('Esa sesion no existe o no tiene series registradas.');
  } else {
    const microciclos = db.prepare('SELECT id, numero FROM microciclo WHERE rutina_id = ?').all(rutina.id);
    const idsPermitidos = microciclos
      .filter((m) => (microcicloDesde == null || m.numero >= microcicloDesde) && (microcicloHasta == null || m.numero <= microcicloHasta))
      .map((m) => m.id);
    if (idsPermitidos.length === 0) throw new Error('No hay microciclos en ese rango.');
    const placeholders = idsPermitidos.map(() => '?').join(',');
    sesiones = db.prepare(
      `SELECT * FROM registro_sesion WHERE usuario_id = ? AND salteada = 0 AND microciclo_id IN (${placeholders}) ORDER BY fecha ASC, id ASC`
    ).all(usuarioId, ...idsPermitidos);
  }
  if (sesiones.length === 0) throw new Error('No hay sesiones registradas para exportar en ese rango.');

  // Cuanta series reales (sin dropset) tiene el ejercicio con MAS series de
  // toda la exportacion, para que todas las tablas del archivo compartan el
  // mismo ancho de columnas P/R (ver construirColumnasHistorial).
  const placeholdersSesiones = sesiones.map(() => '?').join(',');
  const { maxCnt } = db.prepare(`
    SELECT MAX(cnt) AS maxCnt FROM (
      SELECT COUNT(*) AS cnt FROM registro_serie
      WHERE registro_sesion_id IN (${placeholdersSesiones}) AND es_dropset = 0
      GROUP BY registro_sesion_id, ejercicio_asignado_id
    )
  `).get(...sesiones.map((s) => s.id));
  const maxSeriesReales = maxCnt || 4; // 4 cubre el caso comun (hipertrofia); compuestos de fuerza llegan a 6.
  const numColumnas = 2 + maxSeriesReales * 2 + 2 + 3;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'nac_asesoria';
  wb.created = new Date();
  wb.views = [{ activeTab: 0 }];

  // Con mas de una sesion armamos una hoja "Indice" AL FRENTE (primera
  // solapa, la que Excel abre por defecto), con un link por sesion que
  // salta directo a su tabla en "Historial" - sin esto, una rutina de
  // varios meses exportada entera es un solo scroll interminable sin forma
  // de ubicarse (pedido: que la vista sea "mas ordenada e intuitiva").
  const indice = sesiones.length > 1 ? wb.addWorksheet('Indice') : null;

  const sheet = wb.addWorksheet('Historial');
  sheet.columns = anchoColumnasHistorial(maxSeriesReales);

  const filaTitulo = sheet.addRow([`Historial de entrenamiento - ${usuario.nombre}`]);
  sheet.mergeCells(filaTitulo.number, 1, filaTitulo.number, numColumnas);
  filaTitulo.getCell(1).font = { bold: true, size: 14, color: { argb: COLOR_BORDO } };
  filaTitulo.height = 26;

  const filaLeyenda = sheet.addRow([
    'S: series  ·  P/R: peso y reps de cada serie (P-ds/R-ds: dropset)  ·  RIR: reps en reserva  ·  RE: reps efectivas  ·  ' +
      'Verde: mejoraste respecto a lo pactado  ·  Rojo: por debajo de lo pactado  ·  El color de fondo de cada fila indica el músculo trabajado',
  ]);
  sheet.mergeCells(filaLeyenda.number, 1, filaLeyenda.number, numColumnas);
  filaLeyenda.getCell(1).font = { italic: true, size: 10, color: { argb: 'FF837F77' } };
  sheet.addRow([]);

  if (indice) {
    indice.columns = [{ width: 5 }, { width: 13 }, { width: 14 }, { width: 34 }, { width: 11 }, { width: 10 }];
    const filaHeaderIndice = indice.addRow(['#', 'Fecha', 'Dia', 'Musculos', 'Ejercicios', 'Ir a']);
    filaHeaderIndice.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_BORDO } };
      cell.font = { bold: true, color: { argb: COLOR_BLANCO } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    filaHeaderIndice.height = 20;
  }

  let microcicloAnterior = null;
  let contador = 0;
  for (const sesion of sesiones) {
    const mc = getMicrocicloInfo.get(sesion.microciclo_id);
    if (mc && mc.numero !== microcicloAnterior) {
      agregarBannerMicrociclo(sheet, mc.numero, mc.fecha_inicio, numColumnas);
      microcicloAnterior = mc.numero;
    }
    contador += 1;
    const { filaInicio, dia, musculos, cantEjercicios } = agregarSesionAlSheet(sheet, sesion, maxSeriesReales);
    if (indice) {
      const fechaFmt = new Date(`${sesion.fecha}T00:00:00`).toLocaleDateString('es-AR');
      const filaIdx = indice.addRow([
        contador,
        fechaFmt,
        CAPITALIZAR(dia?.dia_semana || ''),
        musculos.map(CAPITALIZAR).join(', '),
        cantEjercicios,
        'Ver ▸',
      ]);
      const celdaLink = filaIdx.getCell(6);
      celdaLink.value = { text: 'Ver ▸', hyperlink: `#Historial!A${filaInicio}` };
      celdaLink.font = { color: { argb: COLOR_BORDO }, underline: true, bold: true };
      celdaLink.alignment = { horizontal: 'center' };
      if (contador % 2 === 0) {
        filaIdx.eachCell((cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_FILA_PAR } };
        });
      }
      filaIdx.eachCell((cell, colNumber) => {
        if (colNumber !== 6) cell.alignment = { horizontal: colNumber <= 3 ? 'center' : 'left', vertical: 'middle' };
        cell.border = { bottom: { style: 'hair', color: { argb: 'FFE4E2DC' } } };
      });
    }
  }

  return { workbook: wb };
}

// ---------------------------------------------------------------------------
// Export de nutricion: 2 hojas, "Planes" (historial completo, activo +
// archivados - reusa obtenerEvolucionNutricional, que ya recalcula cada uno
// con la config que le corresponde) y "Pesajes" (registro_antropometrico
// crudo, que alimenta la tendencia de peso real del modo objetivo). No
// existia ninguna exportacion de nutricion antes de esto.
// ---------------------------------------------------------------------------

const COLUMNAS_PLANES = ['Fecha', 'Estado', 'Fase', 'Enfoque', 'Nivel actividad', 'Peso referencia (kg)', 'Kcal', 'Proteína (g)', 'Grasa (g)', 'Carbohidratos (g)', 'Objetivo'];
const COLUMNAS_PESAJES = ['Fecha', 'Peso corporal (kg)', '% graso (pliegues)', '% graso', '% muscular'];

function formatearFechaHistorial(iso) {
  return new Date(`${iso.replace(' ', 'T')}${iso.includes('Z') ? '' : 'Z'}`).toLocaleDateString('es-AR');
}

function estilarHeaderTabla(row) {
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_HEADER_TABLA } };
    cell.font = { bold: true, color: { argb: COLOR_TEXTO }, size: 11 };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = { bottom: { style: 'thin', color: { argb: COLOR_BORDO } } };
  });
}

// Tabla de planes de nutricion (fecha/estado/fase/enfoque/.../objetivo) -
// compartida entre el export de nutricion sola y el reporte combinado (ver
// generarWorkbookReporte), para no duplicar el armado de filas.
function agregarTablaPlanes(sheet, planes, { conEncabezadoVacio = 'Todavía no armaste ningún plan de nutrición.' } = {}) {
  if (planes.length === 0) {
    sheet.addRow([conEncabezadoVacio]);
    return;
  }
  const filaHeader = sheet.addRow(COLUMNAS_PLANES);
  estilarHeaderTabla(filaHeader);

  planes.forEach((p, i) => {
    const objetivo = p.goal_fat_kg ? `Perder ${p.goal_fat_kg} kg en ${p.weeks} semana${p.weeks === 1 ? '' : 's'}` : '';
    const fila = sheet.addRow([
      formatearFechaHistorial(p.created_at),
      p.status === 'active' ? 'Activo' : 'Archivado',
      LABEL_FASE[p.phase] || p.phase,
      LABEL_ENFOQUE[p.focus] || p.focus,
      LABEL_NIVEL[p.activity_level] || p.activity_level,
      p.reference_weight_kg,
      p.kcal,
      p.proteinaG,
      p.grasaG,
      p.carbohidratosG,
      objetivo,
    ]);
    fila.eachCell((cell, colNumber) => {
      cell.alignment = { horizontal: colNumber >= 6 && colNumber <= 10 ? 'right' : 'left', vertical: 'middle' };
      cell.border = { bottom: { style: 'hair', color: { argb: 'FFE4E2DC' } } };
      if (i % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_FILA_PAR } };
    });
    if (p.status === 'active') {
      fila.getCell(2).font = { bold: true, color: { argb: COLOR_MEJORA_TEXTO } };
    }
  });
}

export function generarWorkbookNutricion(usuarioId) {
  const usuario = db.prepare('SELECT nombre FROM usuarios WHERE id = ?').get(usuarioId);
  if (!usuario) throw new Error('Usuario no encontrado.');

  const planes = obtenerEvolucionNutricional(usuarioId);
  const pesajes = db.prepare(`
    SELECT fecha, peso_corporal, porcentaje_graso_calculado, porcentaje_graso, porcentaje_muscular
    FROM registro_antropometrico WHERE usuario_id = ? AND peso_corporal IS NOT NULL
    ORDER BY fecha
  `).all(usuarioId);

  if (planes.length === 0 && pesajes.length === 0) {
    throw new Error('Todavía no hay ningún plan de nutrición ni pesaje cargado para exportar.');
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = 'nac_asesoria';
  wb.created = new Date();
  wb.views = [{ activeTab: 0 }];

  const sheetPlanes = wb.addWorksheet('Planes');
  sheetPlanes.columns = [{ width: 12 }, { width: 11 }, { width: 14 }, { width: 18 }, { width: 14 }, { width: 18 }, { width: 8 }, { width: 12 }, { width: 10 }, { width: 16 }, { width: 28 }];

  const filaTitulo = sheetPlanes.addRow([`Historial de nutrición - ${usuario.nombre}`]);
  sheetPlanes.mergeCells(filaTitulo.number, 1, filaTitulo.number, COLUMNAS_PLANES.length);
  filaTitulo.getCell(1).font = { bold: true, size: 14, color: { argb: COLOR_BORDO } };
  filaTitulo.height = 26;
  sheetPlanes.addRow([]);

  agregarTablaPlanes(sheetPlanes, planes);

  const sheetPesajes = wb.addWorksheet('Pesajes');
  sheetPesajes.columns = [{ width: 12 }, { width: 18 }, { width: 16 }, { width: 10 }, { width: 12 }];

  const filaTituloPesajes = sheetPesajes.addRow(['Historial de pesajes']);
  sheetPesajes.mergeCells(filaTituloPesajes.number, 1, filaTituloPesajes.number, COLUMNAS_PESAJES.length);
  filaTituloPesajes.getCell(1).font = { bold: true, size: 14, color: { argb: COLOR_BORDO } };
  filaTituloPesajes.height = 26;

  const filaLeyendaPesajes = sheetPesajes.addRow([
    'Pesajes sueltos cargados desde "Registrar peso de hoy" en Nutrición - alimentan la tendencia de peso real del modo objetivo.',
  ]);
  sheetPesajes.mergeCells(filaLeyendaPesajes.number, 1, filaLeyendaPesajes.number, COLUMNAS_PESAJES.length);
  filaLeyendaPesajes.getCell(1).font = { italic: true, size: 10, color: { argb: 'FF837F77' } };
  sheetPesajes.addRow([]);

  if (pesajes.length === 0) {
    sheetPesajes.addRow(['Todavía no cargaste ningún pesaje.']);
  } else {
    const filaHeaderPesajes = sheetPesajes.addRow(COLUMNAS_PESAJES);
    estilarHeaderTabla(filaHeaderPesajes);

    pesajes.forEach((p, i) => {
      const fila = sheetPesajes.addRow([
        new Date(`${p.fecha}T00:00:00`).toLocaleDateString('es-AR'),
        p.peso_corporal,
        p.porcentaje_graso_calculado ?? '',
        p.porcentaje_graso ?? '',
        p.porcentaje_muscular ?? '',
      ]);
      fila.eachCell((cell, colNumber) => {
        cell.alignment = { horizontal: colNumber === 1 ? 'left' : 'right', vertical: 'middle' };
        cell.border = { bottom: { style: 'hair', color: { argb: 'FFE4E2DC' } } };
        if (i % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_FILA_PAR } };
      });
    });
  }

  return { workbook: wb };
}

// ---------------------------------------------------------------------------
// Export de un reporte ya generado (ver generarDatosReporte en
// reportes.js): el UNICO lugar de la app donde entrenamiento y nutricion ya
// estan cruzados en un mismo objeto - reusa exactamente los `datos`
// guardados en su momento (reporte_progreso.datos_json), nunca recalcula
// con informacion mas nueva, para que el export coincida con lo que se vio
// en pantalla al generarlo.
// ---------------------------------------------------------------------------

function agregarFilaVacia(sheet, numColumnas, texto) {
  const fila = sheet.addRow([texto]);
  sheet.mergeCells(fila.number, 1, fila.number, numColumnas);
  fila.getCell(1).font = { italic: true, color: { argb: 'FF837F77' } };
}

export function generarWorkbookReporte(datos, usuarioNombre, tipo) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'nac_asesoria';
  wb.created = new Date();
  wb.views = [{ activeTab: 0 }];

  // ---- Resumen: peso corporal y volumen por musculo, uno al lado del otro
  // en la misma hoja - no se buscan hacer coincidir fila a fila por fecha
  // (son 2 lineas de tiempo independientes, entrenamiento por microciclo y
  // nutricion por plan), pero verlos uno al lado del otro ya alcanza para
  // que un coach cruce a ojo "bajó de peso mientras el volumen subía", que
  // es el cruce que se pidió.
  const sheetResumen = wb.addWorksheet('Resumen');
  sheetResumen.columns = [
    { width: 12 }, { width: 12 }, { width: 14 }, { width: 3 },
    { width: 18 }, { width: 22 }, { width: 22 },
  ];
  const filaTitulo = sheetResumen.addRow([`Reporte de progreso (${tipo}) - ${usuarioNombre}`]);
  sheetResumen.mergeCells(filaTitulo.number, 1, filaTitulo.number, 7);
  filaTitulo.getCell(1).font = { bold: true, size: 14, color: { argb: COLOR_BORDO } };
  filaTitulo.height = 26;
  sheetResumen.addRow([`Período: ${datos.periodo}  ·  Microciclos cerrados: ${datos.microciclos_cerrados}`]).getCell(1).font = { italic: true, size: 10, color: { argb: 'FF837F77' } };
  sheetResumen.addRow([]);

  const filaHeaderResumen = sheetResumen.addRow(['Fecha', 'Peso (kg)', 'Fase', null, 'Músculo', 'Volumen: inicial → actual', 'Reps efectivas: inicial → actual']);
  estilarHeaderTabla(filaHeaderResumen);

  const filasPeso = datos.nutricion.map((p) => [formatearFechaHistorial(p.created_at), p.reference_weight_kg, LABEL_FASE[p.phase] || p.phase]);
  const filasVolumen = datos.porMusculo.map((m) => {
    const h = m.historial;
    const volumenTexto = h.length ? `${h[0].volumen_directo} → ${h[h.length - 1].volumen_directo}` : 'sin datos';
    const reTexto = h.length ? `${h[0].reps_efectivas} → ${h[h.length - 1].reps_efectivas}` : 'sin datos';
    return [CAPITALIZAR(formatearMusculo(m.musculo)), volumenTexto, reTexto];
  });
  const filasTotales = Math.max(filasPeso.length, filasVolumen.length);
  for (let i = 0; i < filasTotales; i++) {
    const peso = filasPeso[i] || ['', '', ''];
    const volumen = filasVolumen[i] || ['', '', ''];
    const fila = sheetResumen.addRow([...peso, null, ...volumen]);
    fila.eachCell((cell, colNumber) => {
      if (colNumber === 4) return;
      cell.alignment = { horizontal: colNumber === 1 || colNumber === 5 ? 'left' : 'right', vertical: 'middle' };
      cell.border = { bottom: { style: 'hair', color: { argb: 'FFE4E2DC' } } };
      if (i % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_FILA_PAR } };
    });
  }
  if (filasTotales === 0) agregarFilaVacia(sheetResumen, 7, 'Todavía no hay datos de entrenamiento ni de nutrición para este reporte.');

  // ---- Por ejercicio: el detalle que en pantalla (ReportesPage.jsx) se ve
  // comprimido en texto con flechas ("20kg×8 → 24kg×10") - aca cada dato
  // tiene su propia columna.
  const sheetEjercicio = wb.addWorksheet('Por ejercicio');
  sheetEjercicio.columns = [{ width: 28 }, { width: 16 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }];
  const headerEj = sheetEjercicio.addRow(['Ejercicio', 'Músculo', 'Peso inicial (kg)', 'Peso actual (kg)', 'Reps piso inicial', 'Reps techo actual', 'Reps efectivas totales']);
  estilarHeaderTabla(headerEj);
  if (datos.porEjercicio.length === 0) {
    agregarFilaVacia(sheetEjercicio, 7, 'Todavía no hay microciclos cerrados con datos de ejercicios.');
  } else {
    datos.porEjercicio.forEach((e, i) => {
      const totalRe = e.historial.reduce((acc, h) => acc + (h.reps_efectivas || 0), 0);
      const fila = sheetEjercicio.addRow([e.ejercicio_nombre, CAPITALIZAR(formatearMusculo(e.musculo_nombre)), e.peso_inicial, e.peso_actual, e.reps_piso_inicial, e.reps_techo_actual, totalRe]);
      fila.eachCell((cell, colNumber) => {
        cell.alignment = { horizontal: colNumber <= 2 ? 'left' : 'right', vertical: 'middle' };
        cell.border = { bottom: { style: 'hair', color: { argb: 'FFE4E2DC' } } };
        if (i % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_FILA_PAR } };
      });
    });
  }

  // ---- Por musculo: una fila por musculo x microciclo (el detalle completo
  // que en pantalla tambien queda comprimido con flechas).
  const sheetMusculo = wb.addWorksheet('Por músculo');
  sheetMusculo.columns = [{ width: 18 }, { width: 11 }, { width: 16 }, { width: 16 }, { width: 14 }, { width: 11 }];
  const headerMus = sheetMusculo.addRow(['Músculo', 'Microciclo', 'Volumen directo', 'Volumen indirecto', 'Reps efectivas', 'Estancado']);
  estilarHeaderTabla(headerMus);
  const filasMusculo = datos.porMusculo.flatMap((m) => m.historial.map((h) => ({ musculo: m.musculo, ...h })));
  if (filasMusculo.length === 0) {
    agregarFilaVacia(sheetMusculo, 6, 'Todavía no hay microciclos cerrados con datos de volumen muscular.');
  } else {
    filasMusculo.forEach((h, i) => {
      const fila = sheetMusculo.addRow([CAPITALIZAR(formatearMusculo(h.musculo)), h.numero, h.volumen_directo, h.volumen_indirecto, h.reps_efectivas, h.estancado ? 'Sí' : 'No']);
      fila.eachCell((cell, colNumber) => {
        cell.alignment = { horizontal: colNumber === 1 ? 'left' : 'center', vertical: 'middle' };
        cell.border = { bottom: { style: 'hair', color: { argb: 'FFE4E2DC' } } };
        if (i % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_FILA_PAR } };
      });
      if (h.estancado) fila.getCell(6).font = { color: { argb: COLOR_EMPEORA_TEXTO }, bold: true };
    });
  }

  // ---- Nutricion: misma tabla que el export de nutricion sola.
  const sheetNutricion = wb.addWorksheet('Nutrición');
  sheetNutricion.columns = [{ width: 12 }, { width: 11 }, { width: 14 }, { width: 18 }, { width: 14 }, { width: 18 }, { width: 8 }, { width: 12 }, { width: 10 }, { width: 16 }, { width: 28 }];
  agregarTablaPlanes(sheetNutricion, datos.nutricion, { conEncabezadoVacio: 'Este usuario todavía no armó ningún plan de nutrición.' });

  return { workbook: wb };
}
