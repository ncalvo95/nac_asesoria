// Lectura de volumen y recuperacion por musculo para el mapa muscular. Puro:
// recibe numeros y devuelve una etiqueta, asi el backend, el frontend y los
// tests usan exactamente la misma regla.
//
// Volumen (series directas de los ultimos 7 dias, contra los MEV/MAV/MRV de
// referencia_volumen_muscular - el mismo criterio que ya usa "Volumen semanal
// por musculo" en Progreso):
//   0                 -> sin_trabajo
//   1 .. mev-1        -> bajo       (por debajo del minimo que hace crecer)
//   mev .. mav        -> en_rango
//   mav+1 .. mrv      -> alto       (productivo pero cerca del limite)
//   > mrv             -> excedido   (mas de lo que se suele poder recuperar)
// Con mev = 0 (abdominales, aductores...) cualquier serie ya cuenta "en_rango".

export function zonaVolumen(series, { mev = 0, mav = 0, mrv = 0 } = {}) {
  if (!series || series <= 0) return 'sin_trabajo';
  if (series < mev) return 'bajo';
  if (series <= mav) return 'en_rango';
  if (series <= mrv) return 'alto';
  return 'excedido';
}

export const ZONAS_VOLUMEN = {
  sin_trabajo: 'Sin trabajo esta semana',
  bajo: 'Por debajo del mínimo',
  en_rango: 'En rango',
  alto: 'Alto, cerca del límite',
  excedido: 'Por encima del límite',
};

// Recuperacion segun los dias desde la ultima vez que se trabajo el musculo.
// Es una regla simple (48-72 h), no una medicion: depende del volumen, la
// intensidad y la persona.
export function estadoRecuperacion(diasDesdeUltimo) {
  if (diasDesdeUltimo == null) return 'sin_datos';
  if (diasDesdeUltimo <= 1) return 'reciente';
  if (diasDesdeUltimo === 2) return 'recuperandose';
  return 'recuperado';
}

export const ESTADOS_RECUPERACION = {
  sin_datos: 'Sin registros',
  reciente: 'Recién trabajado',
  recuperandose: 'Recuperándose',
  recuperado: 'Recuperado',
};

// Dias enteros entre dos fechas YYYY-MM-DD (hoy - ultimo), sin depender de la
// zona horaria: se pasan a UTC medianoche las dos.
export function diasEntre(fechaIso, hoyIso) {
  if (!fechaIso || !hoyIso) return null;
  const a = Date.parse(`${fechaIso}T00:00:00Z`);
  const b = Date.parse(`${hoyIso}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86400000);
}
