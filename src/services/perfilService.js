import db from '../db/index.js';

// Upserts puros de objetivo/disponibilidad/equipamiento, sin validacion (esa
// vive en routes/perfil.js, que es quien llama a estas funciones despues de
// validar). Extraidos a un servicio propio -en vez de vivir en perfil.js-
// para que solicitudCambio.js los pueda reusar al aprobar un cambio que
// habia quedado pendiente, sin crear un import circular entre rutas.

const upsertObjetivo = db.prepare(`
  INSERT INTO objetivo (usuario_id, tipo, sub_objetivo, deporte)
  VALUES (@usuario_id, @tipo, @sub_objetivo, @deporte)
  ON CONFLICT(usuario_id) DO UPDATE SET tipo = excluded.tipo, sub_objetivo = excluded.sub_objetivo, deporte = excluded.deporte
`);

export function aplicarObjetivo(usuario_id, { tipo, sub_objetivo, deporte }) {
  upsertObjetivo.run({ usuario_id, tipo, sub_objetivo, deporte: deporte || null });
}

const upsertDisponibilidad = db.prepare(`
  INSERT INTO disponibilidad (usuario_id, dias_por_semana, dias_especificos_json, duracion_sesion_json)
  VALUES (@usuario_id, @dias_por_semana, @dias_especificos_json, @duracion_sesion_json)
  ON CONFLICT(usuario_id) DO UPDATE SET dias_por_semana = excluded.dias_por_semana,
    dias_especificos_json = excluded.dias_especificos_json, duracion_sesion_json = excluded.duracion_sesion_json
`);

export function aplicarDisponibilidad(usuario_id, { dias_especificos, duracion_sesion }) {
  upsertDisponibilidad.run({
    usuario_id,
    dias_por_semana: dias_especificos.length,
    dias_especificos_json: JSON.stringify(dias_especificos),
    duracion_sesion_json: JSON.stringify(duracion_sesion),
  });
}

const upsertEquipamiento = db.prepare(`
  INSERT INTO equipamiento (usuario_id, tipo, checklist_json, musculos_ubicacion_json)
  VALUES (@usuario_id, @tipo, @checklist_json, @musculos_ubicacion_json)
  ON CONFLICT(usuario_id) DO UPDATE SET
    tipo = excluded.tipo, checklist_json = excluded.checklist_json,
    musculos_ubicacion_json = excluded.musculos_ubicacion_json
`);

export function aplicarEquipamiento(usuario_id, { tipo, checklist, musculos_ubicacion }) {
  upsertEquipamiento.run({
    usuario_id, tipo,
    checklist_json: JSON.stringify(checklist || []),
    musculos_ubicacion_json: JSON.stringify(musculos_ubicacion || {}),
  });
}
