import { Fragment } from 'react';
import { formatearMusculo } from '../../utils/musculo.js';
import { CAPITALIZAR, resumenMuscularPorMusculo, colorVsPactado, colorClase } from '../../utils/entrenamiento.js';

// Un numero con su comparacion contra el mismo dia del microciclo anterior
// (ver comparacion_microciclo_anterior en rutinaService.js) - verde si
// mejoro, rojo (mismo tono ambar/naranja del resto de la app) si bajo, sin
// referencia si esta semana el musculo no se entreno antes.
export function DeltaMusculo({ actual, anterior }) {
  if (anterior == null) return <span className="tabular">{actual}</span>;
  const clase = actual > anterior ? 'text-success font-semibold' : actual < anterior ? 'text-danger font-semibold' : '';
  return (
    <span className="tabular">
      <span className={clase}>{actual}</span>
      <span className="text-text-faint text-[11px]"> (antes {anterior})</span>
    </span>
  );
}

// Bloque al pie de la sesion con el total de series directas y reps
// efectivas por musculo, comparado contra el mismo dia (misma semana del
// bloque) del microciclo anterior - ver el pedido original: "poder ver la
// cantidad total de series directas y repeticiones efectivas por musculo"
// mas "la misma info del microciclo anterior, para poder comparar".
export function ResumenMuscularSesion({ resumen, comparacion, microcicloAnteriorNumero }) {
  if (resumen.length === 0) return null;
  const compPorMusculo = new Map((comparacion ?? []).map((c) => [c.musculo, c]));
  return (
    <div className="bg-surface border border-border rounded-[14px] p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-[13px] font-semibold">Series directas y reps efectivas por músculo</span>
        {comparacion && <span className="text-[11px] text-text-faint whitespace-nowrap">vs. Microciclo {microcicloAnteriorNumero}</span>}
      </div>
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-1.5 items-center text-[12.5px]">
        <span className="text-[10px] font-semibold text-text-faint tracking-wide">MÚSCULO</span>
        <span className="text-[10px] font-semibold text-text-faint tracking-wide text-right">SERIES</span>
        <span className="text-[10px] font-semibold text-text-faint tracking-wide text-right">REPS EF.</span>
        {resumen.map((m) => {
          const prev = compPorMusculo.get(m.musculo);
          return (
            <Fragment key={m.musculo}>
              <span className="text-text-muted">{formatearMusculo(m.musculo)}</span>
              <span className="text-right"><DeltaMusculo actual={m.series_directas} anterior={prev?.series_directas} /></span>
              <span className="text-right"><DeltaMusculo actual={m.reps_efectivas} anterior={prev?.reps_efectivas} /></span>
            </Fragment>
          );
        })}
      </div>
      {!comparacion && (
        <span className="text-[11px] text-text-faint">Sin datos del microciclo anterior para comparar todavía.</span>
      )}
    </div>
  );
}

export function ResumenSemanaPasada({ dia, numeroSemana, registro, coloreadoActivo }) {
  if (!registro) {
    return (
      <div className="bg-surface border border-border rounded-[14px] p-4 text-[13px] text-text-muted">
        Todavía no hay nada registrado en la Semana {numeroSemana} para {CAPITALIZAR(dia.dia_semana)}.
      </div>
    );
  }
  if (registro.salteada) {
    return (
      <div className="bg-surface border border-border rounded-[14px] p-4 text-[13px] text-text-muted">
        Salteaste {CAPITALIZAR(dia.dia_semana)} en la Semana {numeroSemana}.
      </div>
    );
  }

  const seriesPorEjercicio = new Map();
  for (const s of registro.series) {
    if (!seriesPorEjercicio.has(s.ejercicio_asignado_id)) seriesPorEjercicio.set(s.ejercicio_asignado_id, []);
    seriesPorEjercicio.get(s.ejercicio_asignado_id).push(s);
  }

  const semanaKey = numeroSemana === 2 ? 'semana2' : 'semana1';
  const comparacion = dia.comparacion_microciclo_anterior?.[semanaKey] ?? null;
  const resumenMuscular = resumenMuscularPorMusculo(
    dia,
    (ej) => (seriesPorEjercicio.get(ej.id) ?? []).map((s) => ({ esDropset: Boolean(s.es_dropset), reps: s.reps, rir: s.rir }))
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 md:grid md:grid-cols-2 md:items-start md:gap-4">
        {dia.ejercicios.map((ej) => {
          const series = seriesPorEjercicio.get(ej.id) ?? [];
          if (series.length === 0) return null;
          const { pesoColor, repsColores } = coloreadoActivo ? colorVsPactado(series, ej) : { pesoColor: null, repsColores: [] };
          let contadorReal = 0;
          const filas = series.map((s) => ({ s, realIdx: s.es_dropset ? -1 : contadorReal++ }));
          return (
            <div key={ej.id} className="bg-surface border border-border rounded-[14px] p-4 flex flex-col gap-2 min-w-0">
              <span className="text-[14.5px] font-semibold">{ej.ejercicio_nombre}</span>
              <div className="flex flex-col gap-1">
                {filas.map(({ s, realIdx }) => (
                  <div key={s.id} className="flex items-center gap-3 text-[13px] tabular">
                    <span className="text-text-faint w-14">{s.es_dropset ? 'Dropset' : `Serie ${s.numero_serie}`}</span>
                    <span>
                      <span className={s.es_dropset ? '' : colorClase(pesoColor)}>{s.peso} kg</span>
                      {' × '}
                      <span className={!s.es_dropset ? colorClase(repsColores[realIdx]) : ''}>{s.reps} reps</span>
                    </span>
                    {s.rir != null && <span className="text-text-faint">RIR {s.rir}</span>}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <ResumenMuscularSesion
        resumen={resumenMuscular}
        comparacion={comparacion}
        microcicloAnteriorNumero={dia.comparacion_microciclo_anterior?.numero}
      />
    </div>
  );
}
