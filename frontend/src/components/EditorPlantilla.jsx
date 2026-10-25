import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { formatearMusculo } from '../utils/musculo.js';

const DIAS = [
  ['lunes', 'Lunes'], ['martes', 'Martes'], ['miercoles', 'Miércoles'], ['jueves', 'Jueves'],
  ['viernes', 'Viernes'], ['sabado', 'Sábado'], ['domingo', 'Domingo'],
];
const ORDEN = DIAS.map(([id]) => id);
const NOMBRE_DIA = Object.fromEntries(DIAS);

const vacio = (v) => v === '' || v == null;

// Editor de la estructura de una plantilla: días de la semana, ejercicios del
// catálogo, orden y, por ejercicio, series, rango de reps y descanso. Sirve
// para crear una plantilla nueva (inicial vacío) y para editar una guardada.
// Un campo en blanco usa el valor estándar al guardar (el servidor lo completa).
export default function EditorPlantilla({ inicial, etiquetaGuardar = 'Guardar plantilla', onGuardar, onCancelar }) {
  const [nombre, setNombre] = useState(inicial.nombre ?? '');
  const [descripcion, setDescripcion] = useState(inicial.descripcion ?? '');
  const [dias, setDias] = useState(() => inicial.dias ?? []);
  const [musculos, setMusculos] = useState([]);
  const [porMusculo, setPorMusculo] = useState({});
  const [picker, setPicker] = useState(null); // { dia: índice, musculo: id|null }
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { api.get('/catalogo/musculos').then(setMusculos).catch(() => {}); }, []);

  async function abrirMusculo(diaIdx, musculoId) {
    setPicker({ dia: diaIdx, musculo: musculoId });
    if (!porMusculo[musculoId]) {
      try {
        const rows = await api.get(`/catalogo/ejercicios?musculo_id=${musculoId}`);
        setPorMusculo((p) => ({ ...p, [musculoId]: rows }));
      } catch { /* el panel queda vacío; se reintenta al reabrir */ }
    }
  }

  const setDia = (idx, cambio) => setDias((ds) => ds.map((d, i) => (i === idx ? { ...d, ...cambio } : d)));
  const setEj = (diaIdx, ejIdx, cambio) => setDia(diaIdx, {
    ejercicios: dias[diaIdx].ejercicios.map((e, i) => (i === ejIdx ? { ...e, ...cambio } : e)),
  });

  function mover(diaIdx, ejIdx, delta) {
    const lista = [...dias[diaIdx].ejercicios];
    const destino = ejIdx + delta;
    if (destino < 0 || destino >= lista.length) return;
    [lista[ejIdx], lista[destino]] = [lista[destino], lista[ejIdx]];
    setDia(diaIdx, { ejercicios: lista });
  }

  function agregarEjercicio(diaIdx, ej) {
    if (dias[diaIdx].ejercicios.some((e) => e.ejercicio_id === ej.id)) return;
    setDia(diaIdx, {
      ejercicios: [...dias[diaIdx].ejercicios, {
        ejercicio_id: ej.id, ejercicio_nombre: ej.nombre, musculo_nombre: ej.musculo_nombre,
        series: '', rango_reps_min: '', rango_reps_max: '', descanso_segundos: '',
      }],
    });
  }

  const usados = dias.map((d) => d.dia_semana);
  const libres = DIAS.filter(([id]) => !usados.includes(id));
  const incompleto = !nombre.trim() || dias.length === 0 || dias.some((d) => d.ejercicios.length === 0);

  async function guardar() {
    setEnviando(true);
    setError('');
    try {
      await onGuardar({
        nombre,
        descripcion,
        dias: dias.map((d) => ({
          dia_semana: d.dia_semana,
          ejercicios: d.ejercicios.map((e) => ({
            ejercicio_id: e.ejercicio_id,
            musculo_objetivo_id: e.musculo_objetivo_id,
            es_top_de_musculo: e.es_top_de_musculo,
            musculos_secundarios: e.musculos_secundarios,
            ...(vacio(e.series) ? {} : { series: Number(e.series) }),
            ...(vacio(e.rango_reps_min) ? {} : { rango_reps_min: Number(e.rango_reps_min) }),
            ...(vacio(e.rango_reps_max) ? {} : { rango_reps_max: Number(e.rango_reps_max) }),
            ...(vacio(e.descanso_segundos) ? {} : { descanso_segundos: Number(e.descanso_segundos) }),
          })),
        })),
      });
    } catch (err) {
      setError(err.message);
      setEnviando(false);
    }
  }

  const campo = 'h-8 w-full min-w-0 rounded-md border border-border bg-bg px-1 text-center tabular text-[12.5px] text-text outline-none focus:border-accent placeholder:text-text-faint';

  return (
    <div className="bg-surface border border-accent rounded-[14px] p-4 flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-[12.5px] font-semibold">
        Nombre
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={80}
          className="h-10 rounded-lg border border-border bg-bg px-3 text-[14px] font-normal outline-none focus:border-accent" />
      </label>
      <label className="flex flex-col gap-1 text-[12.5px] font-semibold">
        Descripción (opcional)
        <textarea value={descripcion ?? ''} onChange={(e) => setDescripcion(e.target.value)} maxLength={300} rows={2}
          className="rounded-lg border border-border bg-bg px-3 py-2 text-[13.5px] font-normal outline-none focus:border-accent" />
      </label>

      {dias.map((dia, di) => (
        <div key={di} className="rounded-xl border border-border bg-bg p-3 flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-2">
            <select
              value={dia.dia_semana}
              onChange={(e) => setDia(di, { dia_semana: e.target.value })}
              aria-label={`Día de la semana del día ${di + 1}`}
              className="h-9 rounded-md border border-border bg-surface px-2 text-[13.5px] font-semibold"
            >
              {[...DIAS.filter(([id]) => id === dia.dia_semana || libres.some(([l]) => l === id))]
                .sort((a, b) => ORDEN.indexOf(a[0]) - ORDEN.indexOf(b[0]))
                .map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
            <button type="button" onClick={() => { setDias(dias.filter((_, i) => i !== di)); setPicker(null); }} className="text-[12px] text-danger">
              Quitar día
            </button>
          </div>

          {dia.ejercicios.map((e, ei) => (
            <div key={e.ejercicio_id} className="rounded-lg bg-surface border border-border px-2.5 py-2 flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 text-[12.5px] font-semibold truncate">
                  {e.ejercicio_nombre} <span className="text-text-faint font-normal capitalize">· {formatearMusculo(e.musculo_nombre)}</span>
                </span>
                <span className="flex-none flex items-center">
                  <button type="button" onClick={() => mover(di, ei, -1)} disabled={ei === 0} aria-label="Subir" className="w-7 h-7 text-text-muted disabled:opacity-30">↑</button>
                  <button type="button" onClick={() => mover(di, ei, 1)} disabled={ei === dia.ejercicios.length - 1} aria-label="Bajar" className="w-7 h-7 text-text-muted disabled:opacity-30">↓</button>
                  <button type="button" onClick={() => setDia(di, { ejercicios: dia.ejercicios.filter((_, i) => i !== ei) })} aria-label="Quitar ejercicio" className="w-7 h-7 text-text-faint">✕</button>
                </span>
              </div>
              <div className="grid grid-cols-[1fr_1.6fr_1fr] gap-2 items-end text-[10.5px] text-text-faint">
                <label className="flex flex-col gap-0.5">Series
                  <input type="number" inputMode="numeric" min={1} max={10} value={e.series ?? ''} placeholder="2" onChange={(ev) => setEj(di, ei, { series: ev.target.value })} className={campo} />
                </label>
                <span className="flex flex-col gap-0.5">Reps (mín–máx)
                  <span className="flex items-center gap-1">
                    <input type="number" inputMode="numeric" min={1} max={50} value={e.rango_reps_min ?? ''} placeholder="8" aria-label="Reps mínimas" onChange={(ev) => setEj(di, ei, { rango_reps_min: ev.target.value })} className={campo} />
                    <span>–</span>
                    <input type="number" inputMode="numeric" min={1} max={50} value={e.rango_reps_max ?? ''} placeholder="16" aria-label="Reps máximas" onChange={(ev) => setEj(di, ei, { rango_reps_max: ev.target.value })} className={campo} />
                  </span>
                </span>
                <label className="flex flex-col gap-0.5">Descanso (s)
                  <input type="number" inputMode="numeric" min={10} max={600} value={e.descanso_segundos ?? ''} placeholder="90" onChange={(ev) => setEj(di, ei, { descanso_segundos: ev.target.value })} className={campo} />
                </label>
              </div>
            </div>
          ))}

          {picker?.dia === di ? (
            <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-surface p-2">
              <div className="flex gap-1.5 flex-wrap">
                {musculos.map((m) => (
                  <button key={m.id} type="button" onClick={() => abrirMusculo(di, m.id)}
                    className={`px-2.5 h-7 rounded-full border text-[11.5px] font-medium capitalize ${picker.musculo === m.id ? 'bg-accent text-accent-fg border-accent' : 'bg-bg border-border text-text-muted'}`}>
                    {formatearMusculo(m.nombre)}
                  </button>
                ))}
              </div>
              {picker.musculo && (
                <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                  {(porMusculo[picker.musculo] ?? []).map((ej) => {
                    const ya = dia.ejercicios.some((e) => e.ejercicio_id === ej.id);
                    return (
                      <button key={ej.id} type="button" disabled={ya} onClick={() => agregarEjercicio(di, ej)}
                        className={`text-left px-2.5 h-8 rounded-md text-[12.5px] ${ya ? 'text-text-faint' : 'hover:bg-bg'}`}>
                        {ej.nombre} {ya && '(agregado)'}
                      </button>
                    );
                  })}
                  {!porMusculo[picker.musculo] && <span className="text-[12px] text-text-faint px-2">Cargando…</span>}
                </div>
              )}
              <button type="button" onClick={() => setPicker(null)} className="self-start text-[12px] text-text-muted underline underline-offset-2">Cerrar</button>
            </div>
          ) : (
            <button type="button" onClick={() => setPicker({ dia: di, musculo: null })}
              className="self-start h-8 px-3 rounded-lg border border-dashed border-border text-[12.5px] text-text-muted">
              + Agregar ejercicio
            </button>
          )}
        </div>
      ))}

      {libres.length > 0 && dias.length < 7 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[12px] text-text-muted">Agregar día:</span>
          <div className="flex gap-1.5 flex-wrap">
            {libres.map(([id, label]) => (
              <button key={id} type="button" onClick={() => setDias([...dias, { dia_semana: id, ejercicios: [] }].sort((a, b) => ORDEN.indexOf(a.dia_semana) - ORDEN.indexOf(b.dia_semana)))}
                className="px-3 h-9 rounded-lg border border-dashed border-border text-[12.5px] text-text-muted">
                + {label}
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="text-[11.5px] text-text-faint leading-relaxed">
        Lo que dejes en blanco usa el valor estándar (series mínimas, reps 8–16, descanso 90 s o 60 s si es unilateral).
        Los días de la semana son una referencia: al aplicarla podés elegir otros. Los cambios no afectan rutinas ya creadas con esta plantilla.
      </p>
      {error && <p className="text-[12.5px] text-danger">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onCancelar} disabled={enviando} className="flex-1 h-10 rounded-lg border border-border bg-bg text-text-muted text-[13px] font-semibold">Cancelar</button>
        <button type="button" onClick={guardar} disabled={enviando || incompleto}
          className="flex-[2] h-10 rounded-lg bg-accent text-accent-fg text-[13px] font-semibold disabled:opacity-60">
          {enviando ? 'Guardando…' : etiquetaGuardar}
        </button>
      </div>
    </div>
  );
}
