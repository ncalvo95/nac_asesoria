import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { formatearMusculo } from '../utils/musculo.js';
import ArmadoManualRutina from '../components/ArmadoManualRutina.jsx';

const NOMBRE_DIA = { lunes: 'Lunes', martes: 'Martes', miercoles: 'Miércoles', jueves: 'Jueves', viernes: 'Viernes', sabado: 'Sábado', domingo: 'Domingo' };

// Plantillas de rutina del coach: ver, renombrar y borrar. Se crean desde la
// rutina de un alumno ("Guardar como plantilla") y se aplican desde Rutinas.
// Arma una plantilla eligiendo días y ejercicios del catálogo, sin partir de la
// rutina de un alumno. Series, reps y descanso arrancan con los valores
// estándar (se ajustan en la rutina de cada alumno).
function NuevaPlantilla({ onCancelar, onCreada }) {
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [dias, setDias] = useState([]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  const incompleto = !nombre.trim() || dias.length === 0 || dias.some((d) => d.ejercicios.length === 0);

  async function guardar() {
    setEnviando(true);
    setError('');
    try {
      await api.post('/plantillas/desde-cero', {
        nombre,
        descripcion,
        dias: dias.map((d) => ({ dia_semana: d.dia_semana, ejercicios: d.ejercicios.map((e) => e.id) })),
      });
      await onCreada();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="bg-surface border border-accent rounded-[14px] p-4 flex flex-col gap-3">
      <span className="text-[14px] font-semibold">Nueva plantilla</span>
      <label className="flex flex-col gap-1 text-[12.5px] font-semibold">
        Nombre
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          maxLength={80}
          className="h-10 rounded-lg border border-border bg-bg px-3 text-[14px] font-normal outline-none focus:border-accent"
        />
      </label>
      <label className="flex flex-col gap-1 text-[12.5px] font-semibold">
        Descripción (opcional)
        <textarea
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          maxLength={300}
          rows={2}
          className="rounded-lg border border-border bg-bg px-3 py-2 text-[13.5px] font-normal outline-none focus:border-accent"
        />
      </label>
      <span className="text-[12.5px] font-semibold">Días y ejercicios</span>
      <ArmadoManualRutina dias={dias} onChange={setDias} />
      <p className="text-[11.5px] text-text-faint leading-relaxed">
        Cada ejercicio arranca con las series mínimas, el rango de reps estándar y su descanso habitual; los pesos se sacan en la Semana 0 de cada alumno.
        Los días de la semana son solo una referencia: al aplicarla podés elegir otros.
      </p>
      {error && <p className="text-[12.5px] text-danger">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onCancelar} disabled={enviando} className="flex-1 h-10 rounded-lg border border-border bg-bg text-text-muted text-[13px] font-semibold">
          Cancelar
        </button>
        <button
          type="button"
          onClick={guardar}
          disabled={enviando || incompleto}
          className="flex-[2] h-10 rounded-lg bg-accent text-accent-fg text-[13px] font-semibold disabled:opacity-60"
        >
          {enviando ? 'Guardando…' : 'Guardar plantilla'}
        </button>
      </div>
    </div>
  );
}

export default function PlantillasPage() {
  const [plantillas, setPlantillas] = useState(null);
  const [error, setError] = useState('');
  const [abierta, setAbierta] = useState(null); // { id, detalle }
  const [editando, setEditando] = useState(null); // { id, nombre, descripcion }
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

  async function guardarEdicion() {
    setOcupada(editando.id);
    setError('');
    try {
      await api.patch(`/plantillas/${editando.id}`, { nombre: editando.nombre, descripcion: editando.descripcion });
      setEditando(null);
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setOcupada(null);
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
          <NuevaPlantilla
            onCancelar={() => setCreando(false)}
            onCreada={async () => { setCreando(false); await cargar(); }}
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

        {plantillas?.map((p) => (
          <div key={p.id} className="bg-surface border border-border rounded-[14px] p-4 flex flex-col gap-2.5">
            {editando?.id === p.id ? (
              <div className="flex flex-col gap-2">
                <input
                  value={editando.nombre}
                  onChange={(e) => setEditando({ ...editando, nombre: e.target.value })}
                  maxLength={80}
                  aria-label="Nombre de la plantilla"
                  className="h-9 rounded-md border border-border bg-bg px-2 text-[14px] outline-none focus:border-accent"
                />
                <textarea
                  value={editando.descripcion ?? ''}
                  onChange={(e) => setEditando({ ...editando, descripcion: e.target.value })}
                  maxLength={300}
                  rows={2}
                  aria-label="Descripción"
                  className="rounded-md border border-border bg-bg px-2 py-1.5 text-[13px] outline-none focus:border-accent"
                />
                <div className="flex gap-2">
                  <button type="button" onClick={() => setEditando(null)} className="h-8 px-3 rounded-lg border border-border text-text-muted text-[12.5px] font-semibold">Cancelar</button>
                  <button type="button" onClick={guardarEdicion} disabled={ocupada === p.id || !editando.nombre.trim()} className="h-8 px-3 rounded-lg bg-accent text-accent-fg text-[12.5px] font-semibold disabled:opacity-60">Guardar</button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-0.5">
                <span className="text-[14.5px] font-semibold">{p.nombre}</span>
                {p.descripcion && <span className="text-[12.5px] text-text-muted">{p.descripcion}</span>}
                <span className="text-[12px] text-text-faint">{p.cantidad_dias} días · {p.cantidad_ejercicios} ejercicios</span>
              </div>
            )}

            <div className="flex flex-wrap gap-1">
              {p.musculos.map((m) => (
                <span key={m} className="text-[10.5px] font-semibold text-text-muted bg-bg border border-border rounded-md px-1.5 py-0.5 uppercase">{formatearMusculo(m)}</span>
              ))}
            </div>

            <div className="flex gap-2 flex-wrap">
              <button type="button" onClick={() => alternarDetalle(p.id)} className="h-8 px-3 rounded-lg border border-border bg-bg text-text-muted text-[12.5px] font-semibold">
                {abierta?.id === p.id ? 'Ocultar detalle' : 'Ver detalle'}
              </button>
              {editando?.id !== p.id && (
                <button type="button" onClick={() => setEditando({ id: p.id, nombre: p.nombre, descripcion: p.descripcion })} className="h-8 px-3 rounded-lg border border-border bg-bg text-text-muted text-[12.5px] font-semibold">
                  Editar nombre
                </button>
              )}
              <button type="button" onClick={() => borrar(p)} disabled={ocupada === p.id} className="h-8 px-3 rounded-lg border border-danger text-danger text-[12.5px] font-semibold disabled:opacity-60">
                Borrar
              </button>
            </div>

            {abierta?.id === p.id && (
              <div className="flex flex-col gap-2 border-t border-border pt-2.5">
                {abierta.detalle.dias.map((d, i) => (
                  <div key={d.dia_semana} className="flex flex-col gap-1">
                    <span className="text-[12.5px] font-semibold">Día {i + 1} <span className="text-text-faint font-normal">(originalmente {NOMBRE_DIA[d.dia_semana]})</span></span>
                    <ul className="flex flex-col gap-0.5">
                      {d.ejercicios.map((e) => (
                        <li key={e.ejercicio_id} className="text-[12px] text-text-muted flex justify-between gap-2">
                          <span className="truncate">{e.ejercicio_nombre}</span>
                          <span className="tabular flex-none">{e.series} × {e.rango_reps_min}–{e.rango_reps_max}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
