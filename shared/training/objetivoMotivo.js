// Explicacion en lenguaje simple de POR QUE el objetivo de hoy es el que es.
//
// Es una lectura de lo que decidio cerrarMicrociclo (progressionEngine.js) al
// cierre del bloque anterior - no recalcula nada ni decide nada: reconstruye
// el motivo a partir de los mismos datos que el motor uso (techo de reps del
// bloque contra el rango min/max del ejercicio), asi coincide con la nota que
// el motor guardo. Pura y sin dependencias para poder testearla con node --test
// y usarla tal cual en el frontend (@shared).
//
// `ej` es el ejercicio asignado de hoy (peso_actual, piso_reps, rango_reps_min/
// max, progreso_automatico). `previo` es la fila de progreso del ultimo bloque
// cerrado para ese ejercicio (GET /rutinas/:id/progreso -> ejercicios[]):
// techo_reps, sem1_reps, sem2_reps, serie_agregada. Devuelve null si no hay
// nada que explicar (primer bloque, sin cierre previo).

export function explicarObjetivo(ej, previo) {
  if (!ej) return null;

  // Retesteo de este ejercicio ("resetear pesos y reps"): no hay objetivo, se
  // mide de nuevo, y ese bloque no cuenta como progreso.
  if (ej.retesteo) {
    const antes = ej.retesteo.peso_mejor_anterior != null && ej.retesteo.reps_mejor_anterior != null
      ? ` Antes: ${ej.retesteo.peso_mejor_anterior} kg × ${ej.retesteo.reps_mejor_anterior}.`
      : '';
    return {
      tipo: 'retesteo',
      resumen: 'Retesteo: cargá tus nuevos pesos y reps',
      detalle: `Lo que cargues ahora es tu nueva línea base. Este bloque no cuenta como progreso de este ejercicio: al cerrarlo se muestra si tu rendimiento subió o bajó respecto de antes.${antes}`,
    };
  }

  if (!ej.progreso_automatico) {
    return {
      tipo: 'congelado',
      resumen: 'Progreso automático apagado',
      detalle: 'Este ejercicio se mantiene igual que el bloque anterior, sin importar cómo te haya ido.',
    };
  }
  if (!previo) return null;

  const { techo_reps: techo, sem1_reps: sem1, sem2_reps: sem2 } = previo;
  if (techo == null) {
    return {
      tipo: 'sin_datos',
      resumen: 'Sin datos del bloque anterior',
      detalle: 'No había reps registradas en la semana 1 y/o 2, así que el objetivo se mantiene.',
    };
  }

  const queHiciste = sem1 != null && sem2 != null
    ? `Semana 1: ${sem1} reps, semana 2: ${sem2} reps, lo que da una referencia de ${techo} reps para el bloque.`
    : `La referencia del bloque anterior fue de ${techo} reps.`;
  const { rango_reps_min: min, rango_reps_max: max } = ej;

  if (techo > max) {
    return {
      tipo: 'sube',
      resumen: `Subís a ${ej.peso_actual} kg`,
      detalle: `${queHiciste} Superaste el máximo del rango (${min}–${max}), así que sube el peso y las reps vuelven a empezar más abajo.`,
    };
  }
  if (techo < min) {
    return {
      tipo: 'baja',
      resumen: `Bajás a ${ej.peso_actual} kg`,
      detalle: `${queHiciste} No llegaste al mínimo del rango (${min}–${max}), así que baja el peso para trabajar dentro del rango.`,
    };
  }
  if (previo.serie_agregada) {
    return {
      tipo: 'serie',
      resumen: `+1 serie (${ej.series_actuales} en total)`,
      detalle: `${queHiciste} El músculo no mejoró en el bloque, así que se suma una serie para darle más estímulo.`,
    };
  }
  return {
    tipo: 'igual',
    resumen: `Mismo peso: superá ${ej.piso_reps} reps`,
    detalle: `${queHiciste} Seguís dentro del rango (${min}–${max}): el objetivo es superar ${ej.piso_reps} reps antes de subir el peso.`,
  };
}
