// Valores de fabrica del "nucleo de progresion" de entrenamiento - el resto
// del armado de rutina (tiempos estimados por serie/transicion, jerarquia de
// musculos prioritarios por defecto, pisos de ejercicios por musculo) sigue
// hardcodeado a proposito: eso es como se arma la rutina, no como progresa,
// y en la practica casi no se toca (ver discusion en la sesion que agrego
// este archivo). Mismo criterio que shared/nutrition/nutritionDefaults.js:
// esto NUNCA se importa desde progressionEngine.js/routineBuilder.js
// directamente - el motor siempre recibe la config como parametro (ver
// trainingConfigService.js). Se usa solo para:
//   1. sembrar la primera version de la config en una base nueva, y
//   2. el boton "Restaurar valores de fabrica" del panel de admin.

export const progressionDefaults = {
  // Cuanto sube/baja el peso prescrito de un ejercicio al cerrar un
  // microciclo, cuando el techo de reps se paso o no llego al rango
  // (ver cerrarMicrociclo).
  incrementoKg: 2.5,

  // Series con las que arranca cualquier ejercicio nuevo (a testear en la
  // Semana 0) antes de que la progresion le sume mas.
  seriesMinimo: 2,

  // Rango de reps objetivo por ejercicio, segun el objetivo del usuario y el
  // tipo de ejercicio - determina cuando el techo de reps "se paso" (sube
  // peso) o "no llego" (baja peso). Se evalua en orden: el primer caso que
  // matchee gana.
  rangoReps: {
    rendimientoPierna: { min: 8, max: 18 }, // objetivo=rendimiento, musculo de pierna
    fuerzaCompuesto: { min: 6, max: 10 }, // objetivo=fuerza, compuesto principal de fuerza
    default: { min: 8, max: 16 },
  },

  // Tope de series por ejercicio antes de que la progresion deje de sumar
  // mas (ver cerrarMicrociclo: musculo estancado + no cerca del MAV).
  topeSeries: {
    fuerzaCompuesto: 6, // objetivo=fuerza, compuesto principal de fuerza
    default: 4,
  },

  // Umbrales para decidir el "techo" de reps de un ejercicio al cerrar un
  // microciclo (semana 1 vs semana 2): si la variacion entre ambas semanas
  // es grande, el techo es el promedio (mas conservador) en vez del maximo.
  umbralesTecho: {
    // Variacion como % del valor mas alto (0.2 = 20%).
    variacionPorcentual: 0.2,
    // Piso absoluto de variacion (reps) para series largas.
    variacionRepsAbs: 3,
    // A partir de cuantas reps una serie se considera "larga" (ahi aplica
    // el piso absoluto en vez de solo el porcentual).
    serieLarga: 12,
  },

  // De las reps hechas en una serie, cuantas caen dentro de la ventana de
  // las ultimas N reps antes del fallo (el resto son reps de "calentamiento"
  // que aportan poco estimulo) - ver repsEfectivas en progressionEngine.js.
  repsEfectivasUmbral: 3,

  // Semana de descarga manual (ver marcarSemanaDescarga): cuantas series
  // hacer y a que peso.
  descarga: {
    // Series de la descarga = max(seriesMinimo, ceil(series_prescritas * fraccionSeries)).
    seriesMinimo: 2,
    fraccionSeries: 0.5,
    // Peso de las series despues de la primera (top set) = peso_prescrito * pesoRestoFraccion,
    // redondeado al medio kg mas cercano.
    pesoRestoFraccion: 0.75,
  },
};
