import { useEffect, useState } from 'react';
import { api } from '../api/client.js';

const DIAS = [
  { id: 'lunes', label: 'Lunes' },
  { id: 'martes', label: 'Martes' },
  { id: 'miercoles', label: 'Miércoles' },
  { id: 'jueves', label: 'Jueves' },
  { id: 'viernes', label: 'Viernes' },
  { id: 'sabado', label: 'Sábado' },
  { id: 'domingo', label: 'Domingo' },
];

// Deja al usuario armar su rutina dia por dia eligiendo ejercicios del
// catalogo (GET /musculos + GET /ejercicios?musculo_id=), en vez de que el
// motor los elija por el los solo. "dias" viene del padre (OnboardingPage)
// como [{ dia_semana, ejercicios: [{id, nombre, musculo_nombre, tipo}] }].
export default function ArmadoManualRutina({ dias, onChange }) {
  const [musculos, setMusculos] = useState([]);
  const [ejerciciosPorMusculo, setEjerciciosPorMusculo] = useState({});
  const [musculoAbierto, setMusculoAbierto] = useState({});

  useEffect(() => {
    api.get('/catalogo/musculos').then(setMusculos).catch(() => {});
  }, []);

  async function cargarEjercicios(musculoId) {
    if (ejerciciosPorMusculo[musculoId]) return;
    try {
      const rows = await api.get(`/catalogo/ejercicios?musculo_id=${musculoId}`);
      setEjerciciosPorMusculo((prev) => ({ ...prev, [musculoId]: rows }));
    } catch {
      // Si falla la carga, el panel simplemente queda vacio - se puede reintentar
      // reabriendo el musculo (no hay estado de error dedicado por simplicidad).
    }
  }

  function agregarDia(diaId) {
    onChange([...dias, { dia_semana: diaId, ejercicios: [] }]);
  }
  function quitarDia(idx) {
    onChange(dias.filter((_, i) => i !== idx));
    setMusculoAbierto((prev) => {
      const { [idx]: _omit, ...resto } = prev;
      return resto;
    });
  }
  function toggleMusculoAbierto(diaIdx, musculoId) {
    setMusculoAbierto((prev) => ({ ...prev, [diaIdx]: prev[diaIdx] === musculoId ? null : musculoId }));
    cargarEjercicios(musculoId);
  }
  function agregarEjercicio(diaIdx, ejercicio) {
    const dia = dias[diaIdx];
    if (dia.ejercicios.some((e) => e.id === ejercicio.id)) return;
    const nuevo = [...dias];
    nuevo[diaIdx] = { ...dia, ejercicios: [...dia.ejercicios, ejercicio] };
    onChange(nuevo);
  }
  function quitarEjercicio(diaIdx, ejercicioId) {
    const dia = dias[diaIdx];
    const nuevo = [...dias];
    nuevo[diaIdx] = { ...dia, ejercicios: dia.ejercicios.filter((e) => e.id !== ejercicioId) };
    onChange(nuevo);
  }

  const diasDisponibles = DIAS.filter((d) => !dias.some((x) => x.dia_semana === d.id));

  return (
    <div className="flex flex-col gap-4">
      {dias.map((dia, idx) => {
        const label = DIAS.find((d) => d.id === dia.dia_semana)?.label;
        const abierto = musculoAbierto[idx];
        return (
          <div key={dia.dia_semana} className="rounded-xl border border-border bg-surface p-3.5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-[13.5px] font-semibold">{label}</span>
              <button type="button" onClick={() => quitarDia(idx)} className="text-[12px] text-danger">
                Quitar día
              </button>
            </div>

            {dia.ejercicios.length > 0 && (
              <div className="flex flex-col gap-1.5">
                {dia.ejercicios.map((ej) => (
                  <div key={ej.id} className="flex items-center justify-between rounded-lg bg-bg px-3 h-9 text-[12.5px]">
                    <span>
                      {ej.nombre} <span className="text-text-faint capitalize">· {ej.musculo_nombre}</span>
                    </span>
                    <button type="button" onClick={() => quitarEjercicio(idx, ej.id)} className="text-text-faint px-1">
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-1.5 flex-wrap">
              {musculos.map((m) => (
                <button
                  type="button"
                  key={m.id}
                  onClick={() => toggleMusculoAbierto(idx, m.id)}
                  className={`px-2.5 h-7 rounded-full border text-[11.5px] font-medium capitalize ${
                    abierto === m.id ? 'bg-accent text-accent-fg border-accent' : 'bg-bg border-border text-text-muted'
                  }`}
                >
                  {m.nombre}
                </button>
              ))}
            </div>

            {abierto && (
              <div className="flex flex-col gap-1 rounded-lg border border-border p-1.5 max-h-52 overflow-y-auto">
                {(ejerciciosPorMusculo[abierto] || []).map((ej) => {
                  const yaElegido = dia.ejercicios.some((e) => e.id === ej.id);
                  return (
                    <button
                      type="button"
                      key={ej.id}
                      disabled={yaElegido}
                      onClick={() => agregarEjercicio(idx, ej)}
                      className={`text-left px-2.5 h-8 rounded-md text-[12.5px] ${
                        yaElegido ? 'text-text-faint' : 'text-text hover:bg-bg'
                      }`}
                    >
                      {ej.nombre} {yaElegido ? '(agregado)' : <span className="text-text-faint">· {ej.tipo}</span>}
                    </button>
                  );
                })}
                {ejerciciosPorMusculo[abierto]?.length === 0 && (
                  <span className="text-[12px] text-text-faint px-2.5 py-1.5">No hay ejercicios para este músculo.</span>
                )}
                {!ejerciciosPorMusculo[abierto] && (
                  <span className="text-[12px] text-text-faint px-2.5 py-1.5">Cargando…</span>
                )}
              </div>
            )}
          </div>
        );
      })}

      {dias.length < 6 && (
        <div className="flex flex-col gap-2">
          <span className="text-[12px] text-text-muted">Agregar día:</span>
          <div className="flex gap-1.5 flex-wrap">
            {diasDisponibles.map((d) => (
              <button
                type="button"
                key={d.id}
                onClick={() => agregarDia(d.id)}
                className="px-3 h-9 rounded-lg border border-dashed border-border text-[12.5px] text-text-muted"
              >
                + {d.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
