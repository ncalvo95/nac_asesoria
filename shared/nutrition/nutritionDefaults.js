// Valores de fabrica del modulo de nutricion. Esto NUNCA se importa desde
// el motor de calculo (nutritionEngine.js) ni desde ningun endpoint que
// calcule algo real - el motor siempre recibe la config como parametro
// (ver nutritionConfigService.js, que lee la ultima fila de
// nutrition_config_versions). Este archivo solo se usa para:
//   1. sembrar la primera version de la config en una base nueva, y
//   2. el boton "Restaurar valores por defecto" del panel de admin.
//
// Todas las tablas de g/kg usan deltas: la tabla "base" es el punto de
// partida (mantenimiento, sin entrenar) y el resto de las secciones son
// incrementos/decrementos a SUMAR sobre esa base - los decrementos ya
// vienen en negativo, asi el motor hace siempre "referencia + delta" sin
// tener que acordarse de restar en un lado y sumar en el otro.

export const nutritionDefaults = {
  // kcal por gramo de cada macro (regla: kcal = P*4 + C*4 + G*9) y kcal
  // por kg de grasa corporal, para convertir un objetivo en kg a un
  // deficit calorico.
  energia: {
    kcalPorGProteina: 4,
    kcalPorGCarbohidrato: 4,
    kcalPorGGrasa: 9,
    kcalPorKgGrasa: 7700,
  },

  // Tabla base: Mantenimiento, sin entrenar, en g de macro por kg de peso
  // corporal total (siempre peso total, nunca ajustado por % graso).
  base: {
    estandar: {
      masculino: { proteina: 1.7, grasa: 0.8, carbohidratos: 2.3 },
      femenino: { proteina: 1.4, grasa: 1.1, carbohidratos: 1.9 },
    },
    carbohidratos: {
      masculino: { proteina: 1.5, grasa: 0.8, carbohidratos: 2.5 },
      femenino: { proteina: 1.2, grasa: 1.1, carbohidratos: 2.1 },
    },
  },

  // Incrementos de CARBOHIDRATOS (g/kg) sobre la base, segun fase y nivel
  // de actividad - los mismos para los 2 enfoques (el enfoque en
  // carbohidratos ya parte de una base de carbohidratos mas alta).
  // Proteina y grasa se mantienen igual que en la base, salvo excepcion.
  // "sin_entrenar" en volumen arranca igual al de "bajo" pero se edita
  // aparte (son 2 valores independientes que solo coinciden al principio).
  incrementosCarbohidratos: {
    mantenimiento: {
      masculino: { sin_entrenar: 0, bajo: 0.5, intermedio: 0.9, alto: 1.3 },
      femenino: { sin_entrenar: 0, bajo: 0.5, intermedio: 0.8, alto: 1.0 },
    },
    volumen: {
      masculino: { sin_entrenar: 0.8, bajo: 0.8, intermedio: 1.2, alto: 1.7 },
      femenino: { sin_entrenar: 0.7, bajo: 0.7, intermedio: 1.0, alto: 1.1 },
    },
  },

  // Decremento de CARBOHIDRATOS (g/kg, ya en negativo) en Definicion,
  // segun nivel de actividad - igual para los 2 sexos y los 2 enfoques.
  decrementoDefinicionCarbohidratos: {
    sin_entrenar: -1.0,
    bajo: -1.0,
    intermedio: -0.7,
    alto: -0.5,
  },

  // Si la proteina de referencia (ver resolverReferenciaDefinicion) queda
  // por debajo de la de la tabla para ese sexo/enfoque, se usa la de la
  // tabla como piso - desactivable desde el panel.
  pisoProteinaDefinicionActivo: true,

  excepciones: {
    // Volumen, mujeres, nivel Alto: la grasa sube este delta (g/kg)
    // ADEMAS del incremento de carbohidratos normal de esa fila.
    grasaVolumenMujerAltoDelta: 0.2,
    // Definiciones largas, en hombres: en las ultimas N semanas la grasa
    // cambia este delta (g/kg, en negativo = baja) respecto de la de
    // referencia - solo si la duracion total del plan es >= al minimo.
    definicionLargaHombreSemanasMinimo: 8,
    definicionLargaHombreUltimasSemanas: 4,
    definicionLargaHombreDeltaGrasa: -0.5,
  },

  // Umbrales (dias de entrenamiento/semana) y ajuste por pasos para el
  // nivel de actividad AUTOMATICO.
  actividad: {
    diasBajoMin: 1,
    diasBajoMax: 3,
    diasIntermedioMin: 4,
    diasIntermedioMax: 5,
    diasAltoMin: 6,
    diasAltoMax: 7,
    // Promedio de pasos/dia de los ultimos N dias (pasosVentanaDias) por
    // encima/debajo de estos umbrales sube/baja un nivel (Alto es techo,
    // Bajo es piso -nunca empuja a alguien que entrena a "sin entrenar").
    pasosVentanaDias: 14,
    pasosSubirNivelDesde: 12000,
    pasosBajarNivelHasta: 5000,
    // Si hay menos de este minimo de dias CON pasos cargados dentro de la
    // ventana, el promedio no se usa (se avisa y el nivel sale solo de
    // los dias de entrenamiento).
    pasosMinimoDiasConDatos: 7,
  },

  // Modo avanzado de Definicion (objetivo de perdida de grasa).
  objetivo: {
    carbohidratosMinimoGPorKg: 1.0,
    adaptacionMetabolica: {
      activa: true,
      // Lineal: reduccion(semana) = min(porcentajePorSemana * semana, tope).
      porcentajePorSemana: 0.5,
      topePorcentaje: 10,
    },
    semaforo: {
      muyLentoMax: 0.25,
      optimoMin: 0.5,
      optimoMax: 1,
      agresivoMax: 1.5,
      agresivoDeficitPctKcalMax: 25,
      noRecomendableKcalMinHombre: 1500,
      noRecomendableKcalMinMujer: 1200,
      advertenciaGrasaFinalMinHombre: 8,
      advertenciaGrasaFinalMinMujer: 15,
    },
    // Ritmo (% del peso/semana) que se usa para calcular el plazo minimo
    // recomendado cuando el semaforo da amarillo/rojo - el extremo mas
    // corto que todavia cae en "Optimo".
    ritmoSugeridoPctSemana: 1,
  },

  // Tope DURO de calorias (no solo una advertencia del semaforo): el
  // motor nunca devuelve menos que esto en el modo objetivo, reacomoda
  // los carbohidratos para sostenerlo. Numero separado del umbral del
  // semaforo (objetivo.semaforo.noRecomendableKcalMin*) a proposito -
  // coinciden por defecto, pero son 2 cosas editables por separado.
  pisosCalorias: {
    hombre: 1500,
    mujer: 1200,
  },

  // Factores de actividad de Mifflin-St Jeor (BMR -> TDEE), SOLO para el
  // desglose informativo - nunca definen las calorias del plan.
  mifflinFactoresActividad: {
    sin_entrenar: 1.2,
    bajo: 1.375,
    intermedio: 1.55,
    alto: 1.725,
  },
};
