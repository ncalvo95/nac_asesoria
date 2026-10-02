// Capa DB-aware del modulo de nutricion: es la unica que le pega a SQLite y
// a la config (shared/nutrition/nutritionEngine.js nunca lo hace - recibe
// todo resuelto por parametro, ver ese archivo). Etapa 3: alta y resultado
// de un plan Mantenimiento/Volumen/Definicion "simple" -sin modo objetivo
// (proyeccion semana a semana, Etapa 4).
import db from '../db/index.js';
import {
  calcularMacrosFase,
  calcularEdad,
  calcularMifflinStJeor,
  calcularTdeeMifflin,
  calcularNivelActividadAutomatico,
  resolverReferenciaDefinicion,
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
// decide con eso si el promedio es confiable o no.
export function pasosRecientes(usuarioId, ventanaDias) {
  const filas = db.prepare(`
    SELECT pasos FROM registro_pasos
    WHERE usuario_id = ? AND fecha >= date('now', '-' || ? || ' days')
  `).all(usuarioId, ventanaDias);
  const diasConPasosCargados = filas.length;
  const pasosPromedioUltimos14 = diasConPasosCargados > 0
    ? filas.reduce((suma, f) => suma + f.pasos, 0) / diasConPasosCargados
    : 0;
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
    weeks, config_version_id, params_json
  ) VALUES (
    @user_id, @created_by, @phase, @focus, @activity_level, @activity_source,
    @reference_source, @reference_macros_json, @reference_weight_kg,
    @weeks, @config_version_id, @params_json
  )
`);
const getPlanPorId = db.prepare('SELECT * FROM nutrition_plans WHERE id = ?');

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
  const config = plan.status === 'active' ? obtenerConfigActiva().config : obtenerVersionConfig(plan.config_version_id).config;
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

// Arma la respuesta completa que consume el frontend para un plan dado
// (activo o uno del historial): el resultado de macros + el Mifflin
// informativo, sin tocar nada.
function construirRespuestaPlan(plan, usuario) {
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
  const { phase, focus, pesoActualKg, nivelManual, diasEntrenamientoManual, weeks, macrosActualesDeclaradosGDia } = datos;
  if (!['mantenimiento', 'volumen', 'definicion'].includes(phase)) throw new Error('phase inválida.');
  if (!['estandar', 'carbohidratos'].includes(focus)) throw new Error('focus inválida.');
  if (!(Number(pesoActualKg) > 0)) throw new Error('pesoActualKg debe ser un número mayor a 0.');

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
    config_version_id: activa.id,
    params_json: JSON.stringify({
      diasEntrenamiento: nivelResuelto.diasEntrenamiento ?? null,
      pasosPromedio: nivelResuelto.pasosPromedio ?? null,
      motivosNivel: nivelResuelto.motivos,
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
