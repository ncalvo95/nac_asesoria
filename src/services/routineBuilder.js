import db from '../db/index.js';

// Deltoides separado por cabeza (lateral/anterior/posterior) en vez de un
// unico "deltoides" (ver seed/musculos.js): el lateral casi no recibe
// estimulo indirecto de nada mas, asi que va SIEMPRE en Push, Upper y Full
// Body - las mismas categorias donde antes entraba "deltoides" a secas -
// para no perder nunca su volumen directo. El anterior lo acompaña en esas
// mismas categorias (ya viene cubierto por el empuje, pero da un lugar
// donde colgar Press militar como top). El posterior va en Pull en vez de
// Push, porque se entrena mejor con traccion (remo, face pull, pajaros).
const DELT_LATERAL = 'deltoides_lateral';
const DELT_ANTERIOR = 'deltoides_anterior';
const DELT_POSTERIOR = 'deltoides_posterior';

export const TODOS_MUSCULOS = [
  'pecho', 'espalda', 'dorsales', DELT_LATERAL, DELT_ANTERIOR, DELT_POSTERIOR, 'biceps', 'triceps',
  'abdominales', 'cuadriceps', 'isquiotibiales', 'gluteos', 'pantorrillas',
];

const UPPER = ['pecho', 'espalda', 'dorsales', DELT_LATERAL, DELT_ANTERIOR, DELT_POSTERIOR, 'biceps', 'triceps'];
const LOWER = ['cuadriceps', 'isquiotibiales', 'gluteos', 'pantorrillas', 'abdominales'];
const PUSH = ['pecho', DELT_ANTERIOR, DELT_LATERAL, 'triceps'];
const PULL = ['espalda', 'dorsales', DELT_POSTERIOR, 'biceps'];
const LEGS = ['cuadriceps', 'isquiotibiales', 'gluteos', 'pantorrillas', 'abdominales'];

// Determina la secuencia de "tipos de dia" (con sus musculos objetivo) segun
// la cantidad de dias/semana disponibles. diasEspecificos debe venir ya
// ordenado cronologicamente (lunes -> domingo).
//
// varianteSplit solo tiene efecto con 4 o 5 dias, donde hay dos formas
// razonables de repartir la semana y se la dejamos elegir al usuario en el
// onboarding (con un default sensato si no elige):
//   - 'upper_lower' (default): todos los musculos con frecuencia 2x.
//   - 'push_pull': mas foco en pecho/espalda/hombros/brazos (2x), piernas
//     queda con menos frecuencia (1x con 4 dias, ninguna con... no, ver
//     abajo) - pensado para quien ya entrena piernas por su cuenta aparte.
export function armarSecuenciaDeDias(diasEspecificos, varianteSplit = 'upper_lower') {
  const n = diasEspecificos.length;
  const consecutivos = n === 3 && sonConsecutivos(diasEspecificos);

  let tipos;
  if (n === 2) {
    tipos = [{ nombre: 'Full Body', musculos: TODOS_MUSCULOS }, { nombre: 'Full Body', musculos: TODOS_MUSCULOS }];
  } else if (n === 3 && !consecutivos) {
    tipos = Array.from({ length: 3 }, () => ({ nombre: 'Full Body', musculos: TODOS_MUSCULOS }));
  } else if (n === 3 && consecutivos) {
    // Upper/Lower/Full Body en vez de "grandes/secundarios/grandes": asi
    // todos los musculos (no solo los grandes) quedan con frecuencia 2x.
    tipos = [
      { nombre: 'Upper', musculos: UPPER },
      { nombre: 'Lower', musculos: LOWER },
      { nombre: 'Full Body', musculos: TODOS_MUSCULOS },
    ];
  } else if (n === 4) {
    tipos = varianteSplit === 'push_pull'
      ? [
        { nombre: 'Push', musculos: PUSH },
        { nombre: 'Pull', musculos: PULL },
        { nombre: 'Push', musculos: PUSH },
        { nombre: 'Pull', musculos: PULL },
      ]
      : [
        { nombre: 'Upper', musculos: UPPER },
        { nombre: 'Lower', musculos: LOWER },
        { nombre: 'Upper', musculos: UPPER },
        { nombre: 'Lower', musculos: LOWER },
      ];
  } else if (n === 5) {
    tipos = varianteSplit === 'push_pull'
      ? [
        { nombre: 'Push', musculos: PUSH },
        { nombre: 'Pull', musculos: PULL },
        { nombre: 'Legs', musculos: LEGS },
        { nombre: 'Push', musculos: PUSH },
        { nombre: 'Pull', musculos: PULL },
      ]
      : [
        { nombre: 'Push', musculos: PUSH },
        { nombre: 'Pull', musculos: PULL },
        { nombre: 'Legs', musculos: LEGS },
        { nombre: 'Upper', musculos: UPPER },
        { nombre: 'Lower', musculos: LOWER },
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

export const ORDEN_DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
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

function candidatosPara(musculo, equipamiento, excluidos) {
  const tags = tagsDisponibles({ ...equipamiento, musculo });
  const candidatos = getEjerciciosPorMusculo.all(musculo).filter((ej) => {
    if (excluidos.has(ej.id)) return false;
    const requeridos = JSON.parse(ej.equipamiento_requerido_json);
    return requeridos.every((tag) => tags.has(tag));
  });
  const compuestos = candidatos.filter((c) => c.tipo === 'compuesto');
  const aislados = candidatos.filter((c) => c.tipo !== 'compuesto');
  return [...compuestos, ...aislados];
}

// El ejercicio "top" de un musculo (compuesto con prioridad, ver supuesto
// #2 del prompt original) dado el equipamiento disponible - usado tanto al
// armar un dia entero (armarDia) como al agregar un musculo nuevo a una
// rutina ya existente (agregar/reorganizar dias, ver rutinaService.js).
// Devuelve null si no hay ningun candidato compatible.
export function elegirEjercicioTop({ musculo, equipamiento, exclusiones = [] }) {
  const ordenados = candidatosPara(musculo, equipamiento, new Set(exclusiones));
  return ordenados[0] || null;
}

// Arma los ejercicios de UN dia: primero garantiza 1 ejercicio (el top) por
// cada musculo objetivo; despues, con el tiempo que sobre segun
// minutosDisponibles, va sumando ejercicios extra -musculo por musculo,
// siempre al que menos tiene hasta ahora- hasta agotar el tiempo disponible
// o quedarse sin candidatos. Asi la cantidad de ejercicios por dia refleja
// los minutos que el usuario dijo tener, en vez de un tope fijo de "1 por
// musculo" sin importar cuanto tiempo declaro. Compartido por armarRutina
// (arma la semana entera) y por agregarDiaRutina/reorganizarRutina en
// rutinaService.js (arman o reacomodan un dia suelto de una rutina ya
// existente).
export function armarDia({ musculos, objetivo, equipamiento, exclusiones = [], minutosDisponibles = 60 }) {
  const excluidos = new Set(exclusiones);
  const usadosEnElDia = new Set();
  const elegidosPorMusculo = new Map();
  const restantesPorMusculo = new Map();

  for (const musculo of musculos) {
    const ordenados = candidatosPara(musculo, equipamiento, excluidos);
    if (ordenados.length === 0) {
      elegidosPorMusculo.set(musculo, []);
      restantesPorMusculo.set(musculo, []);
      continue;
    }
    const top = ordenados[0];
    usadosEnElDia.add(top.nombre);
    elegidosPorMusculo.set(musculo, [{ ejercicio: top, esTop: true }]);
    restantesPorMusculo.set(musculo, ordenados.slice(1));
  }

  let minutosUsados = [...elegidosPorMusculo.values()].reduce((acc, arr) => acc + arr.length, 0) * MINUTOS_POR_EJERCICIO;

  while (minutosDisponibles - minutosUsados >= MINUTOS_POR_EJERCICIO) {
    const musculoElegido = musculos
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
  for (const musculo of musculos) {
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
  return ejercicios;
}

// secuenciaPersonalizada (opcional): [{ dia_semana, musculos }] armado por el
// propio usuario (ver "elegir mi split" en el onboarding) en vez de la tabla
// fija de armarSecuenciaDeDias - el resto de la logica (filtro por
// equipamiento, reparto del tiempo disponible, rango de reps) es identica
// sin importar de donde salio la secuencia.
export function armarRutina({ diasEspecificos, objetivo, equipamiento, exclusiones = [], duracionPorDia = {}, secuenciaPersonalizada = null, varianteSplit = 'upper_lower' }) {
  const secuencia = secuenciaPersonalizada
    ? secuenciaPersonalizada.map((d) => ({ dia_semana: d.dia_semana, nombre: 'Personalizado', musculos: d.musculos }))
    : armarSecuenciaDeDias(diasEspecificos, varianteSplit);

  return secuencia.map((diaInfo, numeroDia) => ({
    numero_dia: numeroDia + 1,
    dia_semana: diaInfo.dia_semana,
    nombre_tipo: diaInfo.nombre,
    ejercicios: armarDia({
      musculos: diaInfo.musculos,
      objetivo,
      equipamiento,
      exclusiones,
      minutosDisponibles: duracionPorDia[diaInfo.dia_semana] || 60,
    }),
  }));
}
