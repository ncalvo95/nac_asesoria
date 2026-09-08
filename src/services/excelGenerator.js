import ExcelJS from 'exceljs';
import db from '../db/index.js';
import { armarRutina } from './routineBuilder.js';

const NUM_MICROCICLOS = 13; // 13 bloques de 2 semanas = 26 semanas ~ 6 meses
const INCREMENTO_KG_DEFAULT = 2.5;

const TODOS_MUSCULOS = [
  'pecho', 'espalda', 'dorsales', 'deltoides', 'biceps', 'triceps',
  'abdominales', 'cuadriceps', 'isquiotibiales', 'gluteos', 'pantorrillas',
];

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

function aplanarEjercicios(diasUnicos) {
  const filas = [];
  for (const dia of diasUnicos) {
    for (const ej of dia.ejercicios) {
      filas.push({
        dia_nombre: dia.nombre_tipo,
        dias_semana: dia.dias_semana.join(' y '),
        ...ej,
      });
    }
  }
  return filas;
}

const getMusculosConVolumen = db.prepare(`
  SELECT m.nombre, r.mev, r.mav, r.mrv
  FROM musculo m JOIN referencia_volumen_muscular r ON r.musculo_id = m.id
  ORDER BY m.id
`);

export function generarWorkbookInvitado(payload) {
  const { nombre, objetivo, equipamiento, dias_especificos, exclusiones } = payload;

  const rutinaPorDia = armarRutina({
    diasEspecificos: dias_especificos,
    objetivo: objetivo.tipo,
    equipamiento,
    exclusiones,
  });
  const diasUnicos = deduplicarDiasPorTipo(rutinaPorDia);
  const filas = aplanarEjercicios(diasUnicos);
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
  info.addRow(['Plan de entrenamiento - 6 meses']);
  info.addRow(['Nombre', nombre || '']);
  info.addRow(['Objetivo', objetivo.tipo]);
  info.addRow(['Sub-objetivo', objetivo.sub_objetivo || '']);
  if (objetivo.deporte) info.addRow(['Deporte', objetivo.deporte]);
  info.addRow(['Dias por semana', dias_especificos.join(', ')]);
  info.addRow(['Fecha de generacion', new Date().toLocaleDateString('es-AR')]);
  info.addRow([]);
  info.addRow(['Como usar este archivo']);
  info.addRow(['1. Completa la hoja "Semana0_Testeo": elegi un peso por ejercicio con el que creas poder hacer entre 12 y 16 repeticiones, y cargá 2 series a ese mismo peso.']);
  info.addRow(['2. La hoja "Progresion" se autocompleta a partir de eso: cada bloque de 2 semanas (microciclo) toma como piso el techo del bloque anterior.']);
  info.addRow(['3. Por cada microciclo cargá las repeticiones logradas en la semana 1 y semana 2 de cada ejercicio (columnas K y L). El resto de las columnas de esa fila son formulas, no las edites.']);
  info.addRow(['4. Trabajá siempre en RIR 0-2 (idealmente 1). No se usa RPE ni tempo.']);
  info.addRow(['5. Si una sesion no entra en el tiempo que tenes disponible, priorizá los ejercicios compuestos y recorta accesorios (filas) antes que apurar la tecnica.']);
  info.addRow([]);
  info.addRow(['Simplificaciones de esta version liviana (Excel)']);
  info.addRow(['- No incluye modo "lineal forzado" por ejercicio: si no llegas al minimo de reps, el peso baja automaticamente el proximo microciclo.']);
  info.addRow(['- Solo trackea volumen directo (musculo primario). El volumen indirecto no se calcula aca.']);
  info.addRow(['- Cuando un mismo tipo de dia se repite en la semana (ej. Upper x2), anotá el resultado de tu ultima sesion de esa semana con ese ejercicio.']);
  info.addRow(['- No incluye semana de descarga (deload): es opcional y a pedido, agregala manualmente si la necesitas.']);
  info.addRow(['- La app completa (con cuenta) resuelve todo esto de forma automatica.']);
  info.getColumn(1).width = 90;

  // ---- Rutina ----
  const rutinaSheet = wb.addWorksheet('Rutina');
  rutinaSheet.addRow(['Dia', 'Dias de la semana', 'Orden', 'Ejercicio', 'Musculo', 'Top de musculo', 'Rango reps']);
  filas.forEach((f) => {
    rutinaSheet.addRow([f.dia_nombre, f.dias_semana, f.orden, f.nombre, f.musculo, f.es_top_de_musculo ? 'Si' : 'No', `${f.rango_reps_min}-${f.rango_reps_max}`]);
  });
  rutinaSheet.columns.forEach((c) => { c.width = 20; });
  rutinaSheet.getColumn(4).width = 34;

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
    semana0.addRow([
      f.nombre, f.musculo, f.es_top_de_musculo ? 1 : 0, null, null, null,
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

  for (let mc = 1; mc <= NUM_MICROCICLOS; mc++) {
    filas.forEach((f, i) => {
      const row = 2 + (mc - 1) * nRows + i;
      const semana0Row = 2 + i;
      const prevRow = row - nRows;
      const muscleRow = 2 + (mc - 1) * TODOS_MUSCULOS.length + muscleIndex.get(f.musculo);

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
        null, null,
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
  const progUltimaFila = 1 + nRows * NUM_MICROCICLOS;
  for (let mc = 1; mc <= NUM_MICROCICLOS; mc++) {
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

  return { workbook: wb, resumenRutina: { diasUnicos, nRows } };
}
