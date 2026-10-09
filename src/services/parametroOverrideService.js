// Override por usuario del nucleo de progresion de entrenamiento y/o de
// recalibracion de nutricion (ver parametro_override en schema.sql) - un
// unico mecanismo generico para los 2 dominios ('entrenamiento'/'nutricion'),
// cada uno con su propia config global versionada (trainingConfigService.js
// / nutritionConfigService.js) y su propio "config de fabrica" para saber
// que forma tiene un objeto completo.
//
// El override SIEMPRE es parcial (solo los campos que el coach decidio
// tocar) y se resuelve por encima del global via merge recursivo: un campo
// presente en el override gana, uno ausente cae al global. Asi, si el admin
// despues cambia un campo que este usuario nunca toco, el cambio le sigue
// llegando - solo lo explicitamente personalizado queda fijo.
import db from '../db/index.js';
import { puedeAccederAUsuario } from '../middleware/auth.js';

const DOMINIOS = ['entrenamiento', 'nutricion'];

const getOverride = db.prepare('SELECT * FROM parametro_override WHERE usuario_id = ? AND dominio = ?');
const upsertOverride = db.prepare(`
  INSERT INTO parametro_override (usuario_id, dominio, config_json, updated_by, updated_at)
  VALUES (@usuario_id, @dominio, @config_json, @updated_by, datetime('now'))
  ON CONFLICT(usuario_id, dominio) DO UPDATE SET
    config_json = excluded.config_json, updated_by = excluded.updated_by, updated_at = excluded.updated_at
`);
const deleteOverride = db.prepare('DELETE FROM parametro_override WHERE usuario_id = ? AND dominio = ?');

function validarDominio(dominio) {
  if (!DOMINIOS.includes(dominio)) throw new Error(`Dominio inválido: ${dominio}.`);
}

// Un coach solo puede tocar el override de si mismo o de sus alumnos; el
// admin, el de cualquiera - reusa exactamente el mismo criterio que ya
// protege rutinas/nutricion (puedeAccederAUsuario), para no inventar un
// segundo modelo de permisos en paralelo. Lanza en vez de devolver boolean
// porque las rutas siempre quieren cortar ahi mismo con un 403.
export function verificarPermisoOverride(actor, usuarioObjetivoId) {
  if (actor.rol === 'cliente') {
    throw new Error('Solo un coach o el admin pueden personalizar parámetros.');
  }
  if (!puedeAccederAUsuario(actor, usuarioObjetivoId)) {
    throw new Error('No autorizado para este usuario.');
  }
}

// Merge recursivo generico: un campo presente (no undefined) en override
// gana sobre base; si ambos son objetos planos, se funde recursivamente;
// cualquier otro caso (numero, boolean, array) el valor de override
// reemplaza entero al de base - nunca mezcla elemento a elemento, para que
// "cambiar un rango de reps" sea siempre un reemplazo inequivoco del
// objeto {min,max} completo, no un merge ambiguo campo por campo cruzado
// entre 2 fuentes distintas.
function esObjetoPlano(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export function resolverConMerge(base, override) {
  if (!override) return base;
  const resultado = { ...base };
  for (const clave of Object.keys(override)) {
    const valorOverride = override[clave];
    if (valorOverride === undefined) continue;
    resultado[clave] = esObjetoPlano(valorOverride) && esObjetoPlano(base?.[clave])
      ? resolverConMerge(base[clave], valorOverride)
      : valorOverride;
  }
  return resultado;
}

// Override crudo (parcial, tal cual esta guardado) de un usuario - null si
// nunca personalizo nada en este dominio (usa el global tal cual).
export function obtenerOverrideCrudo(usuarioId, dominio) {
  validarDominio(dominio);
  const fila = getOverride.get(usuarioId, dominio);
  return fila ? { config: JSON.parse(fila.config_json), updatedBy: fila.updated_by, updatedAt: fila.updated_at } : null;
}

// Guarda (crea o reemplaza) el override parcial de un usuario - config
// puede traer solo los campos que cambiaron, no hace falta mandar el
// objeto completo.
export function guardarOverride({ usuarioId, dominio, config, updatedBy }) {
  validarDominio(dominio);
  upsertOverride.run({ usuario_id: usuarioId, dominio, config_json: JSON.stringify(config), updated_by: updatedBy ?? null });
}

// Borra el override: el usuario vuelve a usar el global tal cual, sin
// ninguna personalizacion.
export function borrarOverride(usuarioId, dominio) {
  validarDominio(dominio);
  deleteOverride.run(usuarioId, dominio);
}

// "Copiar parametros": toma el EFECTIVO ya resuelto de un origen (el coach
// mismo, u otro alumno) - no su override crudo, que podria estar vacio o
// parcial - y lo guarda como override EXPLICITO y completo del destino. Es
// una foto en el momento (un objeto plano, sin referencia al origen): si
// despues el origen cambia su propio override, el destino no se entera.
export function copiarParametrosEfectivos({ efectivoOrigen, usuarioDestinoId, dominio, updatedBy }) {
  guardarOverride({ usuarioId: usuarioDestinoId, dominio, config: efectivoOrigen, updatedBy });
}
