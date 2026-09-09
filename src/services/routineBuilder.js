import db from '../db/index.js';

export const TODOS_MUSCULOS = [
  'pecho', 'espalda', 'dorsales', 'deltoides', 'biceps', 'triceps',
  'abdominales', 'cuadriceps', 'isquiotibiales', 'gluteos', 'pantorrillas',
];

const GRANDES = ['cuadriceps', 'isquiotibiales', 'gluteos', 'espalda', 'dorsales', 'pecho'];
const SECUNDARIOS = ['deltoides', 'biceps', 'triceps', 'abdominales', 'pantorrillas'];
const UPPER = ['pecho', 'espalda', 'dorsales', 'deltoides', 'biceps', 'triceps'];
const LOWER = ['cuadriceps', 'isquiotibiales', 'gluteos', 'pantorrillas', 'abdominales'];
const TORSO_GENERAL = ['pecho', 'espalda', 'dorsales', 'deltoides', 'biceps', 'triceps', 'abdominales'];
const PIERNA_GENERAL = ['cuadriceps', 'isquiotibiales', 'gluteos', 'pantorrillas'];
const PUSH = ['pecho', 'deltoides', 'triceps'];
const PULL = ['espalda', 'dorsales', 'biceps'];
const LEGS = ['cuadriceps', 'isquiotibiales', 'gluteos', 'pantorrillas', 'abdominales'];

// Determina la secuencia de "tipos de dia" (con sus musculos objetivo) segun
// la cantidad de dias/semana disponibles, siguiendo la tabla de §3 del spec.
// diasEspecificos debe venir ya ordenado cronologicamente (lunes -> domingo).
export function armarSecuenciaDeDias(diasEspecificos) {
  const n = diasEspecificos.length;
  const consecutivos = n === 3 && sonConsecutivos(diasEspecificos);

  let tipos;
  if (n === 2) {
    tipos = [{ nombre: 'Full Body', musculos: TODOS_MUSCULOS }, { nombre: 'Full Body', musculos: TODOS_MUSCULOS }];
  } else if (n === 3 && !consecutivos) {
    tipos = Array.from({ length: 3 }, () => ({ nombre: 'Full Body', musculos: TODOS_MUSCULOS }));
  } else if (n === 3 && consecutivos) {
    tipos = [
      { nombre: 'Dia 1 (musculos grandes)', musculos: GRANDES },
      { nombre: 'Dia 2 (musculos secundarios)', musculos: SECUNDARIOS },
      { nombre: 'Dia 3 (musculos grandes)', musculos: GRANDES },
    ];
  } else if (n === 4) {
    tipos = [
      { nombre: 'Upper', musculos: UPPER },
      { nombre: 'Lower', musculos: LOWER },
      { nombre: 'Upper', musculos: UPPER },
      { nombre: 'Lower', musculos: LOWER },
    ];
  } else if (n === 5) {
    tipos = [
      { nombre: 'Torso', musculos: TORSO_GENERAL },
      { nombre: 'Pierna', musculos: PIERNA_GENERAL },
      { nombre: 'Push', musculos: PUSH },
      { nombre: 'Pull', musculos: PULL },
      { nombre: 'Legs', musculos: LEGS },
    ];
  } else if (n === 6) {
    tipos = [
      { nombre: 'Push', musculos: PUSH },
      { nombre: 'Pull', musculos: PULL },
      { nombre: 'Legs', musculos: LEGS },
      { nombre: 'Push', musculos: PUSH },
      { nombre: 'Pull', musculos: PULL },
      { nombre: 'Legs', musculos: LEGS },
    ];
  } else {
    throw new Error(`Dias por semana no soportado: ${n}. Debe ser entre 2 y 6.`);
  }

  return diasEspecificos.map((dia, i) => ({ dia_semana: dia, ...tipos[i] }));
}

const ORDEN_DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
function sonConsecutivos(dias) {
  const indices = dias.map((d) => ORDEN_DIAS.indexOf(d)).sort((a, b) => a - b);
  return indices.every((idx, i) => i === 0 || idx === indices[i - 1] + 1);
}

const TAGS_GIMNASIO = ['barra', 'mancuernas', 'banco', 'polea', 'maquina', 'paralelas', 'barra_dominadas', 'peso_corporal'];

// Con equipamiento "mixto", cada musculo puede tener su propia ubicacion
// (casa/gimnasio) via musculosUbicacion[musculo] - no es obligatorio
// especificar todos: el que falta cae en "gimnasio" por default. Con
// tipo "gimnasio"/"casa" (uniforme), musculo/musculosUbicacion se ignoran.
export function tagsDisponibles({ tipo, checklist, musculo, musculosUbicacion }) {
  const base = new Set(checklist || []);
  base.add('peso_corporal');
  const ubicacionEfectiva = tipo === 'mixto' ? (musculosUbicacion?.[musculo] || 'gimnasio') : tipo;
  if (ubicacionEfectiva === 'gimnasio') TAGS_GIMNASIO.forEach((t) => base.add(t));
  return base;
}

export function rangoRepsPara({ musculo, objetivo, esCompuestoPrincipalFuerza, region }) {
  if (objetivo === 'rendimiento' && region === 'pierna') return { min: 8, max: 18 };
  if (objetivo === 'fuerza' && esCompuestoPrincipalFuerza) return { min: 6, max: 10 };
  return { min: 8, max: 16 };
}

export function topeSeriesPara({ objetivo, esCompuestoPrincipalFuerza }) {
  return objetivo === 'fuerza' && esCompuestoPrincipalFuerza ? 6 : 4;
}

export const SERIES_MINIMO = 2;
export const INCREMENTO_KG_DEFAULT = 2.5;

const getEjerciciosPorMusculo = db.prepare(`
  SELECT e.*, m.nombre AS musculo_nombre, m.region AS musculo_region
  FROM ejercicio e JOIN musculo m ON m.id = e.musculo_primario_id
  WHERE m.nombre = ? AND e.activo = 1
`);

// Estimado de minutos por ejercicio (series de trabajo + descanso entre
// series + transicion al siguiente), para poder repartir el tiempo
// disponible del dia entre varios ejercicios por musculo en vez de asignar
// siempre uno solo sin importar cuantos minutos declaro el usuario.
export const MINUTOS_POR_EJERCICIO = 9;

// Arma la lista final de ejercicios asignados. Por cada dia: primero
// garantiza 1 ejercicio (el compuesto tiene prioridad - "top" del musculo,
// ver supuesto #2 del prompt original) por cada musculo objetivo; despues,
// con el tiempo que sobre segun duracionPorDia, va sumando ejercicios extra
// -musculo por musculo, siempre al que menos tiene hasta ahora- hasta
// agotar el tiempo disponible o quedarse sin candidatos. Asi la cantidad de
// ejercicios por dia refleja los minutos que el usuario dijo tener, en vez
// de un tope fijo de "1 por musculo" sin importar cuanto tiempo declaro.
export function armarRutina({ diasEspecificos, objetivo, equipamiento, exclusiones = [], duracionPorDia = {} }) {
  const secuencia = armarSecuenciaDeDias(diasEspecificos);
  const excluidos = new Set(exclusiones);

  return secuencia.map((diaInfo, numeroDia) => {
    const usadosEnElDia = new Set();
    const elegidosPorMusculo = new Map();
    const restantesPorMusculo = new Map();

    for (const musculo of diaInfo.musculos) {
      const tags = tagsDisponibles({ ...equipamiento, musculo });
      const candidatos = getEjerciciosPorMusculo.all(musculo).filter((ej) => {
        if (excluidos.has(ej.id)) return false;
        const requeridos = JSON.parse(ej.equipamiento_requerido_json);
        return requeridos.every((tag) => tags.has(tag));
      });
      if (candidatos.length === 0) {
        elegidosPorMusculo.set(musculo, []);
        restantesPorMusculo.set(musculo, []);
        continue;
      }
      const compuestos = candidatos.filter((c) => c.tipo === 'compuesto');
      const aislados = candidatos.filter((c) => c.tipo !== 'compuesto');
      const ordenados = [...compuestos, ...aislados];
      const top = ordenados[0];
      usadosEnElDia.add(top.nombre);
      elegidosPorMusculo.set(musculo, [{ ejercicio: top, esTop: true }]);
      restantesPorMusculo.set(musculo, ordenados.slice(1));
    }

    const minutosDisponibles = duracionPorDia[diaInfo.dia_semana] || 60;
    let minutosUsados = [...elegidosPorMusculo.values()].reduce((acc, arr) => acc + arr.length, 0) * MINUTOS_POR_EJERCICIO;

    while (minutosDisponibles - minutosUsados >= MINUTOS_POR_EJERCICIO) {
      const musculoElegido = diaInfo.musculos
        .filter((m) => restantesPorMusculo.get(m)?.length > 0)
        .sort((a, b) => elegidosPorMusculo.get(a).length - elegidosPorMusculo.get(b).length)[0];
      if (!musculoElegido) break;

      const cola = restantesPorMusculo.get(musculoElegido);
      const siguiente = cola.find((c) => !usadosEnElDia.has(c.nombre));
      if (!siguiente) {
        restantesPorMusculo.set(musculoElegido, []);
        continue;
      }
      usadosEnElDia.add(siguiente.nombre);
      elegidosPorMusculo.get(musculoElegido).push({ ejercicio: siguiente, esTop: false });
      restantesPorMusculo.set(musculoElegido, cola.filter((c) => c !== siguiente));
      minutosUsados += MINUTOS_POR_EJERCICIO;
    }

    const ejercicios = [];
    for (const musculo of diaInfo.musculos) {
      for (const { ejercicio, esTop } of elegidosPorMusculo.get(musculo) || []) {
        const rango = rangoRepsPara({
          musculo,
          objetivo,
          esCompuestoPrincipalFuerza: Boolean(ejercicio.es_compuesto_principal_fuerza),
          region: ejercicio.musculo_region,
        });
        ejercicios.push({
          orden: ejercicios.length + 1,
          ejercicio_id: ejercicio.id,
          nombre: ejercicio.nombre,
          musculo,
          es_top_de_musculo: esTop,
          rango_reps_min: rango.min,
          rango_reps_max: rango.max,
          tope_series: topeSeriesPara({ objetivo, esCompuestoPrincipalFuerza: Boolean(ejercicio.es_compuesto_principal_fuerza) }),
        });
      }
    }

    return { numero_dia: numeroDia + 1, dia_semana: diaInfo.dia_semana, nombre_tipo: diaInfo.nombre, ejercicios };
  });
}
