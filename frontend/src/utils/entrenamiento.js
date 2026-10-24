

export const CAPITALIZAR = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Borrador en localStorage para lo que se va tipeando en Semana 0 y en el
// registro del dia - antes solo vivia en estado de React, asi que si el
// celular mataba la pestaña (se fue a background, se quedo sin memoria,
// se cerro el navegador) a mitad de un entrenamiento, todo lo cargado se
// perdia sin ningun aviso. Guardar cada cambio a medida que se escribe
// permite recuperarlo al volver a abrir la app, hasta que se confirma el
// guardado real contra el backend (momento en el que se borra el borrador).
export function leerBorrador(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function guardarBorrador(key, valor) {
  try {
    localStorage.setItem(key, JSON.stringify(valor));
  } catch {
    // localStorage no disponible (privado, cuota, etc.) - sin borrador, pero no rompe nada.
  }
}

export function borrarBorrador(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // idem arriba
  }
}

// Espejo del repsEfectivas de src/services/progressionEngine.js (mismo
// umbral) para mostrarlo en vivo mientras se carga la serie, sin ida y
// vuelta al backend.
export const REPS_EFECTIVAS_UMBRAL = 3;

export function repsEfectivas(reps, rir) {
  const r = Number(reps);
  const i = Number(rir);
  if (reps === '' || rir === '' || !Number.isFinite(r) || !Number.isFinite(i)) return null;
  return Math.max(0, Math.min(r, REPS_EFECTIVAS_UMBRAL - i));
}

// Duración aproximada del día: mismo criterio que segundosEstimadosEjercicio
// en src/services/routineBuilder.js (30s de trabajo por serie + el descanso
// entre series + 5 min de transición por ejercicio), pero acá con las
// series y el descanso REALES de cada ejercicio_asignado -que ya pueden
// haberse movido lejos de los 2/90s con los que se armó el día- en vez de
// congelados en el momento del armado.
export const SEGUNDOS_POR_SERIE = 30;

export const SEGUNDOS_TRANSICION_EJERCICIO = 300;

export function duracionEstimadaDia(dia) {
  const segundos = dia.ejercicios.reduce((acc, ej) => {
    const series = ej.series_actuales || 0;
    if (series <= 0) return acc;
    const descanso = ej.descanso_segundos ?? 90;
    return acc + SEGUNDOS_POR_SERIE * series + descanso * (series - 1) + SEGUNDOS_TRANSICION_EJERCICIO;
  }, 0);
  return Math.round(segundos / 60);
}

export const ORDEN_DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];

// dia_semana de hoy segun el reloj del dispositivo, para abrir la pantalla
// directo en el dia que corresponde en vez de siempre el primero de la
// rutina - si hoy no es un dia de entrenamiento, quien llama cae al primer
// dia (ver elegirDiaInicial).
export function diaSemanaHoy() {
  return ORDEN_DIAS[(new Date().getDay() + 6) % 7]; // getDay(): 0=domingo -> lunes=0..domingo=6
}

// Elige el dia con el que arranca la pantalla: el de hoy si la rutina
// entrena ese dia, si no el primero de la lista (mismo fallback que antes).
export function elegirDiaInicial(dias) {
  const hoy = diaSemanaHoy();
  return dias.find((d) => d.dia_semana === hoy)?.id ?? dias[0]?.id;
}

// Fecha calendario del proximo (o mismo) "dia_semana" a partir de fechaInicio
// (YYYY-MM-DD) - asume que la semana arranca en fechaInicio, sin importar
// que dia de la semana sea.
export function fechaParaDia(fechaInicio, diaSemana) {
  if (!fechaInicio) return null;
  const inicio = new Date(`${fechaInicio}T00:00:00`);
  const idxInicio = (inicio.getDay() + 6) % 7; // getDay(): 0=domingo -> lunes=0..domingo=6
  const idxObjetivo = ORDEN_DIAS.indexOf(diaSemana);
  const delta = (idxObjetivo - idxInicio + 7) % 7;
  const fecha = new Date(inicio);
  fecha.setDate(fecha.getDate() + delta);
  return fecha;
}

export function formatearFechaCorta(fecha) {
  return fecha.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
}

// borrador_dia.actualizado_en viene de SQLite como "YYYY-MM-DD HH:MM:SS" en
// UTC (datetime('now')), sin "T" ni zona - Safari/iOS no lo parsea con
// Date() a secas, así que se arma explícito como UTC antes de convertir a
// la hora local (un ISO ya completo, como el que arma new Date().toISOString()
// justo despues de guardar, se deja pasar tal cual).
export function formatearFechaHora(fecha) {
  const iso = fecha.includes('T') ? fecha : `${fecha.replace(' ', 'T')}Z`;
  return new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function sumarDiasFecha(fechaIso, dias) {
  const fecha = new Date(`${fechaIso}T00:00:00`);
  fecha.setDate(fecha.getDate() + dias);
  return fecha.toISOString().slice(0, 10);
}

export function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

// Vista de solo lectura de una semana que NO es la actual (ver semanaVista
// en DiaEntrenamiento) - consultar como fue la semana 1 sin perder de vista
// que lo que se esta entrenando/editando hoy es la semana actual, que sigue
// siendo RegistroDia de siempre. No permite cargar ni editar nada: eso solo
// se hace en la semana actual, como siempre paso.
// Series directas (reales, no dropset) y reps efectivas por musculo de una
// sesion - "directas" porque solo suma el musculo objetivo de cada
// ejercicio (ej.musculo_nombre), sin musculos secundarios/indirectos (esa
// otra nocion, a nivel de bloque de 2 semanas completo, ya vive en la
// pantalla de Progreso). `obtenerFilas(ej)` devuelve las filas de esa
// sesion para un ejercicio, ya normalizadas a {peso, reps, rir, esDropset}
// - permite reusar la misma funcion tanto para el estado local en vivo de
// RegistroDia (`series`, con esDropset en camelCase) como para las series
// ya guardadas que lee ResumenSemanaPasada (`es_dropset`, adaptadas por su
// caller). Una fila sin reps tipeadas todavia no cuenta como serie hecha.
export function resumenMuscularPorMusculo(dia, obtenerFilas) {
  const porMusculo = new Map();
  for (const ej of dia.ejercicios) {
    for (const s of obtenerFilas(ej)) {
      if (s.esDropset || s.reps === '' || s.reps == null) continue;
      const actual = porMusculo.get(ej.musculo_nombre) || { musculo: ej.musculo_nombre, series_directas: 0, reps_efectivas: 0 };
      actual.series_directas += 1;
      const efectivas = repsEfectivas(s.reps, s.rir);
      if (efectivas != null) actual.reps_efectivas += efectivas;
      porMusculo.set(ej.musculo_nombre, actual);
    }
  }
  return [...porMusculo.values()].sort((a, b) => a.musculo.localeCompare(b.musculo));
}

// Compara contra lo pactado del microciclo en curso (ej.peso_actual/
// ej.piso_reps, que reflejan progreso_ejercicio_microciclo - ver
// ejerciciosStmt en rutinaService.js) - verde si se hizo mas, rojo si
// menos. Las reps solo se colorean si el peso no cambio: si subiste o
// bajaste el peso, hacer menos o mas reps es esperable y no dice nada por
// si solo.
//
// Cada serie real se compara contra un objetivo FIJO calculado una sola
// vez desde piso_reps (piso_reps - 2*indice: serie 1 = piso_reps, serie 2
// = piso_reps-2, ...) - mismo criterio que colorVsPactadoLive (el modo en
// vivo). Antes esta funcion comparaba solo la ULTIMA serie real contra
// piso_reps sin decrementar, lo que en una semana YA CERRADA (vista
// "Semana 1"/"Semana 2" tras haber avanzado a la semana siguiente)
// marcaba en rojo una caida de reps perfectamente esperable por fatiga.
export function colorVsPactado(series, ej) {
  const reales = series.filter((s) => !s.es_dropset).sort((a, b) => a.numero_serie - b.numero_serie);
  if (reales.length === 0) return { pesoColor: null, repsColores: [] };
  let pesoColor = null;
  if (ej.peso_actual != null) {
    const pesoUsado = reales[0].peso;
    if (pesoUsado > ej.peso_actual) pesoColor = 'verde';
    else if (pesoUsado < ej.peso_actual) pesoColor = 'rojo';
  }
  const repsColores = reales.map((s, idx) => {
    if (pesoColor != null || ej.piso_reps == null) return null;
    const target = ej.piso_reps - 2 * idx;
    if (s.reps > target) return 'verde';
    if (s.reps < target) return 'rojo';
    return null;
  });
  return { pesoColor, repsColores };
}

export function colorClase(color) {
  if (color === 'verde') return 'text-success font-semibold';
  if (color === 'rojo') return 'text-danger font-semibold';
  return '';
}

// Version en vivo de colorVsPactado, para mientras se esta tipeando la
// sesion de hoy (RegistroDia): mismo criterio, pero sobre el estado local
// `series` (peso/reps como string, `esDropset` en camelCase, y puede
// estar vacio si todavia no se tipeo nada) en vez de series ya
// registradas contra el backend. Un campo vacio no cuenta como "0" -
// simplemente no hay nada que comparar todavia, asi que no se pinta.
//
// `seriesReferencia` es la cantidad de series que tenia el ejercicio
// cuando se abrio esta pantalla (antes de cualquier "+1 serie" tocado en
// esta misma sesion). Una serie mas alla de esa cantidad es nueva, nunca
// se entreno antes - no hay con que compararla, asi que no se pinta (el
// peso si se sigue comparando: peso_actual no es "el peso de la serie N",
// es el peso de trabajo del ejercicio en general, asi que sigue siendo
// una referencia valida aunque la serie en si sea nueva).
//
// Las reps de cada serie se comparan contra un objetivo FIJO derivado de
// lo pactado (piso_reps - 2*indice: serie 1 = piso_reps, serie 2 =
// piso_reps-2, serie 3 = piso_reps-4, ...), calculado una sola vez desde
// el plan original - NO contra lo que se tipeo en la serie anterior de
// esta sesion (eso es lo que hace `calcularSugerenciaReps`, para el
// placeholder gris, con otro proposito: sugerir un numero realista dado
// como viene la sesion). Si se usara esa sugerencia dinamica para pintar,
// mejorar la serie 1 "contagia" un objetivo mas exigente a la serie 2 -
// mantenerse en la serie 2 (el mismo -2 que pautaba el plan original)
// quedaba marcado en rojo solo por haber mejorado la serie 1, cuando en
// realidad mejoraste una serie y te mantuviste en la otra, dos cosas
// distintas que no deberian mezclarse.
export function colorVsPactadoLive(series, ej, seriesReferencia) {
  const reales = series.filter((s) => !s.esDropset);
  if (reales.length === 0) return { pesoColor: null, repsColores: [] };
  let pesoColor = null;
  const primerPeso = reales[0].peso;
  if (ej.peso_actual != null && primerPeso !== '' && primerPeso != null) {
    const pesoUsado = Number(primerPeso);
    if (pesoUsado > ej.peso_actual) pesoColor = 'verde';
    else if (pesoUsado < ej.peso_actual) pesoColor = 'rojo';
  }
  const repsColores = reales.map((s, idx) => {
    if (pesoColor != null || idx >= seriesReferencia || ej.piso_reps == null) return null;
    if (s.reps === '' || s.reps == null) return null;
    const target = ej.piso_reps - 2 * idx;
    const repsUsadas = Number(s.reps);
    if (!Number.isFinite(repsUsadas)) return null;
    if (repsUsadas > target) return 'verde';
    if (repsUsadas < target) return 'rojo';
    return null;
  });
  return { pesoColor, repsColores };
}

export function colorClaseInput(color) {
  if (color === 'verde') return 'border-success text-success font-semibold';
  if (color === 'rojo') return 'border-danger text-danger font-semibold';
  return 'border-border';
}

export function construirSeriesPorDefecto(ej) {
  return Array.from({ length: ej.series_actuales }, () => ({
    peso: '',
    reps: '',
    rir: 1,
    esDropset: false,
  }));
}

export function construirEstadoInicial(dia) {
  return Object.fromEntries(dia.ejercicios.map((ej) => [ej.id, construirSeriesPorDefecto(ej)]));
}

// Precarga `base` (mutandola in-place) con las series REALES de una sesion
// ya registrada (shape del backend: {series: [{ejercicio_asignado_id,
// numero_serie, peso, reps, rir, es_dropset}, ...]}) - usado tanto para
// "esta semana ya tiene sesion"/"semana 2 con lo de semana 1" como para
// "ejercicio con progreso automatico apagado, con lo del microciclo
// anterior" (ver el useState de `series` en RegistroDia). `filtroEjId`
// (opcional, un Set de ejercicio_asignado_id) limita el mezclado a esos
// ejercicios puntuales - sin filtro, se aplica a todos los que aparezcan
// en `sesion.series`.
export function mezclarSesionEnBase(base, sesion, filtroEjId, marcarHechas = false) {
  const porEjercicio = new Map();
  for (const s of sesion.series) {
    if (filtroEjId && !filtroEjId.has(s.ejercicio_asignado_id)) continue;
    if (!porEjercicio.has(s.ejercicio_asignado_id)) porEjercicio.set(s.ejercicio_asignado_id, []);
    porEjercicio.get(s.ejercicio_asignado_id).push(s);
  }
  for (const [ejId, sets] of porEjercicio) {
    if (!base[ejId]) continue;
    const reales = sets.filter((s) => !s.es_dropset).sort((a, b) => a.numero_serie - b.numero_serie);
    const dropsets = sets.filter((s) => s.es_dropset);
    const nuevasReales = base[ejId].map((row, idx) => (reales[idx]
      ? { peso: String(reales[idx].peso), reps: String(reales[idx].reps), rir: reales[idx].rir ?? 1, esDropset: false, hecha: marcarHechas }
      : row));
    base[ejId] = [...nuevasReales, ...dropsets.map((d) => ({ peso: String(d.peso), reps: String(d.reps), rir: d.rir ?? 1, esDropset: true, hecha: marcarHechas }))];
  }
}

// Mezcla un borrador (del backend o de localStorage, misma forma: {
// [ejercicioAsignadoId]: [{peso,reps,rir,esDropset}, ...] }) encima de
// `base` (mutandola in-place) - usado dos veces en cascada al armar el
// estado inicial de RegistroDia (ver mas abajo), primero con el borrador
// del backend y despues con el de localStorage, para que el tipeo local
// mas reciente (si lo hay) gane por sobre lo ultimo empujado al servidor.
//
// Solo pisa una fila si esa fila tiene ALGO realmente tipeado (peso o
// reps no vacios) - si no, se deja lo que ya estaba en `base` (que puede
// venir de una pasada anterior de esta misma funcion, ej. el borrador del
// backend). Esto es clave para el segundo llamado (localStorage): el
// simple hecho de abrir la pantalla en un dispositivo ya deja un borrador
// local vacio guardado (mismo useEffect que lo persiste en cada cambio,
// incluido el montaje inicial) - sin este chequeo, ese borrador vacio
// pisaria con strings vacios lo que se acababa de traer del backend
// (cargado en OTRO dispositivo), haciendo parecer que nunca llego nada.
export function aplicarBorradorEnBase(base, borrador) {
  for (const [ejId, sets] of Object.entries(borrador)) {
    if (!base[ejId]) continue;
    sets.forEach((s, idx) => {
      // El RIR por si solo tambien cuenta como "tipeado" - antes solo
      // miraba peso/reps, asi que cambiar UNICAMENTE el RIR (dejando peso y
      // reps en blanco, ej. apuntandolo apenas terminada la serie, antes de
      // cargar el resto) quedaba afuera del guardado: al recargar la
      // pagina, esa fila no tenia "nada tipeado" segun este chequeo y el
      // merge la saltaba entera, perdiendo el RIR en silencio. `!== 1`
      // porque el default de una fila nunca tocada es siempre el numero 1
      // (ver construirSeriesPorDefecto) - una vez que el usuario edita el
      // campo pasa a ser un string (via el input), asi que la comparacion
      // estricta distingue "nunca tocado" de "tocado, aunque haya quedado
      // en 1 de nuevo" sin reintroducir el bug viejo de pisar un borrador
      // remoto con una fila local genuinamente vacia.
      const tieneAlgoTipeado = (s.peso !== '' && s.peso != null) || (s.reps !== '' && s.reps != null) || (s.rir != null && s.rir !== 1);
      if (!tieneAlgoTipeado) return;
      if (base[ejId][idx]) {
        base[ejId][idx] = { ...base[ejId][idx], ...s };
      } else if (s.esDropset) {
        // La fila de dropset no forma parte de series_actuales (es una
        // serie extra) - el merge de arriba la saltea porque no hay indice
        // previo con el que mezclarla, y se perdia silenciosamente si se
        // recargaba la pagina antes de guardar la sesion.
        base[ejId] = [...base[ejId], { peso: '', reps: '', rir: 1, esDropset: false, ...s }];
      }
    });
  }
}

// Sugerencia en gris (placeholder, no un valor cargado) de cuantas reps
// esperar en esta serie. La serie 1 usa el piso de reps calculado en el
// ultimo cierre de microciclo (progreso_ejercicio_microciclo.piso_reps); de
// ahi en mas, si se mantiene el mismo peso que en la serie anterior (con el
// descanso habitual entre series), es esperable un declive de ~2 reps -
// encadenado desde lo REALMENTE cargado en la serie anterior, o si todavia
// no se cargo nada ahi, desde su propia sugerencia (recursivo).
export function calcularSugerenciaReps(ej, seriesEjercicio, idx) {
  const actual = seriesEjercicio[idx];
  if (actual.esDropset) return undefined;
  if (idx === 0) {
    return ej.piso_reps != null ? String(ej.piso_reps) : undefined;
  }
  const anterior = seriesEjercicio[idx - 1];
  if (anterior.esDropset) return undefined;
  const pesoActual = actual.peso !== '' ? Number(actual.peso) : ej.peso_actual;
  const pesoAnterior = anterior.peso !== '' ? Number(anterior.peso) : ej.peso_actual;
  const mismoPeso = pesoActual != null && pesoAnterior != null && Number.isFinite(pesoActual)
    && Number.isFinite(pesoAnterior) && pesoActual === pesoAnterior;
  if (!mismoPeso) return undefined;

  const repsAnterior = anterior.reps !== ''
    ? Number(anterior.reps)
    : Number(calcularSugerenciaReps(ej, seriesEjercicio, idx - 1));
  return Number.isFinite(repsAnterior) ? String(Math.max(0, repsAnterior - 2)) : undefined;
}
