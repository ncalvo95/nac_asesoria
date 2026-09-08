import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api/client.js';

const CAPITALIZAR = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export default function EntrenamientoPage() {
  const { usuario: sesion } = useAuth();
  const { usuarioId: usuarioIdParam } = useParams();
  const usuario = usuarioIdParam ? { id: Number(usuarioIdParam) } : sesion;
  const [rutina, setRutina] = useState(null);
  const [progreso, setProgreso] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  async function cargar({ silencioso = false } = {}) {
    if (!silencioso) setCargando(true);
    try {
      const r = await api.get(`/usuarios/${usuario.id}/rutina`);
      setRutina(r);
      const p = await api.get(`/rutinas/${r.id}/progreso`).catch(() => null);
      setProgreso(p);
    } catch (err) {
      setError(err.message);
    } finally {
      if (!silencioso) setCargando(false);
    }
  }

  // Refetch tras guardar algo: no vuelve a mostrar la pantalla de carga
  // completa (eso desmontaría el formulario y perdería el cartel de "guardado").
  const recargarSilencioso = () => cargar({ silencioso: true });

  useEffect(() => { cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [usuario.id]);

  if (cargando) return <div className="p-6 text-sm text-text-muted">Cargando tu rutina…</div>;
  if (error) return <div className="p-6 text-sm text-danger">{error}</div>;
  if (!rutina) return null;

  const microcicloActual = rutina.microciclos.find((m) => m.estado === 'en_curso');

  if (!microcicloActual) {
    return <div className="p-6 text-sm text-text-muted">No hay un microciclo activo. Avisale a tu coach.</div>;
  }

  if (microcicloActual.numero === 0) {
    return <Semana0Form rutina={rutina} usuario={usuario} onListo={cargar} />;
  }

  return (
    <DiaEntrenamiento
      rutina={rutina}
      microciclo={microcicloActual}
      usuario={usuario}
      progreso={progreso}
      onGuardado={recargarSilencioso}
      onRutinaCambiada={cargar}
    />
  );
}

function Semana0Form({ rutina, usuario, onListo }) {
  const todosEjercicios = useMemo(
    () => rutina.dias.flatMap((d) => d.ejercicios.map((e) => ({ ...e, dia_semana: d.dia_semana }))),
    [rutina]
  );
  const [valores, setValores] = useState(() =>
    Object.fromEntries(todosEjercicios.map((e) => [e.id, { peso: '', reps1: '', reps2: '' }]))
  );
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  function set(id, campo, valor) {
    setValores((v) => ({ ...v, [id]: { ...v[id], [campo]: valor } }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    const resultados = [];
    for (const ej of todosEjercicios) {
      const v = valores[ej.id];
      if (!v.peso || !v.reps1 || !v.reps2) {
        setError(`Completá peso y las 2 series de "${ej.ejercicio_nombre}".`);
        return;
      }
      resultados.push({
        ejercicio_asignado_id: ej.id,
        peso: Number(v.peso),
        reps_serie1: Number(v.reps1),
        reps_serie2: Number(v.reps2),
      });
    }
    setEnviando(true);
    try {
      await api.post(`/rutinas/${rutina.id}/semana0`, { resultados });
      onListo();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  let diaActual = null;
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5 p-4 pb-24">
      <div className="px-1 flex flex-col gap-1">
        <h1 className="text-[17px] font-bold">Semana 0 · Testeo</h1>
        <p className="text-[13px] text-text-muted leading-relaxed">
          Elegí un peso con el que creas poder hacer entre 12 y 16 repeticiones, y cargá 2 series a ese mismo peso por cada ejercicio.
        </p>
      </div>

      {todosEjercicios.map((ej) => {
        const mostrarDia = ej.dia_semana !== diaActual;
        diaActual = ej.dia_semana;
        return (
          <div key={ej.id} className="flex flex-col gap-2">
            {mostrarDia && (
              <span className="text-[11px] font-semibold text-text-faint uppercase tracking-wide mt-1">
                {CAPITALIZAR(ej.dia_semana)}
              </span>
            )}
            <div className="bg-surface border border-border rounded-[14px] p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-semibold">{ej.ejercicio_nombre}</span>
                <span className="text-[11px] font-semibold text-text-muted bg-bg border border-border rounded-md px-2 py-0.5 uppercase">
                  {ej.musculo_nombre}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <NumberField label="Peso (kg)" value={valores[ej.id].peso} onChange={(v) => set(ej.id, 'peso', v)} />
                <NumberField label="Reps S1" value={valores[ej.id].reps1} onChange={(v) => set(ej.id, 'reps1', v)} />
                <NumberField label="Reps S2" value={valores[ej.id].reps2} onChange={(v) => set(ej.id, 'reps2', v)} />
              </div>
            </div>
          </div>
        );
      })}

      {error && <p className="text-[13px] text-danger px-1">{error}</p>}

      <div className="fixed bottom-16 left-0 right-0 p-4 bg-surface border-t border-border">
        <button
          type="submit"
          disabled={enviando}
          className="w-full h-12 rounded-[10px] bg-accent text-accent-fg text-[15px] font-semibold disabled:opacity-60 max-w-md mx-auto block"
        >
          {enviando ? 'Guardando…' : 'Guardar testeo y arrancar semana 1'}
        </button>
      </div>
    </form>
  );
}

function NumberField({ label, value, onChange }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10.5px] font-semibold text-text-faint">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full min-w-0 h-10 rounded-lg border border-border bg-bg px-2.5 tabular text-[14px] outline-none focus:border-accent"
      />
    </label>
  );
}

function DiaEntrenamiento({ rutina, microciclo, usuario, progreso, onGuardado, onRutinaCambiada }) {
  const diasUnicos = useMemo(() => {
    const vistos = new Set();
    return rutina.dias.filter((d) => {
      if (vistos.has(d.dia_semana)) return false;
      vistos.add(d.dia_semana);
      return true;
    });
  }, [rutina]);

  const [diaId, setDiaId] = useState(diasUnicos[0]?.id ?? rutina.dias[0].id);
  const dia = rutina.dias.find((d) => d.id === diaId) ?? rutina.dias[0];

  return (
    <div className="flex flex-col gap-4 p-4 pb-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h1 className="text-[17px] font-bold">{CAPITALIZAR(dia.dia_semana)}</h1>
          <span className="tabular text-[12px] text-text-muted">Microciclo {microciclo.numero}</span>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {diasUnicos.map((d) => (
            <button
              key={d.id}
              onClick={() => setDiaId(d.id)}
              className={`px-3 h-8 rounded-full border text-[12.5px] font-semibold ${
                d.id === dia.id ? 'bg-accent text-accent-fg border-accent' : 'bg-surface border-border text-text-muted'
              }`}
            >
              {CAPITALIZAR(d.dia_semana)}
            </button>
          ))}
        </div>
      </div>

      {/* key={dia.id} fuerza un remount limpio del estado de series al cambiar de dia */}
      <RegistroDia key={dia.id} dia={dia} microciclo={microciclo} usuario={usuario} progreso={progreso} onGuardado={onGuardado} onRutinaCambiada={onRutinaCambiada} />
    </div>
  );
}

function RegistroDia({ dia, microciclo, usuario, progreso, onGuardado, onRutinaCambiada }) {
  const [series, setSeries] = useState(() => construirEstadoInicial(dia));
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [ok, setOk] = useState(false);

  const notasPorEjercicio = useMemo(() => {
    const map = new Map();
    for (const e of progreso?.ejercicios ?? []) map.set(e.id, e);
    return map;
  }, [progreso]);

  function actualizarSerie(ejercicioId, idx, campo, valor) {
    setSeries((prev) => {
      const copia = { ...prev, [ejercicioId]: [...prev[ejercicioId]] };
      copia[ejercicioId][idx] = { ...copia[ejercicioId][idx], [campo]: valor };
      return copia;
    });
  }

  async function guardarSesion() {
    setError('');
    const payload = [];
    for (const ej of dia.ejercicios) {
      for (const [idx, s] of series[ej.id].entries()) {
        if (s.reps === '') {
          setError(`Completá las reps de todas las series de "${ej.ejercicio_nombre}".`);
          return;
        }
        payload.push({
          ejercicio_asignado_id: ej.id,
          numero_serie: idx + 1,
          peso: Number(s.peso),
          reps: Number(s.reps),
          rir: Number(s.rir),
        });
      }
    }
    setEnviando(true);
    try {
      await api.post(`/usuarios/${usuario.id}/sesiones`, {
        dia_rutina_id: dia.id,
        microciclo_id: microciclo.id,
        series: payload,
      });
      setOk(true);
      onGuardado();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  async function saltear() {
    setEnviando(true);
    try {
      await api.post(`/usuarios/${usuario.id}/sesiones`, {
        dia_rutina_id: dia.id,
        microciclo_id: microciclo.id,
        salteada: true,
      });
      setOk(true);
      onGuardado();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      {ok && (
        <div className="bg-success-bg text-success text-[13px] font-semibold rounded-lg px-3 py-2.5">
          Sesión guardada.
        </div>
      )}

      <div className="flex flex-col gap-3">
        {dia.ejercicios.map((ej) => {
          const nota = notasPorEjercicio.get(ej.id);
          return (
            <div key={ej.id} className="bg-surface border border-border rounded-[14px] p-4 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col gap-1">
                  <span className="text-[14.5px] font-semibold">{ej.ejercicio_nombre}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-text-muted bg-bg border border-border rounded-md px-2 py-0.5 uppercase">
                      {ej.musculo_nombre}
                    </span>
                    <span className="text-[12px] text-text-faint">
                      Objetivo {ej.rango_reps_min}–{ej.rango_reps_max} reps
                    </span>
                  </div>
                </div>
                {nota && (
                  <span
                    className={`text-[11px] font-semibold rounded-full px-2.5 py-1 whitespace-nowrap ${
                      nota.mejoro ? 'bg-success-bg text-success' : nota.serie_agregada ? 'bg-warning-bg text-warning' : ''
                    }`}
                  >
                    {nota.mejoro ? 'Mejoró' : nota.serie_agregada ? '+1 serie' : ''}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-[24px_1fr_1fr_1fr] gap-2 text-[10px] font-semibold text-text-faint tracking-wide px-0.5">
                <span>S</span><span>KG</span><span>REPS</span><span>RIR</span>
              </div>
              {series[ej.id].map((s, idx) => (
                <div key={idx} className="grid grid-cols-[24px_1fr_1fr_1fr] gap-2 items-center">
                  <span className="tabular text-[13px] text-text-muted">{idx + 1}</span>
                  <input
                    type="number" inputMode="decimal" value={s.peso}
                    onChange={(e) => actualizarSerie(ej.id, idx, 'peso', e.target.value)}
                    className="w-full min-w-0 h-9 rounded-lg border border-border bg-bg px-2 tabular text-[13.5px] outline-none focus:border-accent"
                  />
                  <input
                    type="number" inputMode="numeric" value={s.reps}
                    onChange={(e) => actualizarSerie(ej.id, idx, 'reps', e.target.value)}
                    className="w-full min-w-0 h-9 rounded-lg border border-border bg-bg px-2 tabular text-[13.5px] outline-none focus:border-accent"
                  />
                  <input
                    type="number" inputMode="numeric" min={0} max={4} value={s.rir}
                    onChange={(e) => actualizarSerie(ej.id, idx, 'rir', e.target.value)}
                    className="w-full min-w-0 h-9 rounded-lg border border-border bg-bg px-2 tabular text-[13.5px] outline-none focus:border-accent"
                  />
                </div>
              ))}

              <EjercicioAcciones ejercicio={ej} usuario={usuario} onCambiado={onRutinaCambiada} />
            </div>
          );
        })}
      </div>

      {error && <p className="text-[13px] text-danger">{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={saltear}
          disabled={enviando}
          className="flex-1 h-11 rounded-[10px] border border-border bg-surface text-text-muted text-[13.5px] font-semibold disabled:opacity-60"
        >
          Saltear sesión
        </button>
        <button
          onClick={guardarSesion}
          disabled={enviando}
          className="flex-[2] h-11 rounded-[10px] bg-accent text-accent-fg text-[14.5px] font-semibold disabled:opacity-60"
        >
          {enviando ? 'Guardando…' : 'Registrar sesión'}
        </button>
      </div>
    </>
  );
}

function EjercicioAcciones({ ejercicio, usuario, onCambiado }) {
  const [linealForzado, setLinealForzado] = useState(Boolean(ejercicio.modo_lineal_forzado));
  const [mostrarSustituir, setMostrarSustituir] = useState(false);

  async function toggleLineal() {
    const nuevo = !linealForzado;
    setLinealForzado(nuevo);
    try {
      await api.patch(`/ejercicios/${ejercicio.id}/lineal-forzado`, { activo: nuevo });
    } catch {
      setLinealForzado(!nuevo);
    }
  }

  return (
    <div className="flex flex-col gap-2 pt-1 border-t border-border -mx-4 px-4">
      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={toggleLineal}
          title="Si lo activás, el peso no baja automáticamente aunque no llegues al mínimo de reps."
          className={`text-[11px] font-medium px-2.5 py-1 rounded-md border ${
            linealForzado ? 'border-accent text-accent bg-bg' : 'border-border text-text-faint bg-transparent'
          }`}
        >
          {linealForzado ? '✓ Lineal forzado' : 'Lineal forzado'}
        </button>
        <button
          type="button"
          onClick={() => setMostrarSustituir((v) => !v)}
          className="text-[11px] font-medium text-text-muted underline underline-offset-2"
        >
          Cambiar ejercicio
        </button>
      </div>
      {mostrarSustituir && (
        <SustituirEjercicio
          ejercicio={ejercicio}
          usuario={usuario}
          onListo={() => { setMostrarSustituir(false); onCambiado(); }}
        />
      )}
    </div>
  );
}

function SustituirEjercicio({ ejercicio, onListo }) {
  const [candidatos, setCandidatos] = useState(null);
  const [elegido, setElegido] = useState('');
  const [peso, setPeso] = useState('');
  const [reps1, setReps1] = useState('');
  const [reps2, setReps2] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    api.get(`/ejercicios/${ejercicio.id}/candidatos`).then(setCandidatos).catch((err) => setError(err.message));
  }, [ejercicio.id]);

  async function confirmar() {
    if (!elegido || peso === '' || reps1 === '' || reps2 === '') {
      setError('Completá el ejercicio nuevo, el peso y las 2 series de testeo.');
      return;
    }
    setEnviando(true);
    setError('');
    try {
      await api.post(`/ejercicios/${ejercicio.id}/sustituir`, {
        nuevo_ejercicio_id: Number(elegido),
        peso: Number(peso),
        reps_serie1: Number(reps1),
        reps_serie2: Number(reps2),
      });
      onListo();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="bg-bg border border-border rounded-xl p-3 flex flex-col gap-2.5">
      <span className="text-[12px] font-semibold">Sustituir por otro ejercicio del mismo músculo</span>
      <p className="text-[11.5px] text-text-muted leading-relaxed">
        Probá un peso con el que puedas hacer entre 12 y 16 reps, y cargá 2 series de testeo — se usa como piso para lo que queda de este microciclo.
      </p>

      {candidatos === null && <span className="text-[12px] text-text-muted">Cargando opciones…</span>}
      {candidatos?.length === 0 && (
        <span className="text-[12px] text-text-muted">No hay alternativas para este músculo con tu equipamiento actual.</span>
      )}
      {candidatos?.length > 0 && (
        <>
          <select
            value={elegido}
            onChange={(e) => setElegido(e.target.value)}
            className="h-9 rounded-lg border border-border bg-surface px-2 text-[13px] outline-none focus:border-accent"
          >
            <option value="">Elegí un ejercicio…</option>
            {candidatos.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
          <div className="grid grid-cols-3 gap-2">
            <NumberField label="Peso (kg)" value={peso} onChange={setPeso} />
            <NumberField label="Reps S1" value={reps1} onChange={setReps1} />
            <NumberField label="Reps S2" value={reps2} onChange={setReps2} />
          </div>
        </>
      )}

      {error && <span className="text-[12px] text-danger">{error}</span>}

      <button
        type="button"
        onClick={confirmar}
        disabled={enviando || !candidatos?.length}
        className="h-9 rounded-lg bg-accent text-accent-fg text-[13px] font-semibold disabled:opacity-60"
      >
        {enviando ? 'Guardando…' : 'Confirmar sustitución'}
      </button>
    </div>
  );
}

function construirEstadoInicial(dia) {
  return Object.fromEntries(
    dia.ejercicios.map((ej) => [
      ej.id,
      Array.from({ length: ej.series_actuales }, () => ({
        peso: ej.peso_actual ?? '',
        reps: '',
        rir: 1,
      })),
    ])
  );
}
