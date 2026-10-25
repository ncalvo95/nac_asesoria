import db from '../db/index.js';
import { crearRutinaDesdePlantilla } from './rutinaService.js';
import { obtenerConfigActiva } from './trainingConfigService.js';

// Plantillas de rutina (ver plantilla_rutina en schema.sql): la estructura de
// una rutina para aplicarla a varios alumnos.

const DIAS_VALIDOS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];

const rutinaStmt = db.prepare('SELECT * FROM rutina WHERE id = ?');
const diasStmt = db.prepare('SELECT * FROM dia_rutina WHERE rutina_id = ? AND activo = 1 ORDER BY numero_dia');
const ejerciciosStmt = db.prepare(`
  SELECT ea.*, e.nombre AS ejercicio_nombre, m.nombre AS musculo_nombre
  FROM ejercicio_asignado ea
  JOIN ejercicio e ON e.id = ea.ejercicio_id
  JOIN musculo m ON m.id = ea.musculo_objetivo_id
  WHERE ea.dia_rutina_id = ?
  ORDER BY ea.orden
`);

export class PlantillaError extends Error {
  constructor(mensaje, status = 400) {
    super(mensaje);
    this.name = 'PlantillaError';
    this.status = status;
  }
}

function limpiarTexto(valor, max, obligatorio, campo) {
  const t = typeof valor === 'string' ? valor.trim() : '';
  if (!t && obligatorio) throw new PlantillaError(`${campo} es obligatorio.`);
  return t.slice(0, max);
}

// Estructura de una rutina existente, sin pesos ni historial. Usa el ejercicio
// titular de cada puesto (no la variante activa de la sesion).
function estructuraDeRutina(rutinaId) {
  return diasStmt.all(rutinaId)
    .map((d) => ({
      dia_semana: d.dia_semana,
      ejercicios: ejerciciosStmt.all(d.id).map((e) => ({
        ejercicio_id: e.ejercicio_id,
        ejercicio_nombre: e.ejercicio_nombre,
        musculo_nombre: e.musculo_nombre,
        musculo_objetivo_id: e.musculo_objetivo_id,
        es_top_de_musculo: e.es_top_de_musculo,
        series: e.series_actuales,
        rango_reps_min: e.rango_reps_min,
        rango_reps_max: e.rango_reps_max,
        descanso_segundos: e.descanso_segundos,
        musculos_secundarios: JSON.parse(e.musculos_secundarios_json || '[]'),
      })),
    }))
    .filter((d) => d.ejercicios.length > 0);
}

function resumen(fila) {
  const dias = JSON.parse(fila.dias_json);
  const ejercicios = dias.flatMap((d) => d.ejercicios);
  return {
    id: fila.id,
    nombre: fila.nombre,
    descripcion: fila.descripcion,
    creado_en: fila.creado_en,
    actualizado_en: fila.actualizado_en,
    cantidad_dias: dias.length,
    cantidad_ejercicios: ejercicios.length,
    musculos: [...new Set(ejercicios.map((e) => e.musculo_nombre))],
  };
}

export function crearDesdeRutina(ownerId, rutinaId, { nombre, descripcion }) {
  const rutina = rutinaStmt.get(rutinaId);
  if (!rutina) throw new PlantillaError('Rutina no encontrada.', 404);
  const dias = estructuraDeRutina(rutinaId);
  if (dias.length === 0) throw new PlantillaError('La rutina no tiene ejercicios para guardar como plantilla.');
  const { lastInsertRowid } = db.prepare(
    'INSERT INTO plantilla_rutina (owner_id, nombre, descripcion, dias_json) VALUES (?, ?, ?, ?)'
  ).run(ownerId, limpiarTexto(nombre, 80, true, 'El nombre'), limpiarTexto(descripcion, 300, false) || null, JSON.stringify(dias));
  return obtener(ownerId, lastInsertRowid, 'admin');
}

const catalogoStmt = db.prepare(`
  SELECT e.*, m.nombre AS musculo_nombre
  FROM ejercicio e JOIN musculo m ON m.id = e.musculo_primario_id
  WHERE e.id = ? AND e.activo = 1
`);

const entero = (v, min, max, campo) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new PlantillaError(`${campo} debe ser un entero entre ${min} y ${max}.`);
  return n;
};
const existeMusculoStmt = db.prepare('SELECT 1 FROM musculo WHERE id = ?');

// Arma y valida la estructura de una plantilla a partir de lo que manda el
// cliente (el catalogo manda: nombres y musculos se leen de la base, no se
// confia en lo que llegue). `dias`: [{ dia_semana, ejercicios: [e, ...] }] donde
// cada `e` es un id de catalogo (queda con valores estandar: series minimas,
// rango de reps estandar, descanso de 90s o 60s si es unilateral) o un objeto
// { ejercicio_id, series?, rango_reps_min?, rango_reps_max?, descanso_segundos?,
// es_top_de_musculo?, musculo_objetivo_id?, musculos_secundarios? } para
// fijarlos. El orden del arreglo es el orden de los ejercicios.
function construirDias(dias) {
  if (!Array.isArray(dias) || dias.length < 1 || dias.length > 7) throw new PlantillaError('La plantilla necesita entre 1 y 7 días.');
  const config = obtenerConfigActiva().config;
  const vistos = new Set();
  return dias.map((dia) => {
    if (!dia || !DIAS_VALIDOS.includes(dia.dia_semana)) throw new PlantillaError(`Día inválido: ${dia?.dia_semana}.`);
    if (vistos.has(dia.dia_semana)) throw new PlantillaError(`El ${dia.dia_semana} está repetido.`);
    vistos.add(dia.dia_semana);
    if (!Array.isArray(dia.ejercicios) || dia.ejercicios.length === 0) throw new PlantillaError(`El ${dia.dia_semana} necesita al menos un ejercicio.`);
    const entradas = dia.ejercicios.map((e) => (e !== null && typeof e === 'object' ? e : { ejercicio_id: e }));
    const ids = entradas.map((e) => Number(e.ejercicio_id));
    if (new Set(ids).size !== ids.length) throw new PlantillaError(`El ${dia.dia_semana} tiene un ejercicio repetido.`);

    const ejercicios = entradas.map((e, i) => {
      const c = catalogoStmt.get(ids[i]);
      if (!c) throw new PlantillaError(`Ejercicio ${e.ejercicio_id} no encontrado en el catálogo.`);
      const min = e.rango_reps_min != null ? entero(e.rango_reps_min, 1, 50, 'Las reps mínimas') : config.rangoReps.default.min;
      const max = e.rango_reps_max != null ? entero(e.rango_reps_max, 1, 50, 'Las reps máximas') : config.rangoReps.default.max;
      if (max < min) throw new PlantillaError(`En "${c.nombre}" las reps máximas no pueden ser menores que las mínimas.`);
      return {
        ejercicio_id: c.id,
        ejercicio_nombre: c.nombre,
        musculo_nombre: c.musculo_nombre,
        musculo_objetivo_id: e.musculo_objetivo_id && existeMusculoStmt.get(e.musculo_objetivo_id) ? Number(e.musculo_objetivo_id) : c.musculo_primario_id,
        es_top_de_musculo: e.es_top_de_musculo ? 1 : 0,
        series: e.series != null ? entero(e.series, 1, 10, 'Las series') : config.seriesMinimo,
        rango_reps_min: min,
        rango_reps_max: max,
        descanso_segundos: e.descanso_segundos != null ? entero(e.descanso_segundos, 10, 600, 'El descanso') : (c.es_unilateral || /unilateral/i.test(c.nombre) ? 60 : 90),
        musculos_secundarios: Array.isArray(e.musculos_secundarios) ? e.musculos_secundarios.filter((m) => typeof m === 'string').slice(0, 2) : [],
        _tipo: c.tipo,
      };
    });

    // Cada musculo tiene un solo "top" (el que suma la serie extra al estancarse):
    // el primero marcado; si ninguno lo esta, el compuesto si hay, si no el primero.
    const porMusculo = new Map();
    for (const e of ejercicios) {
      if (!porMusculo.has(e.musculo_objetivo_id)) porMusculo.set(e.musculo_objetivo_id, []);
      porMusculo.get(e.musculo_objetivo_id).push(e);
    }
    for (const grupo of porMusculo.values()) {
      const elegido = grupo.find((e) => e.es_top_de_musculo) ?? grupo.find((e) => e._tipo === 'compuesto') ?? grupo[0];
      for (const e of grupo) e.es_top_de_musculo = e === elegido ? 1 : 0;
    }
    for (const e of ejercicios) delete e._tipo;
    return { dia_semana: dia.dia_semana, ejercicios };
  });
}

// Plantilla armada a mano desde el catalogo (sin partir de una rutina de un
// alumno); ver construirDias para el formato de `dias`.
export function crearDesdeCero(ownerId, { nombre, descripcion, dias }) {
  const estructura = construirDias(dias);
  const { lastInsertRowid } = db.prepare(
    'INSERT INTO plantilla_rutina (owner_id, nombre, descripcion, dias_json) VALUES (?, ?, ?, ?)'
  ).run(ownerId, limpiarTexto(nombre, 80, true, 'El nombre'), limpiarTexto(descripcion, 300, false) || null, JSON.stringify(estructura));
  return obtener(ownerId, lastInsertRowid, 'admin');
}

export function listar(ownerId) {
  return db.prepare('SELECT * FROM plantilla_rutina WHERE owner_id = ? ORDER BY id DESC').all(ownerId).map(resumen);
}

function filaOr404(actor, id) {
  const fila = db.prepare('SELECT * FROM plantilla_rutina WHERE id = ?').get(id);
  if (!fila || (fila.owner_id !== actor.id && actor.rol !== 'admin')) throw new PlantillaError('Plantilla no encontrada.', 404);
  return fila;
}

export function obtener(actorOrId, id, rolForzado) {
  const actor = typeof actorOrId === 'object' ? actorOrId : { id: actorOrId, rol: rolForzado };
  const fila = filaOr404(actor, id);
  return { ...resumen(fila), dias: JSON.parse(fila.dias_json) };
}

// Edita una plantilla: nombre/descripcion y, si llegan `dias`, TODA la
// estructura (ejercicios, orden, series, reps, descanso y dias). Las rutinas ya
// creadas con ella no cambian.
export function actualizar(actor, id, { nombre, descripcion, dias }) {
  const fila = filaOr404(actor, id);
  const estructura = dias !== undefined ? construirDias(dias) : null;
  db.prepare("UPDATE plantilla_rutina SET nombre = ?, descripcion = ?, dias_json = ?, actualizado_en = datetime('now') WHERE id = ?").run(
    nombre !== undefined ? limpiarTexto(nombre, 80, true, 'El nombre') : fila.nombre,
    descripcion !== undefined ? (limpiarTexto(descripcion, 300, false) || null) : fila.descripcion,
    estructura ? JSON.stringify(estructura) : fila.dias_json,
    id,
  );
  return obtener(actor, id);
}

export function eliminar(actor, id) {
  filaOr404(actor, id);
  db.prepare('DELETE FROM plantilla_rutina WHERE id = ?').run(id);
}

// Aplica la plantilla a un alumno. `mapeoDias`: { [dia_semana de la plantilla]:
// dia_semana nuevo } - los dias que no esten en el mapeo conservan el suyo; el
// resultado no puede repetir un dia de la semana.
export function aplicar(actor, plantillaId, usuarioId, mapeoDias = {}) {
  const fila = filaOr404(actor, plantillaId);
  const dias = JSON.parse(fila.dias_json);
  const usados = new Set();
  const mapeados = dias.map((d) => {
    const destino = mapeoDias?.[d.dia_semana] ?? d.dia_semana;
    if (!DIAS_VALIDOS.includes(destino)) throw new PlantillaError(`Día inválido: ${destino}.`);
    if (usados.has(destino)) throw new PlantillaError(`El ${destino} quedó elegido para dos días distintos de la plantilla.`);
    usados.add(destino);
    return { ...d, dia_semana: destino };
  });
  return crearRutinaDesdePlantilla(usuarioId, { nombre: fila.nombre, dias: mapeados });
}
