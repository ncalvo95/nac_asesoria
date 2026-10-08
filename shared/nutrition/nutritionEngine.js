// Motor de calculo de nutricion - JS puro, sin dependencias (ni de la DB
// ni de Express ni de React). Toda funcion recibe la configuracion como
// parametro (`config`, con la forma de nutritionDefaults.js) - nunca
// importa constantes propias, para que tanto el frontend (calculo en
// vivo) como Express (validar y recalcular al guardar) usen exactamente
// la misma logica contra la misma config vigente.
//
// Lo que SI requiere acceso a la base (buscar el ultimo plan de un
// usuario, el promedio de pasos, etc.) vive en
// src/services/nutritionService.js, que llama a estas funciones con los
// datos ya resueltos - este archivo nunca hace una consulta.
//
// Regla de oro de todo el modulo: las calorias SIEMPRE salen de sumar los
// macros (kcal = P*4 + C*4 + G*9), nunca al reves. Mifflin-St Jeor es
// solo informativo y un piso de seguridad para el semaforo - nunca decide
// las calorias de un plan.

export const SEXOS = ['masculino', 'femenino'];
export const ENFOQUES = ['estandar', 'carbohidratos'];
export const FASES = ['mantenimiento', 'volumen', 'definicion'];
export const NIVELES = ['sin_entrenar', 'bajo', 'intermedio', 'alto'];
const ORDEN_SEMAFORO = ['optimo', 'muy_lento', 'agresivo', 'no_recomendable'];

function round1(n) {
  return Math.round(n * 10) / 10;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function peorNivelSemaforo(a, b) {
  return ORDEN_SEMAFORO.indexOf(a) >= ORDEN_SEMAFORO.indexOf(b) ? a : b;
}

// ---------------------------------------------------------------------------
// Edad y nivel de actividad automatico
// ---------------------------------------------------------------------------

export function calcularEdad(fechaNacimientoIso, hoyIso = new Date().toISOString().slice(0, 10)) {
  const nacimiento = new Date(`${fechaNacimientoIso}T00:00:00`);
  const hoy = new Date(`${hoyIso}T00:00:00`);
  let edad = hoy.getFullYear() - nacimiento.getFullYear();
  const cumplioEsteAnio = hoy.getMonth() > nacimiento.getMonth()
    || (hoy.getMonth() === nacimiento.getMonth() && hoy.getDate() >= nacimiento.getDate());
  if (!cumplioEsteAnio) edad -= 1;
  return edad;
}

// diasEntrenamiento: dias/semana (de la rutina activa, o cargados a mano
// si el usuario no tiene rutina). pasosPromedioUltimos14/diasConPasosCargados:
// agregados ya calculados en SQL por el service sobre registro_pasos.
export function calcularNivelActividadAutomatico({ diasEntrenamiento, pasosPromedioUltimos14, diasConPasosCargados }, config) {
  const a = config.actividad;
  let base;
  if (diasEntrenamiento <= 0) base = 'sin_entrenar';
  else if (diasEntrenamiento <= a.diasBajoMax) base = 'bajo';
  else if (diasEntrenamiento <= a.diasIntermedioMax) base = 'intermedio';
  else base = 'alto';

  const motivos = [`${diasEntrenamiento} día(s) de entrenamiento/semana → nivel base "${base}".`];
  const datosSuficientes = diasConPasosCargados >= a.pasosMinimoDiasConDatos;

  if (!datosSuficientes) {
    motivos.push(
      `Pasos insuficientes para promediar (${diasConPasosCargados}/${a.pasosMinimoDiasConDatos} días mínimo, de los últimos ${a.pasosVentanaDias}) - se usa solo el nivel por días de entrenamiento.`
    );
    return { nivel: base, fuente: 'solo_dias', motivos, pasosPromedio: null };
  }

  let idx = NIVELES.indexOf(base);
  if (pasosPromedioUltimos14 > a.pasosSubirNivelDesde) {
    idx = Math.min(idx + 1, NIVELES.length - 1);
    motivos.push(`Promedio de ${Math.round(pasosPromedioUltimos14)} pasos/día (> ${a.pasosSubirNivelDesde}) → sube un nivel.`);
  } else if (base !== 'sin_entrenar' && pasosPromedioUltimos14 < a.pasosBajarNivelHasta) {
    idx = Math.max(idx - 1, NIVELES.indexOf('bajo'));
    motivos.push(`Promedio de ${Math.round(pasosPromedioUltimos14)} pasos/día (< ${a.pasosBajarNivelHasta}) → baja un nivel.`);
  }

  return { nivel: NIVELES[idx], fuente: 'dias_y_pasos', motivos, pasosPromedio: pasosPromedioUltimos14 };
}

// ---------------------------------------------------------------------------
// Macros por fase (el nucleo: g/kg -> gramos -> kcal, SIEMPRE en ese orden)
// ---------------------------------------------------------------------------

function construirResultadoMacros({ proteinaGKg, grasaGKg, carbohidratosGKg, pesoActualKg, config, excepciones }) {
  const carbohidratosPorDebajoDelMinimo = carbohidratosGKg < config.objetivo.carbohidratosMinimoGPorKg;
  const carbohidratosGKgParaGramos = Math.max(0, carbohidratosGKg);

  const proteinaG = round1(proteinaGKg * pesoActualKg);
  const grasaG = round1(grasaGKg * pesoActualKg);
  const carbohidratosG = round1(carbohidratosGKgParaGramos * pesoActualKg);
  const kcal = Math.round(
    proteinaG * config.energia.kcalPorGProteina
    + grasaG * config.energia.kcalPorGGrasa
    + carbohidratosG * config.energia.kcalPorGCarbohidrato
  );

  return {
    proteinaGKg, grasaGKg, carbohidratosGKg,
    proteinaG, grasaG, carbohidratosG,
    kcal,
    excepciones,
    carbohidratosPorDebajoDelMinimo,
  };
}

// fase: 'mantenimiento' | 'volumen' | 'definicion'.
// referenciaGKg: obligatorio solo en Definicion (ver resolverReferenciaDefinicion) -
// {proteina, grasa, carbohidratos} en g/kg.
// semanasPlan/semanaActual: duracion total planeada y en que semana estamos
// (1-indexado) - solo relevantes para la excepcion de grasa en hombres en
// definiciones largas, que recien se activa dentro de las ultimas N
// semanas (nunca en el dia 1 de un plan recien creado, salvo que sea tan
// corto que el dia 1 YA este dentro de esa ventana final).
export function calcularMacrosFase({ fase, enfoque, sexo, nivel, pesoActualKg, referenciaGKg, semanasPlan, semanaActual = 1 }, config) {
  if (!SEXOS.includes(sexo)) throw new Error(`sexo invalido: ${sexo}`);
  if (!ENFOQUES.includes(enfoque)) throw new Error(`enfoque invalido: ${enfoque}`);
  if (!NIVELES.includes(nivel)) throw new Error(`nivel invalido: ${nivel}`);
  if (!(pesoActualKg > 0)) throw new Error('pesoActualKg debe ser mayor a 0.');

  const tablaBase = config.base[enfoque][sexo];
  const excepciones = [];

  if (fase === 'mantenimiento' || fase === 'volumen') {
    const tablaIncrementos = fase === 'mantenimiento' ? config.incrementosCarbohidratos.mantenimiento : config.incrementosCarbohidratos.volumen;
    const deltaCarbohidratos = tablaIncrementos[sexo][nivel];

    let grasaGKg = tablaBase.grasa;
    if (fase === 'volumen' && sexo === 'femenino' && nivel === 'alto') {
      grasaGKg += config.excepciones.grasaVolumenMujerAltoDelta;
      excepciones.push('grasa_volumen_mujer_alto');
    }

    return construirResultadoMacros({
      proteinaGKg: tablaBase.proteina,
      grasaGKg,
      carbohidratosGKg: tablaBase.carbohidratos + deltaCarbohidratos,
      pesoActualKg, config, excepciones,
    });
  }

  if (fase === 'definicion') {
    if (!referenciaGKg) throw new Error('referenciaGKg es obligatorio para calcular la fase Definición.');
    const decremento = config.decrementoDefinicionCarbohidratos[nivel];

    let proteinaGKg = referenciaGKg.proteina;
    if (config.pisoProteinaDefinicionActivo && proteinaGKg < tablaBase.proteina) {
      proteinaGKg = tablaBase.proteina;
      excepciones.push('piso_proteina_definicion');
    }

    let grasaGKg = referenciaGKg.grasa;
    const ex = config.excepciones;
    const dentroDeUltimasSemanas = semanasPlan != null
      && semanasPlan >= ex.definicionLargaHombreSemanasMinimo
      && semanaActual > semanasPlan - ex.definicionLargaHombreUltimasSemanas;
    if (sexo === 'masculino' && dentroDeUltimasSemanas) {
      grasaGKg += ex.definicionLargaHombreDeltaGrasa;
      excepciones.push('grasa_definicion_larga_hombre');
    }

    return construirResultadoMacros({
      proteinaGKg,
      grasaGKg,
      carbohidratosGKg: referenciaGKg.carbohidratos + decremento,
      pesoActualKg, config, excepciones,
    });
  }

  throw new Error(`fase invalida: ${fase}`);
}

// ---------------------------------------------------------------------------
// Referencia para Definicion (de donde se resta el decremento de carbos)
// ---------------------------------------------------------------------------

// Prioridad: 1) ultimoPlanMacrosGKg (el ultimo plan Mantenimiento/Volumen
// del usuario, ya convertido a g/kg por el service - ver nota abajo) ->
// 2) macrosActualesDeclaradosGDia (lo que el usuario dice comer hoy, en
// g/dia) -> 3) tabla (base sin entrenar, o mantenimiento de su nivel si
// entrena). El service es quien resuelve el caso 1 (necesita ir a buscar
// el ultimo plan a la DB y volver a correr el motor con SU propia config
// congelada para obtener sus gramos reales, dividir por su propio peso de
// referencia, y recien ahi pasar el resultado en g/kg aca) - esta funcion
// nunca toca la base de datos.
export function resolverReferenciaDefinicion(
  { ultimoPlanMacrosGKg, macrosActualesDeclaradosGDia, pesoActualKg, sexo, enfoque, entrena, nivelSiEntrena },
  config
) {
  if (ultimoPlanMacrosGKg) {
    return { fuente: 'plan_anterior', macrosGKg: ultimoPlanMacrosGKg };
  }

  if (macrosActualesDeclaradosGDia) {
    const { proteina, grasa, carbohidratos } = macrosActualesDeclaradosGDia;
    return {
      fuente: 'macros_actuales',
      macrosGKg: {
        proteina: proteina / pesoActualKg,
        grasa: grasa / pesoActualKg,
        carbohidratos: carbohidratos / pesoActualKg,
      },
    };
  }

  const nivelTabla = entrena ? nivelSiEntrena : 'sin_entrenar';
  const resultado = calcularMacrosFase({ fase: 'mantenimiento', enfoque, sexo, nivel: nivelTabla, pesoActualKg }, config);
  return {
    fuente: 'tabla',
    macrosGKg: { proteina: resultado.proteinaGKg, grasa: resultado.grasaGKg, carbohidratos: resultado.carbohidratosGKg },
  };
}

// ---------------------------------------------------------------------------
// Mifflin-St Jeor (solo informativo / piso de seguridad)
// ---------------------------------------------------------------------------

export function calcularMifflinStJeor({ sexo, pesoKg, alturaCm, edad }) {
  const base = 10 * pesoKg + 6.25 * alturaCm - 5 * edad;
  return Math.round(sexo === 'masculino' ? base + 5 : base - 161);
}

export function calcularTdeeMifflin({ bmr, nivel }, config) {
  return Math.round(bmr * config.mifflinFactoresActividad[nivel]);
}

// ---------------------------------------------------------------------------
// Modo objetivo (perdida de grasa) - calorias del dia 1
// ---------------------------------------------------------------------------

// macrosDefinicionGKg: {proteina, grasa} de la fase Definicion YA resuelta
// (con sus excepciones aplicadas) via calcularMacrosFase - los
// carbohidratos NO se usan de ahí, se recalculan acá como residuo de las
// calorías objetivo.
export function calcularModoObjetivo({ kcalReferencia, kgAPerder, semanas, macrosDefinicionGKg, pesoActualKg, sexo, config }) {
  if (!(kgAPerder > 0)) throw new Error('kgAPerder debe ser mayor a 0.');
  if (!(semanas > 0)) throw new Error('semanas debe ser mayor a 0.');

  const deficitTotalKcal = kgAPerder * config.energia.kcalPorKgGrasa;
  const deficitSemanalKcal = deficitTotalKcal / semanas;
  const deficitDiarioKcal = deficitSemanalKcal / 7;

  let kcalObjetivo = kcalReferencia - deficitDiarioKcal;
  const piso = sexo === 'masculino' ? config.pisosCalorias.hombre : config.pisosCalorias.mujer;
  const pisoCalorioAplicado = kcalObjetivo < piso;
  if (pisoCalorioAplicado) kcalObjetivo = piso;

  const proteinaG = round1(macrosDefinicionGKg.proteina * pesoActualKg);
  const grasaG = round1(macrosDefinicionGKg.grasa * pesoActualKg);
  const kcalProteinaGrasa = proteinaG * config.energia.kcalPorGProteina + grasaG * config.energia.kcalPorGGrasa;
  const carbohidratosRestantesKcal = kcalObjetivo - kcalProteinaGrasa;
  const carbohidratosG = round1(Math.max(0, carbohidratosRestantesKcal) / config.energia.kcalPorGCarbohidrato);
  const carbohidratosGKg = carbohidratosG / pesoActualKg;
  const carbohidratosPorDebajoDelMinimo = carbohidratosRestantesKcal < 0 || carbohidratosGKg < config.objetivo.carbohidratosMinimoGPorKg;

  const kcal = Math.round(
    proteinaG * config.energia.kcalPorGProteina + grasaG * config.energia.kcalPorGGrasa + carbohidratosG * config.energia.kcalPorGCarbohidrato
  );

  return {
    deficitTotalKcal: Math.round(deficitTotalKcal),
    deficitSemanalKcal: Math.round(deficitSemanalKcal),
    deficitDiarioKcal: Math.round(deficitDiarioKcal),
    kcalObjetivo: Math.round(kcalObjetivo),
    kcal,
    proteinaG, grasaG, carbohidratosG, carbohidratosGKg,
    pisoCalorioAplicado,
    carbohidratosPorDebajoDelMinimo,
  };
}

// ---------------------------------------------------------------------------
// Semaforo de realismo
// ---------------------------------------------------------------------------

// Nota sobre el hueco 0.25%-0.5%: el prompt define "Muy lento: <0.25%" y
// "Optimo: 0.5-1%" sin clasificar lo que queda en el medio - se trata
// como Optimo (no hay motivo para alarmar por un ritmo apenas mas lento
// que el piso de "optimo", y no se pidio un nivel intermedio aparte).
export function calcularSemaforo({ pesoActualKg, deficitSemanalKcal, kcalReferencia, kcalObjetivo, sexo, bmrMifflin, grasaFinalEstimadaPct }, config) {
  const s = config.objetivo.semaforo;
  const perdidaSemanalKg = deficitSemanalKcal / config.energia.kcalPorKgGrasa;
  const ritmoPct = (perdidaSemanalKg / pesoActualKg) * 100;
  const deficitPctDeKcal = (deficitSemanalKcal / 7 / kcalReferencia) * 100;
  const pisoAbsoluto = sexo === 'masculino' ? s.noRecomendableKcalMinHombre : s.noRecomendableKcalMinMujer;

  let nivel = 'optimo';
  const motivos = [];

  if (ritmoPct < s.muyLentoMax) {
    nivel = peorNivelSemaforo(nivel, 'muy_lento');
    motivos.push(`Ritmo de ${round2(ritmoPct)}%/semana (muy lento, por debajo de ${s.muyLentoMax}%).`);
  } else if (ritmoPct > s.agresivoMax) {
    nivel = peorNivelSemaforo(nivel, 'no_recomendable');
    motivos.push(`Ritmo de ${round2(ritmoPct)}%/semana (por encima de ${s.agresivoMax}%).`);
  } else if (ritmoPct > s.optimoMax || deficitPctDeKcal > s.agresivoDeficitPctKcalMax) {
    nivel = peorNivelSemaforo(nivel, 'agresivo');
    motivos.push(`Ritmo de ${round2(ritmoPct)}%/semana o déficit de ${Math.round(deficitPctDeKcal)}% de las kcal de referencia (agresivo).`);
  }

  if (kcalObjetivo < bmrMifflin) {
    nivel = peorNivelSemaforo(nivel, 'no_recomendable');
    motivos.push('Calorías por debajo del BMR estimado (Mifflin-St Jeor).');
  }
  if (kcalObjetivo < pisoAbsoluto) {
    nivel = peorNivelSemaforo(nivel, 'no_recomendable');
    motivos.push(`Calorías por debajo del piso de seguridad (${pisoAbsoluto} kcal).`);
  }

  const advertenciaGrasaBaja = grasaFinalEstimadaPct != null && (
    (sexo === 'masculino' && grasaFinalEstimadaPct < s.advertenciaGrasaFinalMinHombre)
    || (sexo === 'femenino' && grasaFinalEstimadaPct < s.advertenciaGrasaFinalMinMujer)
  );

  return { nivel, motivos, ritmoPct: round2(ritmoPct), deficitPctDeKcal: round2(deficitPctDeKcal), advertenciaGrasaBaja };
}

// Plazo (en semanas) al ritmo "objetivo.ritmoSugeridoPctSemana" -el
// extremo mas corto que todavia cae en "Optimo"- para el boton "aplicar
// plazo sugerido" cuando el semaforo da amarillo o rojo.
export function calcularPlazoMinimoSugerido({ kgAPerder, pesoActualKg }, config) {
  const perdidaSemanalKg = pesoActualKg * (config.objetivo.ritmoSugeridoPctSemana / 100);
  return Math.max(1, Math.ceil(kgAPerder / perdidaSemanalKg));
}

// ---------------------------------------------------------------------------
// Proyeccion semana a semana (modo objetivo)
// ---------------------------------------------------------------------------

// pctGrasaInicial: si se conoce, el modelo mantiene la masa magra
// constante y toda la perdida de peso sale de la masa grasa (escenario
// optimista, aclarar en la UI) - si no se conoce, el peso baja a secas.
export function proyectarSemanaASemana(
  { pesoInicialKg, pctGrasaInicial, deficitSemanalKcal, kcalReferencia, semanas, enfoque, sexo, nivel, referenciaGKg },
  config
) {
  const filas = [];
  let pesoKg = pesoInicialKg;
  let masaGrasaKg = pctGrasaInicial != null ? pesoInicialKg * (pctGrasaInicial / 100) : null;
  const masaMagraKg = masaGrasaKg != null ? pesoInicialKg - masaGrasaKg : null;
  const perdidaSemanalKg = deficitSemanalKcal / config.energia.kcalPorKgGrasa;

  for (let semana = 1; semana <= semanas; semana++) {
    const adapt = config.objetivo.adaptacionMetabolica;
    const reduccionPct = adapt.activa ? Math.min(adapt.porcentajePorSemana * semana, adapt.topePorcentaje) / 100 : 0;
    const kcalReferenciaSemana = kcalReferencia * (1 - reduccionPct);
    let kcalSemana = kcalReferenciaSemana - deficitSemanalKcal / 7;

    const macros = calcularMacrosFase(
      { fase: 'definicion', enfoque, sexo, nivel, pesoActualKg: pesoKg, referenciaGKg, semanasPlan: semanas, semanaActual: semana },
      config
    );

    const piso = sexo === 'masculino' ? config.pisosCalorias.hombre : config.pisosCalorias.mujer;
    const pisoCalorioAplicado = kcalSemana < piso;
    if (pisoCalorioAplicado) kcalSemana = piso;

    const kcalProteinaGrasa = macros.proteinaG * config.energia.kcalPorGProteina + macros.grasaG * config.energia.kcalPorGGrasa;
    const carbohidratosG = round1(Math.max(0, kcalSemana - kcalProteinaGrasa) / config.energia.kcalPorGCarbohidrato);

    filas.push({
      semana,
      pesoProyectadoKg: round1(pesoKg),
      pctGrasaProyectado: masaGrasaKg != null ? round1((masaGrasaKg / pesoKg) * 100) : null,
      kcal: Math.round(kcalSemana),
      proteinaG: macros.proteinaG,
      grasaG: macros.grasaG,
      carbohidratosG,
      pisoCalorioAplicado,
      excepciones: macros.excepciones,
    });

    if (masaGrasaKg != null) {
      masaGrasaKg = Math.max(0, masaGrasaKg - perdidaSemanalKg);
      pesoKg = masaMagraKg + masaGrasaKg;
    } else {
      pesoKg = Math.max(0, pesoKg - perdidaSemanalKg);
    }
  }

  return filas;
}

// ---------------------------------------------------------------------------
// Tendencia de peso real (modo objetivo)
// ---------------------------------------------------------------------------

// puntos: [{fecha: 'YYYY-MM-DD', pesoKg}], ya filtrados a los que tienen
// peso cargado (el service los saca de registro_antropometrico) - requiere
// al menos config.tendenciaPeso.minPuntos, si no devuelve null (ver nota
// en nutritionDefaults.js sobre por que). Regresion lineal por minimos
// cuadrados sobre "dias desde el primer pesaje", para suavizar el ruido
// dia a dia en vez de comparar 2 pesadas sueltas - mismo motivo por el que
// apps de referencia como MacroFactor muestran un "peso de tendencia" en
// vez del ultimo valor crudo.
export function calcularTendenciaPeso(puntos, config) {
  if (puntos.length < config.tendenciaPeso.minPuntos) return null;

  const unDiaMs = 86400000;
  const primerDiaMs = new Date(`${puntos[0].fecha}T00:00:00Z`).getTime();
  const xs = puntos.map((p) => (new Date(`${p.fecha}T00:00:00Z`).getTime() - primerDiaMs) / unDiaMs);
  const ys = puntos.map((p) => p.pesoKg);
  const n = puntos.length;
  const mediaX = xs.reduce((a, b) => a + b, 0) / n;
  const mediaY = ys.reduce((a, b) => a + b, 0) / n;

  let numerador = 0;
  let denominador = 0;
  for (let i = 0; i < n; i++) {
    numerador += (xs[i] - mediaX) * (ys[i] - mediaY);
    denominador += (xs[i] - mediaX) ** 2;
  }
  // Todos los pesajes el mismo dia: no hay pendiente calculable (division
  // por cero), se devuelve el promedio como peso de tendencia sin ritmo.
  const pendienteKgPorDia = denominador === 0 ? 0 : numerador / denominador;
  const ordenada = mediaY - pendienteKgPorDia * mediaX;
  const pesoTendenciaKg = round1(ordenada + pendienteKgPorDia * xs[n - 1]);

  return {
    pesoTendenciaKg,
    kgPorSemanaTendencia: round2(pendienteKgPorDia * 7),
    numeroPuntos: n,
    primeraFecha: puntos[0].fecha,
    ultimaFecha: puntos[n - 1].fecha,
  };
}

// Compara el ritmo REAL (de calcularTendenciaPeso - negativo significa que
// el peso de tendencia esta bajando) contra el ritmo que el deficit del
// plan esperaba. A diferencia del semaforo (juzga si el plan es realista
// ANTES de empezar), esto juzga si lo que esta pasando en la practica se
// parece a lo planeado - la recalibracion real, no una proyeccion teorica.
// Tolerancia amplia a proposito: no hace falta alarmar por una semana corta.
export function compararTendenciaConPlan({ kgPorSemanaTendencia, deficitSemanalKcal }, config) {
  const ritmoEsperadoKgSemana = deficitSemanalKcal / config.energia.kcalPorKgGrasa;
  const perdidaRealKgSemana = -kgPorSemanaTendencia;
  const tolerancia = ritmoEsperadoKgSemana * (config.tendenciaPeso.toleranciaPct / 100);

  let estado;
  if (perdidaRealKgSemana <= 0) estado = 'subiendo';
  else if (perdidaRealKgSemana < ritmoEsperadoKgSemana - tolerancia) estado = 'mas_lento';
  else if (perdidaRealKgSemana > ritmoEsperadoKgSemana + tolerancia) estado = 'mas_rapido';
  else estado = 'en_linea';

  return { estado, ritmoEsperadoKgSemana: round2(ritmoEsperadoKgSemana), ritmoRealKgSemana: round2(perdidaRealKgSemana) };
}

// ---------------------------------------------------------------------------
// Validacion de la config (usada por Express al guardar una version nueva)
// ---------------------------------------------------------------------------

function esNumeroFinito(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function validarGKg(obj, ruta, errores, { permitirNegativo = false } = {}) {
  for (const [clave, valor] of Object.entries(obj)) {
    if (typeof valor === 'object' && valor !== null) {
      validarGKg(valor, `${ruta}.${clave}`, errores, { permitirNegativo });
      continue;
    }
    if (!esNumeroFinito(valor)) {
      errores.push(`${ruta}.${clave} debe ser un número.`);
    } else if (!permitirNegativo && valor < 0) {
      errores.push(`${ruta}.${clave} no puede ser negativo.`);
    }
  }
}

export function validarConfig(config) {
  const errores = [];
  if (!config || typeof config !== 'object') {
    return { valida: false, errores: ['La configuración debe ser un objeto.'] };
  }

  try {
    validarGKg(config.energia, 'energia', errores);
    validarGKg(config.base, 'base', errores);
    validarGKg(config.incrementosCarbohidratos, 'incrementosCarbohidratos', errores);
    validarGKg(config.decrementoDefinicionCarbohidratos, 'decrementoDefinicionCarbohidratos', errores, { permitirNegativo: true });
    validarGKg(config.pisosCalorias, 'pisosCalorias', errores);
    validarGKg(config.mifflinFactoresActividad, 'mifflinFactoresActividad', errores);

    const a = config.actividad;
    if (!a) errores.push('Falta la sección "actividad".');
    else {
      validarGKg(a, 'actividad', errores);
      if (a.diasBajoMin > a.diasBajoMax) errores.push('actividad.diasBajoMin no puede ser mayor a diasBajoMax.');
      if (a.diasBajoMax >= a.diasIntermedioMin) errores.push('actividad.diasBajoMax debe ser menor a diasIntermedioMin.');
      if (a.diasIntermedioMin > a.diasIntermedioMax) errores.push('actividad.diasIntermedioMin no puede ser mayor a diasIntermedioMax.');
      if (a.diasIntermedioMax >= a.diasAltoMin) errores.push('actividad.diasIntermedioMax debe ser menor a diasAltoMin.');
      if (a.pasosBajarNivelHasta >= a.pasosSubirNivelDesde) errores.push('actividad.pasosBajarNivelHasta debe ser menor a pasosSubirNivelDesde.');
      if (a.pasosMinimoDiasConDatos > a.pasosVentanaDias) errores.push('actividad.pasosMinimoDiasConDatos no puede ser mayor a pasosVentanaDias.');
    }

    const o = config.objetivo;
    if (!o) errores.push('Falta la sección "objetivo".');
    else {
      if (!esNumeroFinito(o.carbohidratosMinimoGPorKg) || o.carbohidratosMinimoGPorKg < 0) {
        errores.push('objetivo.carbohidratosMinimoGPorKg debe ser un número mayor o igual a 0.');
      }
      const am = o.adaptacionMetabolica;
      if (!am) errores.push('Falta objetivo.adaptacionMetabolica.');
      else {
        if (typeof am.activa !== 'boolean') errores.push('objetivo.adaptacionMetabolica.activa debe ser true/false.');
        if (!esNumeroFinito(am.porcentajePorSemana) || am.porcentajePorSemana < 0) errores.push('objetivo.adaptacionMetabolica.porcentajePorSemana inválido.');
        if (!esNumeroFinito(am.topePorcentaje) || am.topePorcentaje < 0) errores.push('objetivo.adaptacionMetabolica.topePorcentaje inválido.');
      }
      const s = o.semaforo;
      if (!s) errores.push('Falta objetivo.semaforo.');
      else {
        validarGKg(s, 'objetivo.semaforo', errores);
        if (s.muyLentoMax >= s.optimoMax) errores.push('objetivo.semaforo.muyLentoMax debe ser menor a optimoMax.');
        if (s.optimoMax >= s.agresivoMax) errores.push('objetivo.semaforo.optimoMax debe ser menor a agresivoMax.');
      }
      if (!esNumeroFinito(o.ritmoSugeridoPctSemana) || o.ritmoSugeridoPctSemana <= 0) {
        errores.push('objetivo.ritmoSugeridoPctSemana debe ser un número mayor a 0.');
      }
    }

    if (typeof config.pisoProteinaDefinicionActivo !== 'boolean') {
      errores.push('pisoProteinaDefinicionActivo debe ser true/false.');
    }

    const ex = config.excepciones;
    if (!ex) errores.push('Falta la sección "excepciones".');
    else {
      if (!esNumeroFinito(ex.grasaVolumenMujerAltoDelta)) errores.push('excepciones.grasaVolumenMujerAltoDelta debe ser un número.');
      if (!esNumeroFinito(ex.definicionLargaHombreSemanasMinimo) || ex.definicionLargaHombreSemanasMinimo <= 0) {
        errores.push('excepciones.definicionLargaHombreSemanasMinimo debe ser un número mayor a 0.');
      }
      if (!esNumeroFinito(ex.definicionLargaHombreUltimasSemanas) || ex.definicionLargaHombreUltimasSemanas <= 0) {
        errores.push('excepciones.definicionLargaHombreUltimasSemanas debe ser un número mayor a 0.');
      }
      if (!esNumeroFinito(ex.definicionLargaHombreDeltaGrasa)) errores.push('excepciones.definicionLargaHombreDeltaGrasa debe ser un número.');
    }

    const tp = config.tendenciaPeso;
    if (!tp) errores.push('Falta la sección "tendenciaPeso".');
    else {
      if (!esNumeroFinito(tp.ventanaDias) || tp.ventanaDias <= 0) errores.push('tendenciaPeso.ventanaDias debe ser un número mayor a 0.');
      if (!esNumeroFinito(tp.minPuntos) || tp.minPuntos < 2) errores.push('tendenciaPeso.minPuntos debe ser un número mayor o igual a 2.');
      if (!esNumeroFinito(tp.toleranciaPct) || tp.toleranciaPct < 0) errores.push('tendenciaPeso.toleranciaPct debe ser un número mayor o igual a 0.');
    }
  } catch (err) {
    errores.push(`Error inesperado validando la configuración: ${err.message}`);
  }

  return { valida: errores.length === 0, errores };
}
