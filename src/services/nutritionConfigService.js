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

function filaAObjeto(fila) {
  const config = JSON.parse(fila.config_json);
  // Una seccion nueva agregada DESPUES de que ya existian versiones
  // guardadas (ej. tendenciaPeso) no esta en un config_json viejo - se
  // completa con la de fabrica en vez de romper al leerla (afecta tanto a
  // la version activa vieja como a un plan archivado, o a "volver a esta
  // version" desde el panel de admin). Solo nivel superior: alcanza para
  // una seccion nueva entera, no para un campo nuevo DENTRO de una
  // seccion ya existente.
  for (const clave of Object.keys(nutritionDefaults)) {
    if (!(clave in config)) config[clave] = nutritionDefaults[clave];
  }
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
