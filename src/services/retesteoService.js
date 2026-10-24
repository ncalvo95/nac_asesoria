import db from '../db/index.js';
import { e1rm } from '../../shared/training/e1rm.js';
import { asegurarNoPausada } from './pausaService.js';

// Retesteo de UN ejercicio ("resetear pesos y reps"). Ver retesteo_ejercicio en
// schema.sql. El ejercicio queda en blanco; lo que se cargue despues es la
// nueva linea base y ese bloque no cuenta como progreso para el (ni mejoro ni
// estancado): al cerrar, en vez de eso se guarda cuanto subio o bajo el
// rendimiento (1RM estimado) contra lo de antes.

const eaStmt = db.prepare(`
  SELECT ea.*, dr.rutina_id, r.usuario_id
  FROM ejercicio_asignado ea
  JOIN dia_rutina dr ON dr.id = ea.dia_rutina_id
  JOIN rutina r ON r.id = dr.rutina_id
  WHERE ea.id = ?
`);
const microcicloEnCursoStmt = db.prepare("SELECT * FROM microciclo WHERE rutina_id = ? AND estado = 'en_curso'");
const progresoStmt = db.prepare('SELECT * FROM progreso_ejercicio_microciclo WHERE ejercicio_asignado_id = ? AND microciclo_id = ?');
const upsertProgresoStmt = db.prepare(`
  INSERT INTO progreso_ejercicio_microciclo (ejercicio_asignado_id, microciclo_id, peso_prescrito, piso_reps, series_prescritas)
  VALUES (@ejercicio_asignado_id, @microciclo_id, @peso_prescrito, @piso_reps, @series_prescritas)
  ON CONFLICT(ejercicio_asignado_id, microciclo_id) DO UPDATE SET
    peso_prescrito = excluded.peso_prescrito, piso_reps = excluded.piso_reps, series_prescritas = excluded.series_prescritas
`);
const abiertoStmt = db.prepare("SELECT * FROM retesteo_ejercicio WHERE ejercicio_asignado_id = ? AND estado = 'abierto'");
const abiertosDeRutinaStmt = db.prepare(`
  SELECT rt.* FROM retesteo_ejercicio rt
  JOIN ejercicio_asignado ea ON ea.id = rt.ejercicio_asignado_id
  JOIN dia_rutina dr ON dr.id = ea.dia_rutina_id
  WHERE dr.rutina_id = ? AND rt.estado = 'abierto'
`);
const maxSesionStmt = db.prepare('SELECT COALESCE(MAX(id), 0) AS id FROM registro_sesion');

// Mejor serie de la ULTIMA sesion en que se hizo este ejercicio del catalogo
// (el nivel "de antes" contra el que se compara el retesteo).
const seriesUltimaSesionStmt = db.prepare(`
  SELECT rs.peso, rs.reps
  FROM registro_serie rs
  JOIN registro_sesion rses ON rses.id = rs.registro_sesion_id
  JOIN ejercicio_asignado ea ON ea.id = rs.ejercicio_asignado_id
  WHERE rses.usuario_id = ? AND ea.ejercicio_id = ? AND rses.salteada = 0 AND rs.es_dropset = 0
    AND rses.id = (
      SELECT rses2.id FROM registro_serie rs2
      JOIN registro_sesion rses2 ON rses2.id = rs2.registro_sesion_id
      JOIN ejercicio_asignado ea2 ON ea2.id = rs2.ejercicio_asignado_id
      WHERE rses2.usuario_id = ? AND ea2.ejercicio_id = ? AND rses2.salteada = 0 AND rs2.es_dropset = 0
      ORDER BY rses2.fecha DESC, rses2.id DESC LIMIT 1
    )
`);

function mejorSerie(series) {
  let mejor = null;
  for (const s of series) {
    const valor = e1rm(s.peso, s.reps);
    if (valor != null && (mejor == null || valor > mejor.e1rm)) mejor = { peso: s.peso, reps: s.reps, e1rm: valor };
  }
  return mejor;
}

export function retesteoAbierto(ejercicioAsignadoId) {
  return abiertoStmt.get(ejercicioAsignadoId) ?? null;
}

// { [ejercicio_asignado_id]: fila } de los retesteos en curso de una rutina.
export function retesteosAbiertosDeRutina(rutinaId) {
  return new Map(abiertosDeRutinaStmt.all(rutinaId).map((r) => [r.ejercicio_asignado_id, r]));
}

export const resetearEjercicio = db.transaction((ejercicioAsignadoId) => {
  const ea = eaStmt.get(ejercicioAsignadoId);
  if (!ea) throw new Error('Ejercicio no encontrado.');
  asegurarNoPausada(ea.rutina_id);
  const micro = microcicloEnCursoStmt.get(ea.rutina_id);
  if (!micro || micro.tipo !== 'normal' || micro.numero < 1) {
    throw new Error('Solo se puede resetear un ejercicio durante un bloque normal en curso (no en una semana de testeo ni de descarga).');
  }
  if (ea.variante_activa_id != null) throw new Error('Este ejercicio tiene una variante activa: volvé al titular antes de resetearlo.');
  if (retesteoAbierto(ea.id)) throw new Error('Este ejercicio ya está en retesteo.');

  const progreso = progresoStmt.get(ea.id, micro.id);
  const anterior = mejorSerie(seriesUltimaSesionStmt.all(ea.usuario_id, ea.ejercicio_id, ea.usuario_id, ea.ejercicio_id));

  const { lastInsertRowid } = db.prepare(`
    INSERT INTO retesteo_ejercicio
      (ejercicio_asignado_id, microciclo_id, sesion_desde_id, peso_anterior, piso_anterior, series_anterior,
       peso_mejor_anterior, reps_mejor_anterior, e1rm_anterior)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    ea.id, micro.id, maxSesionStmt.get().id,
    progreso?.peso_prescrito ?? ea.peso_actual ?? null, progreso?.piso_reps ?? null, progreso?.series_prescritas ?? ea.series_actuales,
    anterior?.peso ?? null, anterior?.reps ?? null, anterior?.e1rm ?? null,
  );

  // En blanco, igual que tras saltear un testeo: peso sin definir y piso 0.
  upsertProgresoStmt.run({
    ejercicio_asignado_id: ea.id, microciclo_id: micro.id, peso_prescrito: 0, piso_reps: 0,
    series_prescritas: progreso?.series_prescritas ?? ea.series_actuales,
  });
  db.prepare('UPDATE ejercicio_asignado SET peso_actual = NULL WHERE id = ?').run(ea.id);
  return db.prepare('SELECT * FROM retesteo_ejercicio WHERE id = ?').get(lastInsertRowid);
});

// Deshace un retesteo todavia abierto: vuelve el peso/piso de antes. Lo ya
// cargado queda en el historial pero no cambia la linea base.
export const cancelarRetesteo = db.transaction((ejercicioAsignadoId) => {
  const rt = retesteoAbierto(ejercicioAsignadoId);
  if (!rt) throw new Error('Este ejercicio no está en retesteo.');
  const ea = eaStmt.get(ejercicioAsignadoId);
  asegurarNoPausada(ea.rutina_id);
  restaurarAnterior(rt, 'cancelado');
  return { cancelado: true };
});

function restaurarAnterior(rt, estado) {
  upsertProgresoStmt.run({
    ejercicio_asignado_id: rt.ejercicio_asignado_id, microciclo_id: rt.microciclo_id,
    peso_prescrito: rt.peso_anterior ?? 0, piso_reps: rt.piso_anterior ?? 0,
    series_prescritas: rt.series_anterior ?? 2,
  });
  db.prepare('UPDATE ejercicio_asignado SET peso_actual = ? WHERE id = ?').run(rt.peso_anterior || null, rt.ejercicio_asignado_id);
  db.prepare("UPDATE retesteo_ejercicio SET estado = ?, cerrado_en = datetime('now') WHERE id = ?").run(estado, rt.id);
}

// Si el bloque se convierte en semana de testeo o de descarga con retesteos en
// curso, esos retesteos se cancelan (el testeo/descarga ya recalibra todo).
export function cancelarRetestesDeMicrociclo(rutinaId, microcicloId) {
  for (const rt of abiertosDeRutinaStmt.all(rutinaId)) {
    if (rt.microciclo_id === microcicloId) restaurarAnterior(rt, 'cancelado');
  }
}

// --- cierre de bloque (lo llama cerrarMicrociclo) ---

const ultimaSerieRetesteoStmt = db.prepare(`
  SELECT rs.reps, rs.peso
  FROM registro_serie rs
  JOIN registro_sesion s ON s.id = rs.registro_sesion_id
  WHERE rs.ejercicio_asignado_id = ? AND s.id > ? AND s.fecha BETWEEN ? AND ? AND s.salteada = 0 AND rs.es_dropset = 0
  ORDER BY s.fecha DESC, s.id DESC, rs.numero_serie DESC
  LIMIT 1
`);
const seriesRetesteoStmt = db.prepare(`
  SELECT rs.peso, rs.reps, s.fecha
  FROM registro_serie rs
  JOIN registro_sesion s ON s.id = rs.registro_sesion_id
  WHERE rs.ejercicio_asignado_id = ? AND s.id > ? AND s.salteada = 0 AND rs.es_dropset = 0
`);

// Lo que se hizo en el retesteo: reps de la ultima serie de cada semana (como
// el cierre normal), el peso de la ultima serie del bloque y la mejor serie
// por 1RM estimado. `techoDesde` es la funcion del motor para juntar las 2
// semanas; con una sola semana con datos se usa esa.
export function medirRetesteo(rt, semana1, semana2, techoDesde) {
  const s1 = ultimaSerieRetesteoStmt.get(rt.ejercicio_asignado_id, rt.sesion_desde_id, ...semana1);
  const s2 = ultimaSerieRetesteoStmt.get(rt.ejercicio_asignado_id, rt.sesion_desde_id, ...semana2);
  const sem1 = s1?.reps ?? null;
  const sem2 = s2?.reps ?? null;
  const techo = sem1 != null && sem2 != null ? techoDesde(sem1, sem2) : (sem1 ?? sem2);
  const pesoFinal = (s2 ?? s1)?.peso ?? null;
  return { sem1, sem2, techo, pesoFinal, mejor: mejorSerie(seriesRetesteoStmt.all(rt.ejercicio_asignado_id, rt.sesion_desde_id)) };
}

const redondear1 = (n) => Math.round(n * 10) / 10;

// Cierra el retesteo con lo medido. Devuelve lo que el cierre de bloque debe
// prescribir para el proximo bloque y la nota para el ejercicio.
export function cerrarRetesteo(rt, medicion, progreso) {
  if (medicion.techo == null || medicion.pesoFinal == null) {
    restaurarAnterior(rt, 'sin_datos');
    return {
      peso: rt.peso_anterior ?? 0, piso: rt.piso_anterior ?? 0, series: rt.series_anterior ?? progreso.series_prescritas,
      nota: 'Retesteo sin datos: no se cargó nada después del reseteo, se mantiene lo anterior.',
    };
  }
  const nuevo = medicion.mejor;
  const delta = nuevo && rt.e1rm_anterior ? redondear1(((nuevo.e1rm - rt.e1rm_anterior) / rt.e1rm_anterior) * 100) : null;
  db.prepare(`
    UPDATE retesteo_ejercicio
    SET estado = 'cerrado', cerrado_en = datetime('now'), peso_nuevo = ?, reps_nuevo = ?, e1rm_nuevo = ?, delta_e1rm_pct = ?
    WHERE id = ?
  `).run(nuevo?.peso ?? medicion.pesoFinal, nuevo?.reps ?? medicion.techo, nuevo?.e1rm ?? null, delta, rt.id);
  const comparacion = delta == null
    ? 'Sin valor anterior para comparar.'
    : `Rendimiento ${delta >= 0 ? 'subió' : 'bajó'} ${Math.abs(delta)}% (1RM estimado) respecto de antes del reseteo.`;
  return {
    peso: medicion.pesoFinal, piso: medicion.techo, series: progreso.series_prescritas,
    nota: `Retesteo: nueva línea base ${medicion.pesoFinal} kg × ${medicion.techo}. ${comparacion} No cuenta como progreso del bloque.`,
  };
}

// Historial de retesteos de una rutina (cerrados, sin datos y cancelados) para
// la pantalla de Progreso.
export function listarRetesteos(rutinaId, limite = 30) {
  return db.prepare(`
    SELECT rt.*, e.nombre AS ejercicio_nombre, mu.nombre AS musculo_nombre, mc.numero AS microciclo_numero
    FROM retesteo_ejercicio rt
    JOIN ejercicio_asignado ea ON ea.id = rt.ejercicio_asignado_id
    JOIN dia_rutina dr ON dr.id = ea.dia_rutina_id
    JOIN ejercicio e ON e.id = ea.ejercicio_id
    JOIN musculo mu ON mu.id = ea.musculo_objetivo_id
    JOIN microciclo mc ON mc.id = rt.microciclo_id
    WHERE dr.rutina_id = ? AND rt.estado != 'abierto'
    ORDER BY rt.id DESC LIMIT ?
  `).all(rutinaId, limite);
}
