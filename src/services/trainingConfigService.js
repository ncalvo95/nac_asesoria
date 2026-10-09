// Config del "nucleo de progresion" de entrenamiento: la ultima fila de
// training_config_versions es siempre la activa. Mismo criterio que
// nutritionConfigService.js (ver ese archivo para la justificacion
// completa): cada guardado inserta una fila nueva, nunca edita una
// existente; cacheada en memoria, se invalida sola al guardar una version
// nueva.
import db from '../db/index.js';
import { validarConfigProgresion } from '../../shared/training/progressionConfig.js';
import { progressionDefaults } from '../../shared/training/progressionDefaults.js';
import { obtenerOverrideCrudo, resolverConMerge } from './parametroOverrideService.js';

let cacheActiva = null; // { id, config, createdBy, createdAt, comment }

const getUltimaVersion = db.prepare('SELECT * FROM training_config_versions ORDER BY id DESC LIMIT 1');
const getVersionPorId = db.prepare('SELECT * FROM training_config_versions WHERE id = ?');
const insertVersion = db.prepare(`
  INSERT INTO training_config_versions (config_json, created_by, comment) VALUES (?, ?, ?)
`);
const listarVersiones = db.prepare(`
  SELECT tv.id, tv.created_by, u.nombre AS created_by_nombre, tv.created_at, tv.comment
  FROM training_config_versions tv
  LEFT JOIN usuarios u ON u.id = tv.created_by
  ORDER BY tv.id DESC
`);

// Completa (en el lugar) las claves que falten en config con las de
// progressionDefaults, recursivamente - mismo helper que
// nutritionConfigService.js (ver ahi la justificacion: una seccion o campo
// nuevo agregado despues de que ya existian versiones guardadas no rompe al
// leer una version vieja, y nunca pisa un valor ya presente).
function completarConDefaults(config, defaults) {
  for (const clave of Object.keys(defaults)) {
    const valorDefault = defaults[clave];
    if (!(clave in config)) {
      config[clave] = valorDefault;
    } else if (
      valorDefault && typeof valorDefault === 'object' && !Array.isArray(valorDefault) &&
      config[clave] && typeof config[clave] === 'object' && !Array.isArray(config[clave])
    ) {
      completarConDefaults(config[clave], valorDefault);
    }
  }
}

function filaAObjeto(fila) {
  const config = JSON.parse(fila.config_json);
  completarConDefaults(config, progressionDefaults);
  return { id: fila.id, config, createdBy: fila.created_by, createdAt: fila.created_at, comment: fila.comment };
}

function asegurarPrimeraVersion() {
  const fila = getUltimaVersion.get();
  if (fila) return fila;
  const info = insertVersion.run(JSON.stringify(progressionDefaults), null, 'Valores de fábrica (sembrado automático)');
  return getVersionPorId.get(info.lastInsertRowid);
}

export function obtenerConfigActiva() {
  if (cacheActiva) return cacheActiva;
  const fila = asegurarPrimeraVersion();
  cacheActiva = filaAObjeto(fila);
  return cacheActiva;
}

export function obtenerVersionConfig(id) {
  const fila = getVersionPorId.get(id);
  if (!fila) throw new Error('Versión de configuración no encontrada.');
  return filaAObjeto(fila);
}

export function listarHistorialVersiones() {
  return listarVersiones.all();
}

export function guardarNuevaVersionConfig({ config, createdBy, comment }) {
  const { valida, errores } = validarConfigProgresion(config);
  if (!valida) {
    const err = new Error('La configuración no es válida.');
    err.errores = errores;
    throw err;
  }
  const info = insertVersion.run(JSON.stringify(config), createdBy ?? null, comment || null);
  cacheActiva = null;
  return filaAObjeto(getVersionPorId.get(info.lastInsertRowid));
}

export function restaurarVersionConfig(id, { createdBy, comment }) {
  const anterior = obtenerVersionConfig(id);
  return guardarNuevaVersionConfig({
    config: anterior.config,
    createdBy,
    comment: comment || `Restaurada desde la versión #${id}`,
  });
}

export function restaurarValoresDeFabrica({ createdBy, comment }) {
  return guardarNuevaVersionConfig({
    config: progressionDefaults,
    createdBy,
    comment: comment || 'Restaurados los valores de fábrica',
  });
}

// Config efectiva de un usuario puntual para armar/progresar SU rutina:
// global vigente + su propio override (si personalizo algo) - es lo que
// routineBuilder.js/progressionEngine.js/rutinaService.js usan en vez de
// importar constantes fijas. No hay cascada de 3 niveles (coach->alumno):
// el override vive siempre en el DUEÑO del entrenamiento, sea un coach
// entrenandose a si mismo o un alumno puntual (ver parametro_override en
// schema.sql).
export function resolverConfigEntrenamiento(usuarioId) {
  const global = obtenerConfigActiva().config;
  const override = obtenerOverrideCrudo(usuarioId, 'entrenamiento');
  return resolverConMerge(global, override?.config);
}
