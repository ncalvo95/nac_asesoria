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

// Plantilla armada a mano desde el catalogo (sin partir de una rutina de un
// alumno). `dias`: [{ dia_semana, ejercicios: [ejercicio_id, ...] }]. Los
// valores arrancan como en una rutina manual nueva - series minimas, rango de
// reps estandar y descanso de 90s (60s si es unilateral); se ajustan despues en
// la rutina de cada alumno.
export function crearDesdeCero(ownerId, { nombre, descripcion, dias }) {
  if (!Array.isArray(dias) || dias.length < 1 || dias.length > 7) throw new PlantillaError('La plantilla necesita entre 1 y 7 días.');
  const config = obtenerConfigActiva().config;
  const vistos = new Set();
  const estructura = dias.map((dia) => {
    if (!dia || !DIAS_VALIDOS.includes(dia.dia_semana)) throw new PlantillaError(`Día inválido: ${dia?.dia_semana}.`);
    if (vistos.has(dia.dia_semana)) throw new PlantillaError(`El ${dia.dia_semana} está repetido.`);
    vistos.add(dia.dia_semana);
    if (!Array.isArray(dia.ejercicios) || dia.ejercicios.length === 0) throw new PlantillaError(`El ${dia.dia_semana} necesita al menos un ejercicio.`);
    if (new Set(dia.ejercicios).size !== dia.ejercicios.length) throw new PlantillaError(`El ${dia.dia_semana} tiene un ejercicio repetido.`);

    const catalogos = dia.ejercicios.map((id) => {
      const c = catalogoStmt.get(Number(id));
      if (!c) throw new PlantillaError(`Ejercicio ${id} no encontrado en el catálogo.`);
      return c;
    });
    // El "top" de cada musculo (el que suma la serie extra al estancarse): el
    // compuesto si hay, si no el primero elegido - igual que una rutina manual.
    const topPorMusculo = new Map();
    for (const c of catalogos) {
      const actual = topPorMusculo.get(c.musculo_nombre);
      if (!actual || (c.tipo === 'compuesto' && actual.tipo !== 'compuesto')) topPorMusculo.set(c.musculo_nombre, c);
    }
    return {
      dia_semana: dia.dia_semana,
      ejercicios: catalogos.map((c) => ({
        ejercicio_id: c.id,
        ejercicio_nombre: c.nombre,
        musculo_nombre: c.musculo_nombre,
        musculo_objetivo_id: c.musculo_primario_id,
        es_top_de_musculo: topPorMusculo.get(c.musculo_nombre) === c ? 1 : 0,
        series: config.seriesMinimo,
        rango_reps_min: config.rangoReps.default.min,
        rango_reps_max: config.rangoReps.default.max,
        descanso_segundos: c.es_unilateral || /unilateral/i.test(c.nombre) ? 60 : 90,
        musculos_secundarios: [],
      })),
    };
  });
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

export function actualizar(actor, id, { nombre, descripcion }) {
  const fila = filaOr404(actor, id);
  db.prepare("UPDATE plantilla_rutina SET nombre = ?, descripcion = ?, actualizado_en = datetime('now') WHERE id = ?").run(
    nombre !== undefined ? limpiarTexto(nombre, 80, true, 'El nombre') : fila.nombre,
    descripcion !== undefined ? (limpiarTexto(descripcion, 300, false) || null) : fila.descripcion,
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
