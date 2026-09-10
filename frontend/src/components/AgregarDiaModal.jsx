import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { formatearMusculo } from '../utils/musculo.js';

const DIAS = [
  { id: 'lunes', label: 'Lunes' },
  { id: 'martes', label: 'Martes' },
  { id: 'miercoles', label: 'Miércoles' },
  { id: 'jueves', label: 'Jueves' },
  { id: 'viernes', label: 'Viernes' },
  { id: 'sabado', label: 'Sábado' },
  { id: 'domingo', label: 'Domingo' },
];

const MODOS = [
  { id: 'auto_solo_dia', label: 'Automático: completar solo este día', hint: 'El motor arma el día nuevo según el split actual — el resto de los días queda intacto.' },
  { id: 'auto_reorganizar', label: 'Automático: reorganizar toda la rutina', hint: 'Recalcula el split completo repartiendo mejor la semana — reutiliza los ejercicios y pesos ya cargados donde puede.' },
  { id: 'manual', label: 'Elegir yo los ejercicios', hint: 'Armás este día a mano desde el catálogo, como el resto de la rutina no se toca.' },
];

// Suma un dia nuevo a la rutina activa sin rehacerla entera (a diferencia
// de generar una rutina nueva desde el onboarding, que finaliza la actual y
// arranca todo de cero en Semana 0). Ver POST /usuarios/:id/rutina/dias.
export default function AgregarDiaModal({ usuarioId, diasActivos, onClose, onCreado }) {
  const diasDisponibles = DIAS.filter((d) => !diasActivos.includes(d.id));
  const [diaSemana, setDiaSemana] = useState(diasDisponibles[0]?.id ?? '');
  const [duracionMinutos, setDuracionMinutos] = useState(60);
  const [modo, setModo] = useState('auto_solo_dia');
  const [varianteSplit, setVarianteSplit] = useState('upper_lower');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  const [musculos, setMusculos] = useState([]);
  const [ejerciciosPorMusculo, setEjerciciosPorMusculo] = useState({});
  const [musculoAbierto, setMusculoAbierto] = useState(null);
  const [ejerciciosElegidos, setEjerciciosElegidos] = useState([]);

  useEffect(() => {
    if (modo === 'manual' && musculos.length === 0) {
      api.get('/catalogo/musculos').then(setMusculos).catch(() => {});
    }
  }, [modo, musculos.length]);

  async function cargarEjercicios(musculoId) {
    if (ejerciciosPorMusculo[musculoId]) return;
    try {
      const rows = await api.get(`/catalogo/ejercicios?musculo_id=${musculoId}`);
      setEjerciciosPorMusculo((prev) => ({ ...prev, [musculoId]: rows }));
    } catch {
      // el panel queda vacio, se puede reintentar reabriendo el musculo
    }
  }

  function toggleMusculo(musculoId) {
    setMusculoAbierto((prev) => (prev === musculoId ? null : musculoId));
    cargarEjercicios(musculoId);
  }
  function toggleEjercicio(ejercicioId) {
    setEjerciciosElegidos((prev) => (
      prev.includes(ejercicioId) ? prev.filter((id) => id !== ejercicioId) : [...prev, ejercicioId]
    ));
  }

  const cantidadDiasNueva = diasActivos.length + 1;
  const mostrarVariante = modo !== 'manual' && (cantidadDiasNueva === 4 || cantidadDiasNueva === 5);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    if (!diaSemana) {
      setError('Elegí qué día de la semana agregar.');
      return;
    }
    if (modo === 'manual' && ejerciciosElegidos.length === 0) {
      setError('Elegí al menos un ejercicio para el día nuevo.');
      return;
    }
    setEnviando(true);
    try {
      const rutina = await api.post(`/usuarios/${usuarioId}/rutina/dias`, {
        dia_semana: diaSemana,
        duracion_minutos: Number(duracionMinutos),
        modo,
        variante_split: mostrarVariante ? varianteSplit : undefined,
        ejercicios: modo === 'manual' ? ejerciciosElegidos : undefined,
      });
      onCreado(rutina);
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-3 w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-bold">Agregar un día</h2>
          <button type="button" onClick={onClose} className="text-text-faint text-[13px]">✕</button>
        </div>

        {diasDisponibles.length === 0 ? (
          <p className="text-[13px] text-text-muted">Ya tenés los 7 días de la semana activos.</p>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[11.5px] font-semibold text-text-muted">Día de la semana</span>
              <div className="flex gap-1.5 flex-wrap">
                {diasDisponibles.map((d) => (
                  <button
                    type="button"
                    key={d.id}
                    onClick={() => setDiaSemana(d.id)}
                    className={`px-3 h-8 rounded-full border text-[12.5px] font-semibold ${
                      diaSemana === d.id ? 'bg-accent text-accent-fg border-accent' : 'bg-bg border-border text-text-muted'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </label>

            <label className="flex items-center justify-between gap-2">
              <span className="text-[11.5px] font-semibold text-text-muted">Minutos disponibles ese día</span>
              <input
                type="number"
                min={20}
                max={120}
                step={5}
                value={duracionMinutos}
                onChange={(e) => setDuracionMinutos(e.target.value)}
                className="w-20 h-9 rounded-lg border border-border bg-bg px-2.5 tabular text-[13.5px] outline-none focus:border-accent"
              />
            </label>

            <div className="flex flex-col gap-1.5">
              <span className="text-[11.5px] font-semibold text-text-muted">Cómo armar el día</span>
              {MODOS.map((m) => (
                <button
                  type="button"
                  key={m.id}
                  onClick={() => setModo(m.id)}
                  className={`text-left rounded-lg border px-3 py-2 ${
                    modo === m.id ? 'bg-accent text-accent-fg border-accent' : 'bg-bg border-border text-text-muted'
                  }`}
                >
                  <div className="text-[12.5px] font-semibold">{m.label}</div>
                  <div className={`text-[11px] ${modo === m.id ? 'opacity-90' : 'text-text-faint'}`}>{m.hint}</div>
                </button>
              ))}
            </div>

            {mostrarVariante && (
              <div className="flex flex-col gap-1.5">
                <span className="text-[11.5px] font-semibold text-text-muted">Cómo repartir la semana</span>
                {[
                  { id: 'upper_lower', label: 'Upper / Lower', hint: 'Todo el cuerpo con frecuencia 2×.' },
                  { id: 'push_pull', label: 'Push / Pull', hint: 'Más foco en torso; piernas queda con menos frecuencia.' },
                ].map((v) => (
                  <button
                    type="button"
                    key={v.id}
                    onClick={() => setVarianteSplit(v.id)}
                    className={`text-left rounded-lg border px-3 py-2 ${
                      varianteSplit === v.id ? 'bg-accent text-accent-fg border-accent' : 'bg-surface border-border text-text-muted'
                    }`}
                  >
                    <div className="text-[12.5px] font-semibold">{v.label}</div>
                    <div className={`text-[11px] ${varianteSplit === v.id ? 'opacity-90' : 'text-text-faint'}`}>{v.hint}</div>
                  </button>
                ))}
              </div>
            )}

            {modo === 'manual' && (
              <div className="flex flex-col gap-2">
                <span className="text-[11.5px] font-semibold text-text-muted">Ejercicios del día nuevo</span>
                {ejerciciosElegidos.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    {ejerciciosElegidos.map((id) => {
                      const ej = Object.values(ejerciciosPorMusculo).flat().find((e) => e.id === id);
                      return (
                        <div key={id} className="flex items-center justify-between rounded-lg bg-bg px-3 h-9 text-[12.5px]">
                          <span>{ej?.nombre ?? `Ejercicio ${id}`}</span>
                          <button type="button" onClick={() => toggleEjercicio(id)} className="text-text-faint px-1">✕</button>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="flex gap-1.5 flex-wrap">
                  {musculos.map((m) => (
                    <button
                      type="button"
                      key={m.id}
                      onClick={() => toggleMusculo(m.id)}
                      className={`px-2.5 h-7 rounded-full border text-[11.5px] font-medium capitalize ${
                        musculoAbierto === m.id ? 'bg-accent text-accent-fg border-accent' : 'bg-bg border-border text-text-muted'
                      }`}
                    >
                      {formatearMusculo(m.nombre)}
                    </button>
                  ))}
                </div>
                {musculoAbierto && (
                  <div className="flex flex-col gap-1 rounded-lg border border-border p-1.5 max-h-40 overflow-y-auto">
                    {(ejerciciosPorMusculo[musculoAbierto] || []).map((ej) => {
                      const yaElegido = ejerciciosElegidos.includes(ej.id);
                      return (
                        <button
                          type="button"
                          key={ej.id}
                          disabled={yaElegido}
                          onClick={() => toggleEjercicio(ej.id)}
                          className={`text-left px-2.5 h-8 rounded-md text-[12.5px] ${yaElegido ? 'text-text-faint' : 'text-text hover:bg-bg'}`}
                        >
                          {ej.nombre} {yaElegido ? '(agregado)' : <span className="text-text-faint">· {ej.tipo}</span>}
                        </button>
                      );
                    })}
                    {ejerciciosPorMusculo[musculoAbierto]?.length === 0 && (
                      <span className="text-[12px] text-text-faint px-2.5 py-1.5">No hay ejercicios para este músculo.</span>
                    )}
                  </div>
                )}
              </div>
            )}

            {error && <p className="text-[12.5px] text-danger">{error}</p>}

            <button
              type="submit"
              disabled={enviando}
              className="h-10 rounded-lg bg-accent text-accent-fg text-[13.5px] font-semibold disabled:opacity-60"
            >
              {enviando ? 'Agregando…' : 'Agregar día'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
