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
  'abdominales', 'cuadriceps', 'isquiotibiales', 'gluteos', 'abductores', 'aductores', 'pantorrillas', 'lumbares',
];

const UPPER = ['pecho', 'espalda', 'dorsales', DELT_LATERAL, DELT_ANTERIOR, DELT_POSTERIOR, 'biceps', 'triceps'];
// Abductores/aductores/lumbares van con las piernas (LOWER/LEGS): son
// musculos de cadera y zona lumbar, no tienen lugar en un dia de Upper/
// Push/Pull.
const LOWER = ['cuadriceps', 'isquiotibiales', 'gluteos', 'abductores', 'aductores', 'pantorrillas', 'abdominales', 'lumbares'];
const PUSH = ['pecho', DELT_ANTERIOR, DELT_LATERAL, 'triceps'];
const PULL = ['espalda', 'dorsales', DELT_POSTERIOR, 'biceps'];
const LEGS = ['cuadriceps', 'isquiotibiales', 'gluteos', 'abductores', 'aductores', 'pantorrillas', 'abdominales', 'lumbares'];

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

// Estimado de segundos por ejercicio, para poder repartir el tiempo
// disponible del dia entre varios ejercicios por musculo en vez de asignar
// siempre uno solo sin importar cuantos minutos declaro el usuario:
// 30s de trabajo por cada serie + el descanso entre series (no despues de
// la ultima) + 5 minutos fijos de transicion (cambiar de maquina/estacion,
// cargar y descargar discos). Arranca siempre en SERIES_MINIMO porque es el
// estado con el que se crea cualquier ejercicio nuevo (a testear en la
// Semana 0) - no se recalcula mas adelante si la progresion le suma series
// (ver duracionEstimadaDia en EntrenamientoPage.jsx para el calculo en vivo
// con las series/descansos reales de una rutina ya en curso).
const SEGUNDOS_POR_SERIE = 30;
const SEGUNDOS_TRANSICION = 300;

// Mismo criterio que DESCANSO_SEGUNDOS_SQL en rutinaService.js (90s salvo
// ejercicio unilateral, que arranca en 60s), para que el presupuesto de
// tiempo al armar el dia coincida con el descanso que despues se persiste.
function descansoSegundosPara(ejercicio) {
  return ejercicio.es_unilateral || /unilateral/i.test(ejercicio.nombre) ? 60 : 90;
}

export function segundosEstimadosEjercicio(ejercicio, series = SERIES_MINIMO) {
  return SEGUNDOS_POR_SERIE * series + descansoSegundosPara(ejercicio) * (series - 1) + SEGUNDOS_TRANSICION;
}

// ---------------------------------------------------------------------------
// Priorizar musculo(s) al armar un dia: mas ejercicios (y, si el usuario lo
// eligio a mano, mas series) para los musculos prioritarios. Dos modos:
//
// - Explicito (el usuario elige que musculo(s) priorizar al armar la
//   rutina): esos musculos arrancan con 3 series en vez de 2, y quedan como
//   "prioritario" contra el resto de los musculos de cada dia (sin
//   distincion torso/piernas - el usuario eligio a mano).
// - Por defecto (el usuario no eligio nada): jerarquia fija pensada para
//   torso y piernas por separado (nunca se mezclan en un mismo dia, asi que
//   no hace falta distinguir "grupo" - alcanza con mirar que musculos
//   comparten el dia). Solo series = SERIES_MINIMO en este modo, la ventaja
//   es unicamente en cantidad de ejercicios.
//
// En ambos casos, nunca aplica a rutinas de menos de 4 dias/semana: con tan
// poco tiempo repartido entre pocos dias no alcanza para priorizar nada.
const TORSO_PRIORITARIO_DEFAULT = new Set(['pecho', 'espalda', DELT_LATERAL]);
const TORSO_SECUNDARIO_DEFAULT = new Set(['biceps', 'triceps', 'dorsales', DELT_ANTERIOR, DELT_POSTERIOR]);
const PIERNAS_PRIORITARIO_DEFAULT = new Set(['cuadriceps', 'isquiotibiales']);
const PIERNAS_TERCIARIO_DEFAULT = new Set(['abductores', 'aductores', 'pantorrillas']);

function tierPorDefecto(musculo) {
  if (TORSO_PRIORITARIO_DEFAULT.has(musculo) || PIERNAS_PRIORITARIO_DEFAULT.has(musculo)) return 'prioritario';
  if (PIERNAS_TERCIARIO_DEFAULT.has(musculo)) return 'terciario';
  return 'secundario'; // TORSO_SECUNDARIO_DEFAULT, gluteos, y cualquier otro (abdominales/lumbares) sin regla especifica
}

// Minimo de ejercicios que un musculo secundario/terciario deberia tener
// (si el tiempo y el catalogo lo permiten) antes de que los prioritarios
// seden mas terreno - solo se aplica con la jerarquia por defecto.
const PISO_EJERCICIOS_DEFAULT = {
  biceps: 2, triceps: 2,
  dorsales: 1, [DELT_ANTERIOR]: 1, [DELT_POSTERIOR]: 1,
  gluteos: 1, abductores: 1, aductores: 1, pantorrillas: 1,
};

const PENALIZACION_POR_TIER = { prioritario: 0, secundario: 1, terciario: 2 };

// musculosPrioritarios (opcional): musculos que el usuario eligio priorizar
// a mano al armar la rutina. Si viene vacio, se usa la jerarquia por
// defecto de arriba. cantidadDias: dias/semana de la rutina completa (no
// del dia puntual) - determina si la prioridad aplica en absoluto.
export function construirPrioridad({ musculosPrioritarios = [], cantidadDias }) {
  if (cantidadDias < 4) return null;
  if (musculosPrioritarios.length > 0) {
    const prioritarios = new Set(musculosPrioritarios);
    return {
      explicita: true,
      tierDe: (m) => (prioritarios.has(m) ? 'prioritario' : 'secundario'),
      pisoDe: () => null,
    };
  }
  return {
    explicita: false,
    tierDe: tierPorDefecto,
    pisoDe: (m) => PISO_EJERCICIOS_DEFAULT[m] ?? null,
  };
}

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
// prioridad (opcional, ver construirPrioridad): si viene, cambia como se
// reparten los ejercicios extra entre musculos del dia -y, en el modo
// explicito, las series iniciales de los musculos priorizados-. Sin
// prioridad, el comportamiento es exactamente el de antes (el musculo con
// menos ejercicios gana el empate).
export function armarDia({ musculos, objetivo, equipamiento, exclusiones = [], minutosDisponibles = 60, prioridad = null }) {
  const excluidos = new Set(exclusiones);
  const usadosEnElDia = new Set();
  const elegidosPorMusculo = new Map();
  const restantesPorMusculo = new Map();

  function seriesInicialesDe(musculo) {
    return prioridad?.explicita && prioridad.tierDe(musculo) === 'prioritario' ? 3 : SERIES_MINIMO;
  }

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

  let segundosUsados = [...elegidosPorMusculo.entries()]
    .flatMap(([musculo, arr]) => arr.map(({ ejercicio }) => segundosEstimadosEjercicio(ejercicio, seriesInicialesDe(musculo))))
    .reduce((a, b) => a + b, 0);

  // Redondeando el total para abajo al comparar contra minutosDisponibles
  // (en vez de exigir que entre exacto), un ejercicio que en teoria se pasa
  // por unos segundos -como la 3ra serie de un ejercicio, 9.5 min en vez de
  // 9- igual entra si el sobrante es menor a un minuto.
  const cabeEn = (costo) => Math.floor((segundosUsados + costo) / 60) <= minutosDisponibles;

  function agregar(musculo, ejercicio) {
    usadosEnElDia.add(ejercicio.nombre);
    elegidosPorMusculo.get(musculo).push({ ejercicio, esTop: false });
    restantesPorMusculo.set(musculo, restantesPorMusculo.get(musculo).filter((c) => c !== ejercicio));
    segundosUsados += segundosEstimadosEjercicio(ejercicio, seriesInicialesDe(musculo));
  }

  // Fase de pisos minimos (solo con la jerarquia por defecto): biceps y
  // triceps a 2 ejercicios, dorsales/deltoides restantes a 1 (que ya
  // tienen del paso anterior, asi que en la practica solo completa
  // biceps/triceps) - siempre que el tiempo declarado alcance.
  if (prioridad && !prioridad.explicita) {
    for (const musculo of musculos) {
      const piso = prioridad.pisoDe(musculo);
      if (!piso) continue;
      while (elegidosPorMusculo.get(musculo).length < piso) {
        const siguiente = restantesPorMusculo.get(musculo)?.find((c) => !usadosEnElDia.has(c.nombre));
        if (!siguiente || !cabeEn(segundosEstimadosEjercicio(siguiente, seriesInicialesDe(musculo)))) break;
        agregar(musculo, siguiente);
      }
    }
  }

  // Reparto del tiempo sobrante, musculo por musculo. Sin prioridad: el que
  // menos ejercicios tiene hasta ahora gana el empate (comportamiento de
  // siempre). Con prioridad: los musculos prioritarios ganan la mayoria de
  // los empates (penalizacion mas baja), pero nunca sacan mas de 2
  // ejercicios de ventaja sobre el que menos tiene entre los no
  // prioritarios del mismo dia (si no hay ninguno con quien comparar, sin
  // tope).
  for (;;) {
    const elegibles = musculos.filter((m) => restantesPorMusculo.get(m)?.length > 0);
    const candidato = elegibles
      .filter((m) => {
        if (!prioridad || prioridad.tierDe(m) !== 'prioritario') return true;
        const otros = musculos.filter((x) => x !== m && prioridad.tierDe(x) !== 'prioritario');
        if (otros.length === 0) return true;
        const minOtros = Math.min(...otros.map((x) => elegidosPorMusculo.get(x).length));
        return elegidosPorMusculo.get(m).length < minOtros + 2;
      })
      .sort((a, b) => {
        const penA = prioridad ? PENALIZACION_POR_TIER[prioridad.tierDe(a)] ?? 1 : 0;
        const penB = prioridad ? PENALIZACION_POR_TIER[prioridad.tierDe(b)] ?? 1 : 0;
        return (elegidosPorMusculo.get(a).length + penA) - (elegidosPorMusculo.get(b).length + penB);
      })[0];
    if (!candidato) break;

    const cola = restantesPorMusculo.get(candidato);
    const siguiente = cola.find((c) => !usadosEnElDia.has(c.nombre));
    if (!siguiente) {
      restantesPorMusculo.set(candidato, []);
      continue;
    }

    if (!cabeEn(segundosEstimadosEjercicio(siguiente, seriesInicialesDe(candidato)))) break;
    agregar(candidato, siguiente);
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
        series_iniciales: seriesInicialesDe(musculo),
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
export function armarRutina({
  diasEspecificos, objetivo, equipamiento, exclusiones = [], duracionPorDia = {},
  secuenciaPersonalizada = null, varianteSplit = 'upper_lower', musculosPrioritarios = [],
}) {
  const secuencia = secuenciaPersonalizada
    ? secuenciaPersonalizada.map((d) => ({ dia_semana: d.dia_semana, nombre: 'Personalizado', musculos: d.musculos }))
    : armarSecuenciaDeDias(diasEspecificos, varianteSplit);

  const prioridad = construirPrioridad({ musculosPrioritarios, cantidadDias: diasEspecificos.length });

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
      prioridad,
    }),
  }));
}
