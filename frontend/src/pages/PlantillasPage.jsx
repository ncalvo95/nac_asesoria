import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { formatearMusculo } from '../utils/musculo.js';
import EditorPlantilla from '../components/EditorPlantilla.jsx';

const NOMBRE_DIA = { lunes: 'Lunes', martes: 'Martes', miercoles: 'Miércoles', jueves: 'Jueves', viernes: 'Viernes', sabado: 'Sábado', domingo: 'Domingo' };

// Plantillas de rutina del coach: ver, renombrar y borrar. Se crean desde la
// rutina de un alumno ("Guardar como plantilla") y se aplican desde Rutinas.
export default function PlantillasPage() {
  const [plantillas, setPlantillas] = useState(null);
  const [error, setError] = useState('');
  const [abierta, setAbierta] = useState(null); // { id, detalle }
  const [editando, setEditando] = useState(null); // { id, detalle }
  const [ocupada, setOcupada] = useState(null);
  const [creando, setCreando] = useState(false);

  async function cargar() {
    try {
      setPlantillas(await api.get('/plantillas'));
    } catch (err) {
      setError(err.message);
      setPlantillas([]);
    }
  }
  useEffect(() => { cargar(); }, []);

  async function alternarDetalle(id) {
    if (abierta?.id === id) return setAbierta(null);
    try {
      setAbierta({ id, detalle: await api.get(`/plantillas/${id}`) });
    } catch (err) {
      setError(err.message);
    }
  }

  async function empezarEdicion(id) {
    setError('');
    try {
      setEditando({ id, detalle: await api.get(`/plantillas/${id}`) });
      setAbierta(null);
    } catch (err) {
      setError(err.message);
    }
  }

  async function borrar(p) {
    if (!window.confirm(`¿Borrar la plantilla "${p.nombre}"? Las rutinas que ya creaste con ella no se tocan.`)) return;
    setOcupada(p.id);
    setError('');
    try {
      await api.del(`/plantillas/${p.id}`);
      if (abierta?.id === p.id) setAbierta(null);
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setOcupada(null);
    }
  }

  return (
    <div className="min-h-dvh bg-bg">
      <header className="bg-surface border-b border-border px-5 py-3 flex items-center gap-3">
        <Link to="/coach" className="text-[13px] font-semibold text-accent">← Volver</Link>
        <span className="text-[15px] font-bold">Plantillas de rutina</span>
      </header>
      <div className="p-4 flex flex-col gap-3 max-w-xl w-full mx-auto">
        <p className="text-[13px] text-text-muted leading-relaxed">
          Una plantilla es la estructura de una rutina (días, ejercicios, series, reps y descanso) para aplicarla a varios alumnos. La podés armar
          desde cero acá o guardar la rutina de un alumno con “Guardar como plantilla” en su pantalla <strong>Rutinas</strong>; para usarla,
          “Usar plantilla” en ese mismo lugar.
        </p>
        {error && <p className="text-[13px] text-danger">{error}</p>}

        {creando ? (
          <EditorPlantilla
            inicial={{ nombre: '', descripcion: '', dias: [] }}
            onCancelar={() => setCreando(false)}
            onGuardar={async (payload) => { await api.post('/plantillas/desde-cero', payload); setCreando(false); await cargar(); }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setCreando(true)}
            className="self-start h-10 px-4 rounded-[10px] bg-accent text-accent-fg text-[13.5px] font-semibold"
          >
            + Nueva plantilla desde cero
          </button>
        )}

        {plantillas === null && <p className="text-[13px] text-text-muted">Cargando…</p>}
        {plantillas?.length === 0 && !error && <p className="text-[13px] text-text-muted">Todavía no guardaste ninguna plantilla.</p>}

        {plantillas?.map((p) => (editando?.id === p.id ? (
          <EditorPlantilla
            key={p.id}
            inicial={editando.detalle}
            etiquetaGuardar="Guardar cambios"
            onCancelar={() => setEditando(null)}
            onGuardar={async (payload) => { await api.patch(`/plantillas/${p.id}`, payload); setEditando(null); await cargar(); }}
          />
        ) : (
          <div key={p.id} className="bg-surface border border-border rounded-[14px] p-4 flex flex-col gap-2.5">
            <div className="flex flex-col gap-0.5">
              <span className="text-[14.5px] font-semibold">{p.nombre}</span>
              {p.descripcion && <span className="text-[12.5px] text-text-muted">{p.descripcion}</span>}
              <span className="text-[12px] text-text-faint">{p.cantidad_dias} días · {p.cantidad_ejercicios} ejercicios</span>
            </div>

            <div className="flex flex-wrap gap-1">
              {p.musculos.map((m) => (
                <span key={m} className="text-[10.5px] font-semibold text-text-muted bg-bg border border-border rounded-md px-1.5 py-0.5 uppercase">{formatearMusculo(m)}</span>
              ))}
            </div>

            <div className="flex gap-2 flex-wrap">
              <button type="button" onClick={() => alternarDetalle(p.id)} className="h-8 px-3 rounded-lg border border-border bg-bg text-text-muted text-[12.5px] font-semibold">
                {abierta?.id === p.id ? 'Ocultar detalle' : 'Ver detalle'}
              </button>
              <button type="button" onClick={() => empezarEdicion(p.id)} className="h-8 px-3 rounded-lg border border-border bg-bg text-text-muted text-[12.5px] font-semibold">
                Editar
              </button>
              <button type="button" onClick={() => borrar(p)} disabled={ocupada === p.id} className="h-8 px-3 rounded-lg border border-danger text-danger text-[12.5px] font-semibold disabled:opacity-60">
                Borrar
              </button>
            </div>

            {abierta?.id === p.id && (
              <div className="flex flex-col gap-2 border-t border-border pt-2.5">
                {abierta.detalle.dias.map((d, i) => (
                  <div key={d.dia_semana} className="flex flex-col gap-1">
                    <span className="text-[12.5px] font-semibold">Día {i + 1} <span className="text-text-faint font-normal">({NOMBRE_DIA[d.dia_semana]})</span></span>
                    <ul className="flex flex-col gap-0.5">
                      {d.ejercicios.map((e) => (
                        <li key={e.ejercicio_id} className="text-[12px] text-text-muted flex justify-between gap-2">
                          <span className="truncate">{e.ejercicio_nombre}</span>
                          <span className="tabular flex-none">{e.series} × {e.rango_reps_min}–{e.rango_reps_max} · {e.descanso_segundos}s</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        )))}
      </div>
    </div>
  );
}
