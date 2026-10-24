// 1RM estimado (Epley) y deteccion de record - puro, compartido entre el
// backend (historial/records) y el frontend (aviso en vivo al tildar una serie).
//
// Epley: peso * (1 + reps / 30). Con 1 repeticion el 1RM ES el peso. No se
// usa para prescribir nada: solo para poder comparar series de distinto
// peso/reps entre si ("60 x 11 es mejor que 60 x 10") y dibujar la tendencia
// de un ejercicio. Mas de 30 reps no es una estimacion confiable - se ignora.

export const REPS_MAX_E1RM = 30;

export function e1rm(peso, reps) {
  const p = Number(peso);
  const r = Number(reps);
  if (!Number.isFinite(p) || !Number.isFinite(r) || p <= 0 || r < 1 || r > REPS_MAX_E1RM) return null;
  return r === 1 ? p : Math.round(p * (1 + r / 30) * 10) / 10;
}

// Recorre las series en orden y marca las que superan el mejor valor previo
// (`mejorPrevio`, el historico del ejercicio SIN esta sesion) o el de una serie
// anterior de la misma sesion - asi dos series seguidas iguales no son dos
// records, solo la primera. Sin historico previo (mejorPrevio null/0) nunca hay
// record: la primera vez que se hace un ejercicio todo seria "record".
// Devuelve [{ indice, valor, anterior }] en el orden de las series.
export function detectarRecords(series, mejorPrevio) {
  if (!mejorPrevio || mejorPrevio <= 0) return [];
  const records = [];
  let mejor = mejorPrevio;
  series.forEach((s, indice) => {
    if (s.esDropset || !s.hecha) return;
    const valor = e1rm(s.peso, s.reps);
    if (valor != null && valor > mejor) {
      records.push({ indice, valor, anterior: mejor });
      mejor = valor;
    }
  });
  return records;
}
