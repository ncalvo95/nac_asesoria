// Calendario de un bloque (microciclo de 2 semanas) con pausas de progreso.
//
// Un bloque son 14 dias ACTIVOS desde fecha_inicio: 7 de la semana 1 y 7 de la
// semana 2. Los dias en pausa (vacaciones, viaje, lesion...) no cuentan, asi que
// pausar "congela" el bloque: las semanas se corren en vez de vencerse vacias.
// Sin pausas da exactamente lo de siempre (inicio..+6, +7..+13, siguiente +14).
//
// Puro y sin zona horaria: todo son strings YYYY-MM-DD operadas en UTC.
//
// `pausas`: [{ desde, hasta }] de dias PAUSADOS, ambos extremos inclusive.

const DIA = 86400000;

export function sumarDias(fechaIso, dias) {
  return new Date(Date.parse(`${fechaIso}T00:00:00Z`) + dias * DIA).toISOString().slice(0, 10);
}

export function estaPausado(fechaIso, pausas = []) {
  return pausas.some((p) => fechaIso >= p.desde && fechaIso <= p.hasta);
}

// { 1: [inicio, fin], 2: [inicio, fin], siguienteInicio }
export function rangosDeBloque(fechaInicio, pausas = []) {
  let cursor = fechaInicio;
  let activos = 0;
  let fin1 = null;
  let fin2 = null;
  // Tope de seguridad: una pausa de mas de ~2 anos no deberia existir; evita un
  // bucle infinito si llegara una pausa con fechas absurdas.
  for (let i = 0; i < 800 && fin2 === null; i++) {
    if (!estaPausado(cursor, pausas)) {
      activos += 1;
      if (activos === 7) fin1 = cursor;
      if (activos === 14) fin2 = cursor;
    }
    cursor = sumarDias(cursor, 1);
  }
  if (fin1 === null || fin2 === null) {
    // Pausas inconsistentes: se cae al calendario sin pausas antes que romper.
    return rangosDeBloque(fechaInicio, []);
  }
  return {
    1: [fechaInicio, fin1],
    2: [sumarDias(fin1, 1), fin2],
    siguienteInicio: sumarDias(fin2, 1),
  };
}

// Convierte las filas de la tabla pausa_progreso (desde = dia en que se toco
// "pausar", hasta = dia en que se toco "reanudar", NULL = sigue pausado) en
// intervalos de dias pausados. El dia que se pausa y el que se reanuda cuentan
// como activos (se pudo entrenar en ellos): los dias pausados son los de en
// medio. `hoy` cierra las pausas todavia abiertas.
export function intervalosDePausas(filas, hoy) {
  return filas
    .map((p) => ({ desde: sumarDias(p.desde, 1), hasta: p.hasta ? sumarDias(p.hasta, -1) : hoy }))
    .filter((p) => p.desde <= p.hasta);
}

// Dias que dejo de correr el calendario por una pausa ya cerrada.
export function diasPausados(desde, hasta) {
  const d = Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / DIA) - 1;
  return Math.max(0, d);
}
