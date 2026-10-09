// Config del modulo de nutricion: la ultima fila de nutrition_config_versions
// es siempre la "activa". Cada guardado (desde el panel de admin, o un
// "volver a esta version"/"restaurar valores por defecto") INSERTA una fila
// nueva, nunca edita una existente - asi el historial queda completo y un
// plan archivado puede seguir leyendo la version exacta con la que se armo
// (ver config_version_id en nutrition_plans).
//
// Cacheada en memoria (variable de modulo, no hace falta nada mas - Node
// corre esto en un solo proceso sincronico) para no pegarle una consulta a
// SQLite en cada calculo; se invalida sola apenas se guarda una version
// nueva.
import db from '../db/index.js';
import { validarConfig } from '../../shared/nutrition/nutritionEngine.js';
import { nutritionDefaults } from '../../shared/nutrition/nutritionDefaults.js';
import { obtenerOverrideCrudo, resolverConMerge } from './parametroOverrideService.js';

let cacheActiva = null; // { id, config, created_by, created_at, comment }

const getUltimaVersion = db.prepare('SELECT * FROM nutrition_config_versions ORDER BY id DESC LIMIT 1');
const getVersionPorId = db.prepare('SELECT * FROM nutrition_config_versions WHERE id = ?');
const insertVersion = db.prepare(`
  INSERT INTO nutrition_config_versions (config_json, created_by, comment) VALUES (?, ?, ?)
`);
const listarVersiones = db.prepare(`
  SELECT nv.id, nv.created_by, u.nombre AS created_by_nombre, nv.created_at, nv.comment
  FROM nutrition_config_versions nv
  LEFT JOIN usuarios u ON u.id = nv.created_by
  ORDER BY nv.id DESC
`);

// Completa (en el lugar) las claves que falten en config con las de
// nutritionDefaults, recursivamente - una seccion nueva agregada DESPUES de
// que ya existian versiones guardadas (ej. tendenciaPeso en su momento), o
// un campo nuevo sumado DENTRO de una seccion ya existente (ej.
// tendenciaPeso.bandaEstablePctSemana), no estan en un config_json viejo -
// se completan con los de fabrica en vez de romper al leerla. Nunca
// pisa una clave que ya esta presente, asi que un admin que edito "base"
// a mano no pierde sus valores - solo rellena lo que falta.
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
  completarConDefaults(config, nutritionDefaults);
  return { id: fila.id, config, createdBy: fila.created_by, createdAt: fila.created_at, comment: fila.comment };
}

// Siembra la primera version con los valores de fabrica si la base
// todavia no tiene ninguna (primer arranque) - asi el resto del modulo
// siempre puede asumir que "hay una config activa".
function asegurarPrimeraVersion() {
  const fila = getUltimaVersion.get();
  if (fila) return fila;
  const info = insertVersion.run(JSON.stringify(nutritionDefaults), null, 'Valores de fábrica (sembrado automático)');
  return getVersionPorId.get(info.lastInsertRowid);
}

export function obtenerConfigActiva() {
  if (cacheActiva) return cacheActiva;
  const fila = asegurarPrimeraVersion();
  cacheActiva = filaAObjeto(fila);
  return cacheActiva;
}

// Para un plan ARCHIVADO (o para resolver "el ultimo plan" como referencia
// de uno nuevo): se recalcula con la version de config que tenia en su
// momento, no con la vigente - ver nutrition_plans en schema.sql.
export function obtenerVersionConfig(id) {
  const fila = getVersionPorId.get(id);
  if (!fila) throw new Error('Versión de configuración no encontrada.');
  return filaAObjeto(fila);
}

export function listarHistorialVersiones() {
  return listarVersiones.all();
}

// Guarda una version nueva (la que viene del formulario del panel de
// admin). Valida antes de insertar - nunca se persiste una config invalida.
export function guardarNuevaVersionConfig({ config, createdBy, comment }) {
  const { valida, errores } = validarConfig(config);
  if (!valida) {
    const err = new Error('La configuración no es válida.');
    err.errores = errores;
    throw err;
  }
  const info = insertVersion.run(JSON.stringify(config), createdBy ?? null, comment || null);
  cacheActiva = null;
  return filaAObjeto(getVersionPorId.get(info.lastInsertRowid));
}

// "Volver a una version anterior": inserta una version NUEVA con ese mismo
// contenido (nunca borra ni reordena el historial).
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
    config: nutritionDefaults,
    createdBy,
    comment: comment || 'Restaurados los valores de fábrica',
  });
}

// Config efectiva de un usuario puntual: global VIGENTE + su propio
// override (si personalizo algo) - mismo mecanismo que
// trainingConfigService.resolverConfigEntrenamiento, pero solo tiene
// sentido contra la config vigente (un plan archivado sigue leyendo su
// propia version congelada tal cual, sin override - ver
// resolverConfigDePlan en nutritionService.js).
export function resolverConfigNutricion(usuarioId) {
  const global = obtenerConfigActiva().config;
  const override = obtenerOverrideCrudo(usuarioId, 'nutricion');
  return resolverConMerge(global, override?.config);
}
