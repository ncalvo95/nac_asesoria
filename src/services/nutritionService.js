// Capa DB-aware del modulo de nutricion: es la unica que le pega a SQLite y
// a la config (shared/nutrition/nutritionEngine.js nunca lo hace - recibe
// todo resuelto por parametro, ver ese archivo). Etapa 3: alta y resultado
// de un plan Mantenimiento/Volumen/Definicion "simple". Etapa 4: modo
// objetivo de Definicion (deficit calculado, proyeccion semana a semana,
// semaforo de realismo, seguimiento quincenal).
import db from '../db/index.js';
import {
  calcularMacrosFase,
  calcularEdad,
  calcularMifflinStJeor,
  calcularTdeeMifflin,
  calcularNivelActividadAutomatico,
  resolverReferenciaDefinicion,
  calcularModoObjetivo,
  calcularSemaforo,
  calcularPlazoMinimoSugerido,
  proyectarSemanaASemana,
  calcularTendenciaPeso,
  compararTendenciaConPlan,
  NIVELES,
} from '../../shared/nutrition/nutritionEngine.js';
import { obtenerConfigActiva, obtenerVersionConfig } from './nutritionConfigService.js';

const getUsuario = db.prepare('SELECT id, sexo_biologico, fecha_nacimiento, altura_cm FROM usuarios WHERE id = ?');

// Dias de entrenamiento/semana desde la rutina activa (si existe) - cuenta
// los dias NO desactivados, igual que el resto del motor de progresion
// (ver dia_rutina.activo en obtenerRutinaActiva). null si el usuario no
// tiene ninguna rutina activa -ahi hace falta que lo indique a mano.
const diasRutinaActivaStmt = db.prepare(`
  SELECT COUNT(*) AS n FROM dia_rutina dr
  JOIN rutina r ON r.id = dr.rutina_id
  WHERE r.usuario_id = ? AND r.estado = 'activa' AND dr.activo = 1
`);

export function diasEntrenamientoDesdeRutina(usuarioId) {
  const rutina = db.prepare("SELECT id FROM rutina WHERE usuario_id = ? AND estado = 'activa'").get(usuarioId);
  if (!rutina) return null;
  return diasRutinaActivaStmt.get(usuarioId).n;
}

// Promedio de pasos de los ultimos N dias (config.actividad.pasosVentanaDias)
// y cuantos de esos dias tienen un valor cargado - calcularNivelActividadAutomatico
// decide con eso si el promedio es confiable o no. Un dia sin registro_pasos
// explicito cuenta igual si el usuario tiene "pasos por defecto" seteado
// (ver pasos_por_defecto en usuarios) - asi alguien que camina siempre mas o
// menos lo mismo no tiene que cargar dia por dia para que el nivel
// automatico funcione.
export function pasosRecientes(usuarioId, ventanaDias) {
  const filas = db.prepare(`
    SELECT fecha, pasos FROM registro_pasos
    WHERE usuario_id = ? AND fecha >= date('now', '-' || ? || ' days')
  `).all(usuarioId, ventanaDias);
  const explicitos = new Map(filas.map((f) => [f.fecha, f.pasos]));

  const { pasos_por_defecto: pasosPorDefecto } = db.prepare(
    'SELECT pasos_por_defecto FROM usuarios WHERE id = ?'
  ).get(usuarioId);

  let total = 0;
  let diasConPasosCargados = 0;
  const hoy = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
  for (let i = 0; i < ventanaDias; i++) {
    const fecha = new Date(hoy.getTime() - i * 86400000).toISOString().slice(0, 10);
    if (explicitos.has(fecha)) {
      total += explicitos.get(fecha);
      diasConPasosCargados++;
    } else if (pasosPorDefecto != null) {
      total += pasosPorDefecto;
      diasConPasosCargados++;
    }
  }

  const pasosPromedioUltimos14 = diasConPasosCargados > 0 ? total / diasConPasosCargados : 0;
  return { pasosPromedioUltimos14, diasConPasosCargados };
}

// nivelManual != null => el usuario/coach eligio pisar el automatico.
// Si no hay rutina activa, diasEntrenamientoManual es obligatorio (lo pide
// el formulario del frontend).
export function resolverNivelActividad(usuarioId, { diasEntrenamientoManual, nivelManual } = {}, config) {
  if (nivelManual) {
    if (!NIVELES.includes(nivelManual)) throw new Error(`nivel invalido: ${nivelManual}`);
    return { nivel: nivelManual, fuente: 'manual', motivos: ['Nivel elegido a mano.'], pasosPromedio: null, diasEntrenamiento: null };
  }
  const diasRutina = diasEntrenamientoDesdeRutina(usuarioId);
  const diasEntrenamiento = diasRutina != null ? diasRutina : diasEntrenamientoManual;
  if (diasEntrenamiento == null) {
    throw new Error('No hay rutina activa: indicá cuántos días por semana entrenás.');
  }
  const { pasosPromedioUltimos14, diasConPasosCargados } = pasosRecientes(usuarioId, config.actividad.pasosVentanaDias);
  const resultado = calcularNivelActividadAutomatico({ diasEntrenamiento, pasosPromedioUltimos14, diasConPasosCargados }, config);
  return { ...resultado, diasEntrenamiento };
}

// Pesajes reales del usuario (registro_antropometrico) dentro de la ventana
// de la config - alimenta la tendencia de peso del modo objetivo (ver
// calcularTendenciaPeso en el motor). Puede haber mas de un pesaje el
// mismo dia (no se agregan), la regresion los toma a todos igual.
const puntosAntropometricosStmt = db.prepare(`
  SELECT fecha, peso_corporal AS pesoKg FROM registro_antropometrico
  WHERE usuario_id = ? AND peso_corporal IS NOT NULL AND fecha >= date('now', '-' || ? || ' days')
  ORDER BY fecha
`);

// Tendencia de peso real del modo objetivo: a diferencia de pasosRecientes
// (que rellena huecos con un default), aca no hay "default" posible para
// un pesaje que nunca se cargo - si hay menos del minimo de puntos, se
// devuelve sin tendencia (null) pero igual se informa cuantos puntos hay,
// para que el frontend pueda mostrar "te faltan N pesajes" en vez de nada.
export function tendenciaPesoReciente(usuarioId, config) {
  const filas = puntosAntropometricosStmt.all(usuarioId, config.tendenciaPeso.ventanaDias);
  const tendencia = calcularTendenciaPeso(filas.map((f) => ({ fecha: f.fecha, pesoKg: f.pesoKg })), config);
  return {
    tendencia,
    numeroPuntos: filas.length,
    minPuntos: config.tendenciaPeso.minPuntos,
    ventanaDias: config.tendenciaPeso.ventanaDias,
  };
}

const getPlanActivo = db.prepare("SELECT * FROM nutrition_plans WHERE user_id = ? AND status = 'active'");
const getUltimoPlanNoDefinicion = db.prepare(`
  SELECT * FROM nutrition_plans
  WHERE user_id = ? AND phase IN ('mantenimiento', 'volumen')
  ORDER BY created_at DESC, id DESC LIMIT 1
`);
const listarPlanesStmt = db.prepare(`
  SELECT np.*, u.nombre AS created_by_nombre
  FROM nutrition_plans np LEFT JOIN usuarios u ON u.id = np.created_by
  WHERE np.user_id = ? AND np.status = 'archived'
  ORDER BY np.created_at DESC, np.id DESC
`);
const archivarPlan = db.prepare("UPDATE nutrition_plans SET status = 'archived' WHERE id = ?");
const insertPlan = db.prepare(`
  INSERT INTO nutrition_plans (
    user_id, created_by, phase, focus, activity_level, activity_source,
    reference_source, reference_macros_json, reference_weight_kg,
    weeks, goal_fat_kg, config_version_id, params_json
  ) VALUES (
    @user_id, @created_by, @phase, @focus, @activity_level, @activity_source,
    @reference_source, @reference_macros_json, @reference_weight_kg,
    @weeks, @goal_fat_kg, @config_version_id, @params_json
  )
`);
const getPlanPorId = db.prepare('SELECT * FROM nutrition_plans WHERE id = ?');
const actualizarProgreso = db.prepare(`
  UPDATE nutrition_plans SET reference_weight_kg = ?, goal_fat_kg = ?, weeks = ?, start_date = date('now')
  WHERE id = ?
`);

function resolverConfigDePlan(plan) {
  return plan.status === 'active' ? obtenerConfigActiva().config : obtenerVersionConfig(plan.config_version_id).config;
}

// Semana actual de un plan (1-indexada) segun cuanto paso desde start_date -
// solo le importa a la excepcion de grasa en hombres en definiciones
// largas (ver calcularMacrosFase). Un plan activo "avanza" solo con el
// paso del tiempo, sin que nadie lo tenga que tocar.
function semanaActualDesde(startDateIso, weeks) {
  const inicio = new Date(`${startDateIso}T00:00:00Z`);
  const hoy = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
  const diasTranscurridos = Math.max(0, Math.round((hoy - inicio) / 86400000));
  const semana = Math.floor(diasTranscurridos / 7) + 1;
  return weeks ? Math.min(semana, weeks) : semana;
}

// Recalcula los macros de un plan ya persistido: el activo siempre contra
// la config VIGENTE (puede moverse si el admin edita el panel); uno
// archivado contra la version de config que tenia congelada al crearse
// (ver nutrition_config_versions) - nunca se reescribe solo en silencio.
export function calcularResultadoPlan(plan, usuario) {
  const config = resolverConfigDePlan(plan);
  const params = {
    fase: plan.phase, enfoque: plan.focus, sexo: usuario.sexo_biologico,
    nivel: plan.activity_level, pesoActualKg: plan.reference_weight_kg,
  };
  if (plan.phase === 'definicion') {
    params.referenciaGKg = JSON.parse(plan.reference_macros_json);
    if (plan.weeks) {
      params.semanasPlan = plan.weeks;
      params.semanaActual = semanaActualDesde(plan.start_date, plan.weeks);
    }
  }
  const resultado = calcularMacrosFase(params, config);
  return { resultado, config };
}

function mifflinInformativo(usuario, pesoActualKg, nivel, config) {
  if (!usuario.fecha_nacimiento || !usuario.altura_cm) return null;
  const edad = calcularEdad(usuario.fecha_nacimiento);
  const bmr = calcularMifflinStJeor({ sexo: usuario.sexo_biologico, pesoKg: pesoActualKg, alturaCm: usuario.altura_cm, edad });
  const tdee = calcularTdeeMifflin({ bmr, nivel }, config);
  return { edad, bmr: Math.round(bmr), tdee: Math.round(tdee) };
}

// Modo objetivo de Definicion: la "Definicion simple" (calcularMacrosFase)
// sigue dando la proteina/grasa de referencia (con sus excepciones) y las
// kcal que tendria SIN objetivo (kcalReferencia) - el modo objetivo solo
// cambia COMO se llega a las kcal del dia (deficit calculado en base a
// cuanta grasa perder y en cuantas semanas, ver calcularModoObjetivo),
// nunca el criterio de proteina/grasa. El semaforo y la proyeccion
// necesitan el BMR de Mifflin, que a su vez necesita fecha de nacimiento y
// altura - si faltan, se devuelve igual el resultado del dia 1 pero sin
// semaforo/proyeccion (mifflinDisponible: false, el frontend explica por que).
function calcularResultadoObjetivo(plan, usuario, config) {
  const params = JSON.parse(plan.params_json || '{}');
  const referenciaGKg = JSON.parse(plan.reference_macros_json);
  const { activity_level: nivel, focus: enfoque, reference_weight_kg: pesoActualKg, weeks: semanas } = plan;
  const sexo = usuario.sexo_biologico;

  const simple = calcularMacrosFase(
    { fase: 'definicion', enfoque, sexo, nivel, pesoActualKg, referenciaGKg, semanasPlan: semanas, semanaActual: 1 },
    config
  );
  const modoObjetivo = calcularModoObjetivo({
    kcalReferencia: simple.kcal, kgAPerder: plan.goal_fat_kg, semanas,
    macrosDefinicionGKg: { proteina: simple.proteinaGKg, grasa: simple.grasaGKg },
    pesoActualKg, sexo, config,
  });

  // Tendencia de peso real (independiente del Mifflin - solo necesita
  // pesajes cargados en registro_antropometrico): compara el ritmo REAL
  // contra el que el deficit del plan esperaba, la recalibracion de
  // verdad en vez de la proyeccion teorica de mas abajo.
  const { tendencia, numeroPuntos, minPuntos, ventanaDias } = tendenciaPesoReciente(plan.user_id, config);
  const tendenciaPeso = tendencia
    ? { ...tendencia, comparacion: compararTendenciaConPlan({ kgPorSemanaTendencia: tendencia.kgPorSemanaTendencia, deficitSemanalKcal: modoObjetivo.deficitSemanalKcal }, config) }
    : null;
  const tendenciaPesoProgreso = { numeroPuntos, minPuntos, ventanaDias };

  const mifflinDisponible = Boolean(usuario.fecha_nacimiento && usuario.altura_cm);
  let semaforo = null;
  let plazoMinimoSugeridoSemanas = null;
  let proyeccion = [];

  if (mifflinDisponible) {
    const edad = calcularEdad(usuario.fecha_nacimiento);
    const bmrMifflin = calcularMifflinStJeor({ sexo, pesoKg: pesoActualKg, alturaCm: usuario.altura_cm, edad });
    const pctGrasaInicial = params.pctGrasaInicial ?? null;

    proyeccion = proyectarSemanaASemana({
      pesoInicialKg: pesoActualKg, pctGrasaInicial, deficitSemanalKcal: modoObjetivo.deficitSemanalKcal,
      kcalReferencia: simple.kcal, semanas, enfoque, sexo, nivel, referenciaGKg,
    }, config);
    const grasaFinalEstimadaPct = pctGrasaInicial != null
      ? proyeccion[proyeccion.length - 1]?.pctGrasaProyectado ?? null
      : null;

    semaforo = calcularSemaforo({
      pesoActualKg, deficitSemanalKcal: modoObjetivo.deficitSemanalKcal, kcalReferencia: simple.kcal,
      kcalObjetivo: modoObjetivo.kcalObjetivo, sexo, bmrMifflin, grasaFinalEstimadaPct,
    }, config);
    if (semaforo.nivel !== 'optimo') {
      plazoMinimoSugeridoSemanas = calcularPlazoMinimoSugerido({ kgAPerder: plan.goal_fat_kg, pesoActualKg }, config);
    }
  }

  return {
    resultado: { ...modoObjetivo, excepciones: simple.excepciones },
    semaforo, plazoMinimoSugeridoSemanas, proyeccion, mifflinDisponible,
    tendenciaPeso, tendenciaPesoProgreso,
  };
}

// Arma la respuesta completa que consume el frontend para un plan dado
// (activo o uno del historial): el resultado de macros (o del modo
// objetivo, si el plan tiene goal_fat_kg) + el Mifflin informativo.
function construirRespuestaPlan(plan, usuario) {
  if (plan.phase === 'definicion' && plan.goal_fat_kg) {
    const config = resolverConfigDePlan(plan);
    const objetivo = calcularResultadoObjetivo(plan, usuario, config);
    return {
      ...plan, ...objetivo,
      mifflin: mifflinInformativo(usuario, plan.reference_weight_kg, plan.activity_level, config),
    };
  }
  const { resultado, config } = calcularResultadoPlan(plan, usuario);
  return {
    ...plan,
    resultado,
    mifflin: mifflinInformativo(usuario, plan.reference_weight_kg, plan.activity_level, config),
  };
}

export function obtenerPlanActivo(usuarioId) {
  const usuario = getUsuario.get(usuarioId);
  if (!usuario) throw new Error('Usuario no encontrado.');
  const plan = getPlanActivo.get(usuarioId);
  if (!plan) return null;
  return construirRespuestaPlan(plan, usuario);
}

export function listarPlanesArchivados(usuarioId) {
  return listarPlanesStmt.all(usuarioId);
}

// Resuelve la referencia de Definicion buscando el ultimo plan
// Mantenimiento/Volumen del usuario (activo o archivado, el mas reciente) y
// recalculando SUS macros (con su propia config congelada) para convertirlos
// a g/kg - nunca reusa un plan de Definicion anterior como referencia.
function resolverReferenciaParaDefinicion(usuarioId, usuario, { macrosActualesDeclaradosGDia, pesoActualKg, sexo, enfoque, nivel, entrena }, config) {
  const ultimoPlan = getUltimoPlanNoDefinicion.get(usuarioId);
  let ultimoPlanMacrosGKg = null;
  if (ultimoPlan) {
    const { resultado } = calcularResultadoPlan(ultimoPlan, usuario);
    ultimoPlanMacrosGKg = { proteina: resultado.proteinaGKg, grasa: resultado.grasaGKg, carbohidratos: resultado.carbohidratosGKg };
  }
  return resolverReferenciaDefinicion(
    { ultimoPlanMacrosGKg, macrosActualesDeclaradosGDia, pesoActualKg, sexo, enfoque, entrena, nivelSiEntrena: nivel },
    config
  );
}

// Crea un plan nuevo: archiva el activo anterior (si hay) en la misma
// transaccion y recien ahi inserta el nuevo - asi nunca coexisten 2 activos
// (reforzado ademas por el indice unico parcial de nutrition_plans).
export const crearPlan = db.transaction((usuarioId, datos, creadoPor) => {
  const usuario = getUsuario.get(usuarioId);
  if (!usuario) throw new Error('Usuario no encontrado.');
  if (!usuario.sexo_biologico) {
    throw new Error('Falta cargar el sexo biológico del usuario antes de calcular un plan de nutrición.');
  }
  const { phase, focus, pesoActualKg, nivelManual, diasEntrenamientoManual, weeks, macrosActualesDeclaradosGDia, goalFatKg, pctGrasaInicial } = datos;
  if (!['mantenimiento', 'volumen', 'definicion'].includes(phase)) throw new Error('phase inválida.');
  if (!['estandar', 'carbohidratos'].includes(focus)) throw new Error('focus inválida.');
  if (!(Number(pesoActualKg) > 0)) throw new Error('pesoActualKg debe ser un número mayor a 0.');

  const modoObjetivoActivo = phase === 'definicion' && goalFatKg;
  if (modoObjetivoActivo) {
    if (!(Number(goalFatKg) > 0)) throw new Error('goalFatKg debe ser un número mayor a 0.');
    if (!(Number(weeks) > 0)) throw new Error('Para el modo objetivo hace falta indicar la duración del plan en semanas.');
    if (!usuario.fecha_nacimiento || !usuario.altura_cm) {
      throw new Error('Para el modo objetivo hace falta cargar fecha de nacimiento y altura (se usan para el semáforo de realismo).');
    }
  }

  const activa = obtenerConfigActiva();
  const config = activa.config;

  const nivelResuelto = resolverNivelActividad(usuarioId, { diasEntrenamientoManual, nivelManual }, config);

  let referenceSource = null;
  let referenceMacrosJson = null;
  if (phase === 'definicion') {
    const entrena = nivelResuelto.nivel !== 'sin_entrenar';
    const { fuente, macrosGKg } = resolverReferenciaParaDefinicion(
      usuarioId, usuario,
      { macrosActualesDeclaradosGDia, pesoActualKg: Number(pesoActualKg), sexo: usuario.sexo_biologico, enfoque: focus, nivel: nivelResuelto.nivel, entrena },
      config
    );
    referenceSource = fuente;
    referenceMacrosJson = JSON.stringify(macrosGKg);
  }

  const previo = getPlanActivo.get(usuarioId);
  if (previo) archivarPlan.run(previo.id);

  const info = insertPlan.run({
    user_id: usuarioId,
    created_by: creadoPor ?? null,
    phase, focus,
    activity_level: nivelResuelto.nivel,
    activity_source: nivelManual ? 'manual' : 'auto',
    reference_source: referenceSource,
    reference_macros_json: referenceMacrosJson,
    reference_weight_kg: Number(pesoActualKg),
    weeks: weeks || null,
    goal_fat_kg: modoObjetivoActivo ? Number(goalFatKg) : null,
    config_version_id: activa.id,
    params_json: JSON.stringify({
      diasEntrenamiento: nivelResuelto.diasEntrenamiento ?? null,
      pasosPromedio: nivelResuelto.pasosPromedio ?? null,
      motivosNivel: nivelResuelto.motivos,
      pctGrasaInicial: modoObjetivoActivo && pctGrasaInicial ? Number(pctGrasaInicial) : null,
    }),
  });

  return construirRespuestaPlan(getPlanPorId.get(info.lastInsertRowid), usuario);
});

export const archivarPlanActivo = db.transaction((usuarioId) => {
  const previo = getPlanActivo.get(usuarioId);
  if (!previo) throw new Error('No hay un plan activo para archivar.');
  archivarPlan.run(previo.id);
  return { archivado: true, id: previo.id };
});

// "Recalculo quincenal" del modo objetivo: en vez de inventar una fecha
// exacta cada 14 dias, se re-basea el plan cuando el usuario carga su peso
// real (coach o cliente, cuando les parezca) - las semanas YA pasadas
// desde el ultimo re-baseo se descuentan de las semanas que quedan, y lo
// efectivamente perdido (peso anterior - peso nuevo, nunca negativo) se
// descuenta del objetivo restante. Mismo plan, misma fila (un check-in de
// progreso no es un plan nuevo) - start_date se reinicia a hoy para que
// la excepcion de grasa en hombres en definiciones largas siga contando
// las semanas correctamente desde este nuevo punto de partida.
export const actualizarProgresoPlan = db.transaction((usuarioId, pesoActualKg) => {
  const plan = getPlanActivo.get(usuarioId);
  if (!plan) throw new Error('No hay un plan activo.');
  if (plan.phase !== 'definicion' || !plan.goal_fat_kg) {
    throw new Error('Solo un plan de Definición con objetivo tiene seguimiento de progreso.');
  }
  if (!(Number(pesoActualKg) > 0)) throw new Error('pesoActualKg debe ser un número mayor a 0.');

  const inicio = new Date(`${plan.start_date}T00:00:00Z`);
  const hoy = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
  const semanasTranscurridas = Math.max(0, Math.floor((hoy - inicio) / (7 * 86400000)));

  const kgPerdidos = Math.max(0, plan.reference_weight_kg - Number(pesoActualKg));
  const nuevoGoal = Math.max(0.1, round1(plan.goal_fat_kg - kgPerdidos));
  const nuevasSemanas = Math.max(1, plan.weeks - semanasTranscurridas);

  actualizarProgreso.run(Number(pesoActualKg), nuevoGoal, nuevasSemanas, plan.id);

  const usuario = getUsuario.get(usuarioId);
  return construirRespuestaPlan(getPlanPorId.get(plan.id), usuario);
});

function round1(n) {
  return Math.round(n * 10) / 10;
}

const listarTodosLosPlanes = db.prepare(
  'SELECT * FROM nutrition_plans WHERE user_id = ? ORDER BY created_at ASC, id ASC'
);

// Etapa 5: evolucion nutricional para el reporte semestral. Devuelve TODOS
// los planes del usuario (activo + archivados), en orden cronologico, cada
// uno recalculado con la config que le corresponde (vigente si es el
// activo, congelada si es uno viejo - mismo criterio que el resto del
// modulo). Si el usuario nunca cargo el sexo biologico, o nunca armo un
// plan, devuelve una lista vacia en vez de romper el reporte entero -la
// nutricion es un agregado opcional del reporte, no un requisito.
export function obtenerEvolucionNutricional(usuarioId) {
  const usuario = getUsuario.get(usuarioId);
  if (!usuario || !usuario.sexo_biologico) return [];

  return listarTodosLosPlanes.all(usuarioId).map((plan) => {
    const config = resolverConfigDePlan(plan);
    const resultado = plan.phase === 'definicion' && plan.goal_fat_kg
      ? calcularResultadoObjetivo(plan, usuario, config).resultado
      : calcularResultadoPlan(plan, usuario).resultado;
    return {
      id: plan.id,
      phase: plan.phase,
      focus: plan.focus,
      status: plan.status,
      created_at: plan.created_at,
      reference_weight_kg: plan.reference_weight_kg,
      weeks: plan.weeks,
      goal_fat_kg: plan.goal_fat_kg,
      kcal: resultado.kcal,
      proteinaG: resultado.proteinaG,
      grasaG: resultado.grasaG,
      carbohidratosG: resultado.carbohidratosG,
    };
  });
}
