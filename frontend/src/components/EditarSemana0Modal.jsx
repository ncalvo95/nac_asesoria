import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { formatearMusculo } from '../utils/musculo.js';

const CAPITALIZAR = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Corrige lo cargado en la semana de testeo que dio origen al microciclo en
// curso - pensado para el caso "me equivoqué al tipear" o "un bug cerró el
// testeo antes de tiempo" (ver Enter implícito en Semana0Form), cuando ya
// no hay forma de volver a la pantalla de Semana 0 porque el testeo ya
// cerró. Solo funciona mientras el microciclo siguiente no se haya cerrado
// -eso lo decide el backend, este componente solo muestra lo que le
// contesta GET /semana0/editar (null si no hay nada editable ahora).
export default function EditarSemana0Modal({ rutinaId, onClose, onCorregido }) {
  const [cargando, setCargando] = useState(true);
  const [datos, setDatos] = useState(null); // { microciclo, ejercicios } o null
  const [valores, setValores] = useState({});
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    api.get(`/rutinas/${rutinaId}/semana0/editar`)
      .then((d) => {
        setDatos(d);
        if (d) {
          setValores(Object.fromEntries(d.ejercicios.map((e) => [
            e.ejercicio_asignado_id,
            { peso: String(e.peso), reps1: String(e.reps_serie1), reps2: String(e.reps_serie2) },
          ])));
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setCargando(false));
  }, [rutinaId]);

  function set(id, campo, valor) {
    setValores((v) => ({ ...v, [id]: { ...v[id], [campo]: valor } }));
  }

  async function confirmar() {
    setError('');
    const resultados = [];
    for (const ej of datos.ejercicios) {
      const v = valores[ej.ejercicio_asignado_id];
      if (!v.peso || !v.reps1 || !v.reps2) {
        setError(`Completá peso y las 2 series de "${ej.ejercicio_nombre}".`);
        return;
      }
      resultados.push({
        ejercicio_asignado_id: ej.ejercicio_asignado_id,
        peso: Number(v.peso),
        reps_serie1: Number(v.reps1),
        reps_serie2: Number(v.reps2),
      });
    }
    setEnviando(true);
    try {
      await api.put(`/rutinas/${rutinaId}/semana0/editar`, { resultados });
      onCorregido();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-3 w-full max-w-lg max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-bold">Editar Semana 0</h2>
          <button type="button" onClick={onClose} className="text-text-faint text-[13px]">✕</button>
        </div>

        {cargando && <p className="text-[13px] text-text-muted">Cargando…</p>}

        {!cargando && !datos && (
          <>
            <p className="text-[13px] text-text-muted leading-relaxed">
              No hay una semana de testeo para corregir en este momento - o no
              hay ninguna, o el microciclo que generó ya se cerró (avanzó más
              allá, así que tocar el testeo ahora rompería la progresión).
            </p>
            <button
              type="button"
              onClick={onClose}
              className="self-end h-10 px-4 rounded-lg border border-border bg-bg text-text-muted text-[13px] font-semibold"
            >
              Cerrar
            </button>
          </>
        )}

        {!cargando && datos && (
          <>
            <p className="text-[12.5px] text-text-muted leading-relaxed">
              Corregí el peso y las 2 series que se cargaron en la Semana 0.
              Al guardar, también se actualiza el peso y el piso de reps
              sugeridos en el microciclo en curso.
            </p>
            <div className="flex flex-col gap-2.5 overflow-y-auto pr-1">
              {datos.ejercicios.map((ej) => (
                <div key={ej.ejercicio_asignado_id} className="bg-bg border border-border rounded-lg p-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-semibold">{ej.ejercicio_nombre}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10.5px] font-semibold text-text-muted bg-surface border border-border rounded-md px-1.5 py-0.5 uppercase">
                        {formatearMusculo(ej.musculo_nombre)}
                      </span>
                      <span className="text-[11px] text-text-faint whitespace-nowrap">{CAPITALIZAR(ej.dia_semana)}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Campo label="Peso (kg)" value={valores[ej.ejercicio_asignado_id]?.peso ?? ''} onChange={(v) => set(ej.ejercicio_asignado_id, 'peso', v)} />
                    <Campo label="Reps S1" value={valores[ej.ejercicio_asignado_id]?.reps1 ?? ''} onChange={(v) => set(ej.ejercicio_asignado_id, 'reps1', v)} />
                    <Campo label="Reps S2" value={valores[ej.ejercicio_asignado_id]?.reps2 ?? ''} onChange={(v) => set(ej.ejercicio_asignado_id, 'reps2', v)} />
                  </div>
                </div>
              ))}
            </div>

            {error && <p className="text-[12.5px] text-danger">{error}</p>}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                disabled={enviando}
                className="flex-1 h-10 rounded-lg border border-border bg-bg text-text-muted text-[13px] font-semibold disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmar}
                disabled={enviando}
                className="flex-[2] h-10 rounded-lg bg-accent text-accent-fg text-[13px] font-semibold disabled:opacity-60"
              >
                {enviando ? 'Guardando…' : 'Guardar correcciones'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Campo({ label, value, onChange }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10.5px] font-semibold text-text-muted">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full min-w-0 h-9 rounded-lg border border-border bg-surface px-2 tabular text-[13px] text-center outline-none focus:border-accent"
      />
    </label>
  );
}
