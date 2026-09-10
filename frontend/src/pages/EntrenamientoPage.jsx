import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api, API_BASE } from '../api/client.js';
import AgregarDiaModal from '../components/AgregarDiaModal.jsx';
import QuitarDiaModal from '../components/QuitarDiaModal.jsx';
import { formatearMusculo } from '../utils/musculo.js';

const CAPITALIZAR = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Espejo del repsEfectivas de src/services/progressionEngine.js (mismo
// umbral) para mostrarlo en vivo mientras se carga la serie, sin ida y
// vuelta al backend.
const REPS_EFECTIVAS_UMBRAL = 3;
function repsEfectivas(reps, rir) {
  const r = Number(reps);
  const i = Number(rir);
  if (reps === '' || rir === '' || !Number.isFinite(r) || !Number.isFinite(i)) return null;
  return Math.max(0, Math.min(r, REPS_EFECTIVAS_UMBRAL - i));
}

function ExportarExcel({ rutinaId }) {
  return (
    <a
      href={`${API_BASE}/rutinas/${rutinaId}/export.xlsx`}
      className="text-[12px] font-semibold text-accent border border-accent rounded-lg px-2.5 py-1.5 whitespace-nowrap"
    >
      Exportar Excel
    </a>
  );
}

export default function EntrenamientoPage() {
  const { usuario: sesion } = useAuth();
  const { usuarioId: usuarioIdParam } = useParams();
  const usuario = usuarioIdParam ? { id: Number(usuarioIdParam) } : sesion;
  const [rutina, setRutina] = useState(null);
  const [progreso, setProgreso] = useState(null);
  const [todosMusculos, setTodosMusculos] = useState([]);
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
  // Catalogo completo de musculos (no solo los del dia): permite agregar un
  // ejercicio de un musculo que el dia todavia no entrenaba, por si surge
  // durante el entrenamiento - se carga una sola vez acá y se pasa hacia
  // abajo, en vez de que cada AgregarEjercicioDia lo pida por su cuenta.
  useEffect(() => { api.get('/catalogo/musculos').then(setTodosMusculos).catch(() => {}); }, []);

  if (cargando) return <div className="p-6 text-sm text-text-muted">Cargando tu rutina…</div>;
  if (error) return <div className="p-6 text-sm text-danger">{error}</div>;
  if (!rutina) return null;

  const microcicloActual = rutina.microciclos.find((m) => m.estado === 'en_curso');

  if (!microcicloActual) {
    return <div className="p-6 text-sm text-text-muted">No hay un microciclo activo. Avisale a tu coach.</div>;
  }

  if (microcicloActual.numero === 0) {
    return <Semana0Form rutina={rutina} usuario={usuario} onListo={cargar} todosMusculos={todosMusculos} />;
  }

  return (
    <DiaEntrenamiento
      rutina={rutina}
      microciclo={microcicloActual}
      usuario={usuario}
      progreso={progreso}
      onGuardado={recargarSilencioso}
      onRutinaCambiada={cargar}
      todosMusculos={todosMusculos}
    />
  );
}

const ORDEN_DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];

// Fecha calendario del proximo (o mismo) "dia_semana" a partir de fechaInicio
// (YYYY-MM-DD) - asume que la semana arranca en fechaInicio, sin importar
// que dia de la semana sea.
function fechaParaDia(fechaInicio, diaSemana) {
  if (!fechaInicio) return null;
  const inicio = new Date(`${fechaInicio}T00:00:00`);
  const idxInicio = (inicio.getDay() + 6) % 7; // getDay(): 0=domingo -> lunes=0..domingo=6
  const idxObjetivo = ORDEN_DIAS.indexOf(diaSemana);
  const delta = (idxObjetivo - idxInicio + 7) % 7;
  const fecha = new Date(inicio);
  fecha.setDate(fecha.getDate() + delta);
  return fecha;
}

function formatearFechaCorta(fecha) {
  return fecha.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
}

function Semana0Form({ rutina, usuario, onListo, todosMusculos }) {
  // Estado local mutable de los dias/ejercicios (independiente del prop
  // "rutina", que queda fijo desde que se monta la pantalla) - hace falta
  // porque sustituir un ejercicio antes del testeo cambia que ejercicio va
  // en cada slot, sin recargar toda la pantalla.
  const [dias, setDias] = useState(() => rutina.dias.map((d) => ({ ...d, ejercicios: d.ejercicios.map((e) => ({ ...e })) })));
  const [fechaInicio, setFechaInicio] = useState(rutina.fecha_inicio?.slice(0, 10) || '');
  const [diaId, setDiaId] = useState(dias[0]?.id);

  const todosEjercicios = useMemo(
    () => dias.flatMap((d) => d.ejercicios.map((e) => ({ ...e, dia_semana: d.dia_semana }))),
    [dias]
  );
  const [valores, setValores] = useState(() =>
    Object.fromEntries(todosEjercicios.map((e) => [e.id, { peso: '', reps1: '', reps2: '' }]))
  );
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [guardandoFecha, setGuardandoFecha] = useState(false);

  const diaActual = dias.find((d) => d.id === diaId) ?? dias[0];

  function set(id, campo, valor) {
    setValores((v) => ({ ...v, [id]: { ...v[id], [campo]: valor } }));
  }

  function onSustituido(ejercicioAsignadoId, nuevo) {
    setDias((prev) => prev.map((d) => ({
      ...d,
      ejercicios: d.ejercicios.map((e) => (e.id === ejercicioAsignadoId
        ? { ...e, ejercicio_id: nuevo.id, ejercicio_nombre: nuevo.nombre, rango_reps_min: nuevo.rango_reps_min, rango_reps_max: nuevo.rango_reps_max }
        : e)),
    })));
    setValores((v) => ({ ...v, [ejercicioAsignadoId]: { peso: '', reps1: '', reps2: '' } }));
  }

  function onAgregado(diaId, nuevo, musculoNombre) {
    setDias((prev) => prev.map((d) => (d.id === diaId
      ? { ...d, ejercicios: [...d.ejercicios, { ...nuevo, musculo_nombre: musculoNombre }] }
      : d)));
    setValores((v) => ({ ...v, [nuevo.id]: { peso: '', reps1: '', reps2: '' } }));
  }

  function onQuitado(diaId, ejercicioAsignadoId) {
    setDias((prev) => prev.map((d) => (d.id === diaId
      ? { ...d, ejercicios: d.ejercicios.filter((e) => e.id !== ejercicioAsignadoId) }
      : d)));
    setValores((v) => {
      const copia = { ...v };
      delete copia[ejercicioAsignadoId];
      return copia;
    });
  }

  async function moverEjercicioSemana0(index, delta) {
    const nuevoIndex = index + delta;
    if (nuevoIndex < 0 || nuevoIndex >= diaActual.ejercicios.length) return;
    const copia = [...diaActual.ejercicios];
    [copia[index], copia[nuevoIndex]] = [copia[nuevoIndex], copia[index]];
    setDias((prev) => prev.map((d) => (d.id === diaActual.id ? { ...d, ejercicios: copia } : d)));
    const orden = copia.map((ej, i) => ({ ejercicio_asignado_id: ej.id, orden: i + 1 }));
    try {
      await api.patch(`/dias/${diaActual.id}/orden`, { orden });
    } catch (err) {
      setError(err.message);
    }
  }

  async function onCambiarFecha(nuevaFecha) {
    setFechaInicio(nuevaFecha);
    setGuardandoFecha(true);
    try {
      await api.patch(`/rutinas/${rutina.id}/fecha-inicio`, { fecha_inicio: nuevaFecha });
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardandoFecha(false);
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    const resultados = [];
    for (const ej of todosEjercicios) {
      const v = valores[ej.id];
      if (!v.peso || !v.reps1 || !v.reps2) {
        setError(`Completá peso y las 2 series de "${ej.ejercicio_nombre}" (${CAPITALIZAR(ej.dia_semana)}).`);
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

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 p-4 pb-6 md:max-w-5xl md:mx-auto">
      <div className="px-1 flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-[17px] font-bold">Semana 0 · Testeo</h1>
          <ExportarExcel rutinaId={rutina.id} />
        </div>
        <p className="text-[13px] text-text-muted leading-relaxed">
          Elegí un peso con el que creas poder hacer entre 12 y 16 repeticiones, y cargá 2 series a ese mismo peso por cada ejercicio.
        </p>
      </div>

      <label className="flex items-center gap-2 px-1">
        <span className="text-[12.5px] font-semibold text-text-muted">Empieza el</span>
        <input
          type="date"
          value={fechaInicio}
          onChange={(e) => onCambiarFecha(e.target.value)}
          className="h-9 rounded-lg border border-border bg-surface px-2.5 text-[13px] outline-none focus:border-accent"
        />
        {guardandoFecha && <span className="text-[11px] text-text-faint">Guardando…</span>}
      </label>

      <div className="flex gap-1.5 flex-wrap px-1">
        {dias.map((d) => {
          const fecha = fechaParaDia(fechaInicio, d.dia_semana);
          return (
            <button
              type="button"
              key={d.id}
              onClick={() => setDiaId(d.id)}
              className={`px-3 h-11 rounded-xl border text-[12.5px] font-semibold flex flex-col items-center justify-center leading-tight ${
                d.id === diaActual.id ? 'bg-accent text-accent-fg border-accent' : 'bg-surface border-border text-text-muted'
              }`}
            >
              <span>{CAPITALIZAR(d.dia_semana)}</span>
              {fecha && <span className="text-[10px] font-normal opacity-80">{formatearFechaCorta(fecha)}</span>}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 md:grid md:grid-cols-2 md:items-start md:gap-4">
        {diaActual.ejercicios.map((ej, idx) => (
          <div key={ej.id} className="flex gap-2 items-stretch">
            <div className="flex flex-col justify-center gap-1 flex-none">
              <button
                type="button"
                onClick={() => moverEjercicioSemana0(idx, -1)}
                disabled={idx === 0}
                className="w-7 h-7 rounded-md border border-border bg-surface text-text-muted text-[12px] leading-none disabled:opacity-30"
              >
                ▲
              </button>
              <button
                type="button"
                onClick={() => moverEjercicioSemana0(idx, 1)}
                disabled={idx === diaActual.ejercicios.length - 1}
                className="w-7 h-7 rounded-md border border-border bg-surface text-text-muted text-[12px] leading-none disabled:opacity-30"
              >
                ▼
              </button>
            </div>
            <div className="flex-1 bg-surface border border-border rounded-[14px] p-4 flex flex-col gap-3 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-semibold">{ej.ejercicio_nombre}</span>
                <span className="text-[11px] font-semibold text-text-muted bg-bg border border-border rounded-md px-2 py-0.5 uppercase">
                  {formatearMusculo(ej.musculo_nombre)}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <NumberField label="Peso (kg)" value={valores[ej.id].peso} onChange={(v) => set(ej.id, 'peso', v)} />
                <NumberField label="Reps S1" value={valores[ej.id].reps1} onChange={(v) => set(ej.id, 'reps1', v)} />
                <NumberField label="Reps S2" value={valores[ej.id].reps2} onChange={(v) => set(ej.id, 'reps2', v)} />
              </div>
              <div className="flex items-center justify-between">
                <CambiarEjercicioSemana0 ejercicio={ej} onSustituido={(nuevo) => onSustituido(ej.id, nuevo)} />
                {!ej.es_top_de_musculo && (
                  <QuitarEjercicioBoton ejercicioAsignadoId={ej.id} onQuitado={() => onQuitado(diaActual.id, ej.id)} />
                )}
              </div>
            </div>
          </div>
        ))}

        <AgregarEjercicioDia
          diaRutinaId={diaActual.id}
          musculos={todosMusculos}
          onAgregado={(nuevo, musculoNombre) => onAgregado(diaActual.id, nuevo, musculoNombre)}
        />
      </div>

      {error && <p className="text-[13px] text-danger px-1">{error}</p>}

      <button
        type="submit"
        disabled={enviando}
        className="w-full h-12 rounded-[10px] bg-accent text-accent-fg text-[15px] font-semibold disabled:opacity-60"
      >
        {enviando ? 'Guardando…' : 'Guardar testeo y arrancar semana 1'}
      </button>
    </form>
  );
}

function CambiarEjercicioSemana0({ ejercicio, onSustituido }) {
  const [abierto, setAbierto] = useState(false);
  const [candidatos, setCandidatos] = useState(null);
  const [elegido, setElegido] = useState('');
  const [particular, setParticular] = useState(false);
  const [nombreParticular, setNombreParticular] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  function abrir() {
    setAbierto(true);
    if (candidatos === null) {
      api.get(`/ejercicios/${ejercicio.id}/candidatos`).then(setCandidatos).catch((err) => setError(err.message));
    }
  }

  function cerrar() {
    setAbierto(false);
    setParticular(false);
    setNombreParticular('');
    setElegido('');
  }

  async function confirmar() {
    if (particular ? !nombreParticular.trim() : !elegido) {
      setError(particular ? 'Escribí el nombre del ejercicio.' : 'Elegí un ejercicio.');
      return;
    }
    setEnviando(true);
    setError('');
    try {
      const body = particular
        ? { nombre_personalizado: nombreParticular.trim() }
        : { nuevo_ejercicio_id: Number(elegido) };
      const out = await api.post(`/ejercicios/${ejercicio.id}/sustituir-pre-testeo`, body);
      onSustituido({ id: out.nuevo_ejercicio_id, nombre: out.nuevo_ejercicio_nombre, rango_reps_min: out.rango_reps_min, rango_reps_max: out.rango_reps_max });
      cerrar();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={abrir}
        className="text-[11px] font-medium text-text-muted underline underline-offset-2 self-start"
      >
        Cambiar ejercicio
      </button>
    );
  }

  return (
    <div className="bg-bg border border-border rounded-xl p-3 flex flex-col gap-2.5">
      <span className="text-[12px] font-semibold">Sustituir por otro ejercicio del mismo músculo</span>
      {!particular && candidatos === null && <span className="text-[12px] text-text-muted">Cargando opciones…</span>}
      {!particular && candidatos?.length === 0 && (
        <span className="text-[12px] text-text-muted">No hay alternativas para este músculo con tu equipamiento actual.</span>
      )}
      {!particular && candidatos?.length > 0 && (
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
      )}
      {particular && (
        <input
          value={nombreParticular}
          onChange={(e) => setNombreParticular(e.target.value)}
          placeholder="Nombre del ejercicio particular"
          className="h-9 rounded-lg border border-border bg-surface px-2.5 text-[13px] outline-none focus:border-accent"
        />
      )}
      <button
        type="button"
        onClick={() => { setParticular((v) => !v); setError(''); }}
        className="self-start text-[11.5px] text-text-muted underline underline-offset-2"
      >
        {particular ? '← Elegir del catálogo' : 'No está en la lista, cargar uno particular'}
      </button>
      {error && <span className="text-[12px] text-danger">{error}</span>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={cerrar}
          className="flex-1 h-9 rounded-lg border border-border text-text-muted text-[12.5px] font-semibold"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={confirmar}
          disabled={enviando || (particular ? !nombreParticular.trim() : !candidatos?.length)}
          className="flex-1 h-9 rounded-lg bg-accent text-accent-fg text-[13px] font-semibold disabled:opacity-60"
        >
          {enviando ? 'Guardando…' : 'Confirmar'}
        </button>
      </div>
    </div>
  );
}

// Suma un ejercicio EXTRA a un musculo ya presente ese dia (no reemplaza
// nada) - usa GET /dias/:id/musculos/:id/candidatos + POST /dias/:id/ejercicios.
// Compartido entre Semana0Form (estado local) y RegistroDia (recarga completa).
function AgregarEjercicioDia({ diaRutinaId, musculos, onAgregado }) {
  const [abierto, setAbierto] = useState(false);
  const [musculoId, setMusculoId] = useState(musculos.length === 1 ? musculos[0].id : '');
  const [candidatos, setCandidatos] = useState(null);
  const [elegido, setElegido] = useState('');
  const [particular, setParticular] = useState(false);
  const [nombreParticular, setNombreParticular] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  function cargarCandidatos(id) {
    setMusculoId(id);
    setCandidatos(null);
    setElegido('');
    setError('');
    api.get(`/dias/${diaRutinaId}/musculos/${id}/candidatos`).then(setCandidatos).catch((err) => setError(err.message));
  }

  function abrir() {
    setAbierto(true);
    setError('');
    if (musculos.length === 1) cargarCandidatos(musculos[0].id);
  }

  function cerrar() {
    setAbierto(false);
    setParticular(false);
    setNombreParticular('');
  }

  async function confirmar() {
    if (!musculoId || (particular ? !nombreParticular.trim() : !elegido)) {
      setError(particular ? 'Elegí un músculo y escribí el nombre del ejercicio.' : 'Elegí un músculo y un ejercicio.');
      return;
    }
    setEnviando(true);
    setError('');
    try {
      const body = particular
        ? { musculo_id: Number(musculoId), nombre_personalizado: nombreParticular.trim() }
        : { musculo_id: Number(musculoId), ejercicio_id: Number(elegido) };
      const nuevo = await api.post(`/dias/${diaRutinaId}/ejercicios`, body);
      const musculoNombre = musculos.find((m) => m.id === Number(musculoId))?.nombre;
      onAgregado(nuevo, musculoNombre);
      cerrar();
      setMusculoId(musculos.length === 1 ? musculos[0].id : '');
      setCandidatos(null);
      setElegido('');
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={abrir}
        className="self-start text-[12.5px] font-semibold text-accent underline underline-offset-2 px-1"
      >
        + Agregar ejercicio
      </button>
    );
  }

  return (
    <div className="bg-surface border border-dashed border-border rounded-xl p-3.5 flex flex-col gap-2.5">
      <span className="text-[12px] font-semibold">Agregar un ejercicio extra a este día</span>

      {musculos.length > 1 && (
        <div className="flex gap-1.5 flex-wrap">
          {musculos.map((m) => (
            <button
              type="button"
              key={m.id}
              onClick={() => cargarCandidatos(m.id)}
              className={`px-2.5 h-8 rounded-full border text-[12px] font-medium capitalize ${
                Number(musculoId) === m.id ? 'bg-accent text-accent-fg border-accent' : 'bg-bg border-border text-text-muted'
              }`}
            >
              {formatearMusculo(m.nombre)}
            </button>
          ))}
        </div>
      )}

      {!particular && musculoId && candidatos === null && <span className="text-[12px] text-text-muted">Cargando opciones…</span>}
      {!particular && musculoId && candidatos?.length === 0 && (
        <span className="text-[12px] text-text-muted">No hay más ejercicios para ese músculo con tu equipamiento actual.</span>
      )}
      {!particular && musculoId && candidatos?.length > 0 && (
        <select
          value={elegido}
          onChange={(e) => setElegido(e.target.value)}
          className="h-9 rounded-lg border border-border bg-bg px-2 text-[13px] outline-none focus:border-accent"
        >
          <option value="">Elegí un ejercicio…</option>
          {candidatos.map((c) => (
            <option key={c.id} value={c.id}>{c.nombre}</option>
          ))}
        </select>
      )}

      {particular && musculoId && (
        <input
          value={nombreParticular}
          onChange={(e) => setNombreParticular(e.target.value)}
          placeholder="Nombre del ejercicio particular"
          className="h-9 rounded-lg border border-border bg-bg px-2.5 text-[13px] outline-none focus:border-accent"
        />
      )}

      {musculoId && (
        <button
          type="button"
          onClick={() => { setParticular((v) => !v); setError(''); }}
          className="self-start text-[11.5px] text-text-muted underline underline-offset-2"
        >
          {particular ? '← Elegir del catálogo' : 'No está en la lista, cargar uno particular'}
        </button>
      )}

      {error && <span className="text-[12px] text-danger">{error}</span>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={cerrar}
          className="flex-1 h-9 rounded-lg border border-border text-text-muted text-[12.5px] font-semibold"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={confirmar}
          disabled={enviando || (particular ? !nombreParticular.trim() : !elegido)}
          className="flex-1 h-9 rounded-lg bg-accent text-accent-fg text-[13px] font-semibold disabled:opacity-60"
        >
          {enviando ? 'Agregando…' : 'Agregar'}
        </button>
      </div>
    </div>
  );
}

function QuitarEjercicioBoton({ ejercicioAsignadoId, onQuitado }) {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  async function quitar() {
    setEnviando(true);
    setError('');
    try {
      await api.del(`/ejercicios-asignados/${ejercicioAsignadoId}`);
      onQuitado();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      <button
        type="button"
        onClick={quitar}
        disabled={enviando}
        className="text-[11px] font-medium text-danger underline underline-offset-2 disabled:opacity-60"
      >
        {enviando ? 'Quitando…' : 'Quitar'}
      </button>
      {error && <span className="text-[11px] text-danger">{error}</span>}
    </div>
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

function DiaEntrenamiento({ rutina, microciclo, usuario, progreso, onGuardado, onRutinaCambiada, todosMusculos }) {
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
  const [mostrarAgregarDia, setMostrarAgregarDia] = useState(false);
  const [mostrarQuitarDia, setMostrarQuitarDia] = useState(false);

  return (
    <div className="flex flex-col gap-4 p-4 pb-6 md:max-w-5xl md:mx-auto">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h1 className="text-[17px] font-bold">{CAPITALIZAR(dia.dia_semana)}</h1>
            <span className="tabular text-[12px] text-text-muted">Microciclo {microciclo.numero}</span>
          </div>
          <ExportarExcel rutinaId={rutina.id} />
        </div>
        <div className="flex items-center justify-between gap-2 flex-wrap">
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
            <button
              type="button"
              onClick={() => setMostrarAgregarDia(true)}
              className="px-3 h-8 rounded-full border border-dashed border-border text-[12.5px] font-semibold text-text-muted"
            >
              + Agregar día
            </button>
          </div>
          <div className="flex items-center gap-3">
            <ComentarioBoton
              endpoint={`/dias/${dia.id}/comentario`}
              comentarioActual={dia.comentario}
              recordarActual={dia.comentario_recordar}
              onGuardado={onRutinaCambiada}
              etiqueta="Comentario del día"
            />
            <button
              type="button"
              onClick={() => setMostrarQuitarDia(true)}
              className="text-[11.5px] font-medium text-danger underline underline-offset-2"
            >
              Quitar {CAPITALIZAR(dia.dia_semana)}
            </button>
          </div>
        </div>
        {Boolean(dia.comentario_recordar && dia.comentario) && (
          <ComentarioRecordatorio comentario={dia.comentario} />
        )}
      </div>

      {/* key={dia.id} fuerza un remount limpio del estado de series al cambiar de dia */}
      <RegistroDia
        key={dia.id}
        dia={dia}
        microciclo={microciclo}
        usuario={usuario}
        progreso={progreso}
        onGuardado={onGuardado}
        onRutinaCambiada={onRutinaCambiada}
        todosMusculos={todosMusculos}
        diasHermanos={diasUnicos.filter((d) => d.id !== dia.id)}
      />

      {mostrarAgregarDia && (
        <AgregarDiaModal
          usuarioId={usuario.id}
          diasActivos={diasUnicos.map((d) => d.dia_semana)}
          onClose={() => setMostrarAgregarDia(false)}
          onCreado={() => { setMostrarAgregarDia(false); onRutinaCambiada(); }}
        />
      )}
      {mostrarQuitarDia && (
        <QuitarDiaModal
          diaRutinaId={dia.id}
          diaSemana={dia.dia_semana}
          onClose={() => setMostrarQuitarDia(false)}
          onQuitado={() => { setMostrarQuitarDia(false); onRutinaCambiada(); }}
        />
      )}
    </div>
  );
}

function RegistroDia({ dia, microciclo, usuario, progreso, onGuardado, onRutinaCambiada, todosMusculos, diasHermanos }) {
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

  async function moverEjercicio(index, delta) {
    const nuevoIndex = index + delta;
    if (nuevoIndex < 0 || nuevoIndex >= dia.ejercicios.length) return;
    const copia = [...dia.ejercicios];
    [copia[index], copia[nuevoIndex]] = [copia[nuevoIndex], copia[index]];
    const orden = copia.map((ej, i) => ({ ejercicio_asignado_id: ej.id, orden: i + 1 }));
    try {
      await api.patch(`/dias/${dia.id}/orden`, { orden });
      onRutinaCambiada();
    } catch (err) {
      setError(err.message);
    }
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

      <div className="flex flex-col gap-3 md:grid md:grid-cols-2 md:items-start md:gap-4">
        {dia.ejercicios.map((ej, idx) => {
          const nota = notasPorEjercicio.get(ej.id);
          return (
            <div key={ej.id} className="flex gap-2 items-stretch">
              <div className="flex flex-col justify-center gap-1 flex-none">
                <button
                  type="button"
                  onClick={() => moverEjercicio(idx, -1)}
                  disabled={idx === 0}
                  className="w-7 h-7 rounded-md border border-border bg-surface text-text-muted text-[12px] leading-none disabled:opacity-30"
                >
                  ▲
                </button>
                <button
                  type="button"
                  onClick={() => moverEjercicio(idx, 1)}
                  disabled={idx === dia.ejercicios.length - 1}
                  className="w-7 h-7 rounded-md border border-border bg-surface text-text-muted text-[12px] leading-none disabled:opacity-30"
                >
                  ▼
                </button>
              </div>
              <div className="flex-1 bg-surface border border-border rounded-[14px] p-4 flex flex-col gap-3 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col gap-1">
                  <span className="text-[14.5px] font-semibold">{ej.ejercicio_nombre}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-text-muted bg-bg border border-border rounded-md px-2 py-0.5 uppercase">
                      {formatearMusculo(ej.musculo_nombre)}
                    </span>
                    <span className="text-[12px] text-text-faint">
                      Objetivo {ej.rango_reps_min}–{ej.rango_reps_max} reps · Descanso {ej.descanso_segundos}s
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

              {Boolean(ej.comentario_recordar && ej.comentario) && (
                <ComentarioRecordatorio comentario={ej.comentario} />
              )}

              <div className="grid grid-cols-[24px_1fr_1fr_1fr_34px] gap-2 text-[10px] font-semibold text-text-faint tracking-wide px-0.5">
                <span>S</span><span>KG</span><span>REPS</span><span>RIR</span><span title="Reps efectivas">EF</span>
              </div>
              {series[ej.id].map((s, idx) => {
                const efectivas = repsEfectivas(s.reps, s.rir);
                return (
                  <div key={idx} className="grid grid-cols-[24px_1fr_1fr_1fr_34px] gap-2 items-center">
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
                    <span className="tabular text-[12.5px] text-text-faint text-center">{efectivas ?? '—'}</span>
                  </div>
                );
              })}
              <span className="tabular text-[11px] text-text-faint -mt-1">
                {series[ej.id].reduce((acc, s) => acc + (repsEfectivas(s.reps, s.rir) || 0), 0)} reps efectivas en total
              </span>

              <EjercicioAcciones ejercicio={ej} usuario={usuario} onCambiado={onRutinaCambiada} diasHermanos={diasHermanos} />
              </div>
            </div>
          );
        })}

        <AgregarEjercicioDia diaRutinaId={dia.id} musculos={todosMusculos} onAgregado={onRutinaCambiada} />
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

function EjercicioAcciones({ ejercicio, usuario, onCambiado, diasHermanos }) {
  const [linealForzado, setLinealForzado] = useState(Boolean(ejercicio.modo_lineal_forzado));
  const [mostrarSustituir, setMostrarSustituir] = useState(false);
  const [mostrarPeso, setMostrarPeso] = useState(false);
  const [mostrarDescanso, setMostrarDescanso] = useState(false);
  const [mostrarMoverCopiar, setMostrarMoverCopiar] = useState(false);
  const [error, setError] = useState('');

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
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMostrarSustituir((v) => !v)}
            className="text-[11px] font-medium text-text-muted underline underline-offset-2"
          >
            Cambiar ejercicio
          </button>
          {!ejercicio.es_top_de_musculo && (
            <QuitarEjercicioBoton ejercicioAsignadoId={ejercicio.id} onQuitado={onCambiado} />
          )}
        </div>
      </div>

      <AjusteSeries ejercicioId={ejercicio.id} seriesActuales={ejercicio.series_actuales} onAjustado={onCambiado} onError={setError} />

      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => setMostrarPeso((v) => !v)}
            className="self-start text-[11px] font-medium text-text-muted underline underline-offset-2"
          >
            Ajustar peso base
          </button>
          {mostrarPeso && (
            <AjustePeso
              ejercicioId={ejercicio.id}
              pesoActual={ejercicio.peso_actual}
              onAjustado={() => { setMostrarPeso(false); onCambiado(); }}
            />
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => setMostrarDescanso((v) => !v)}
            className="self-start text-[11px] font-medium text-text-muted underline underline-offset-2"
          >
            Ajustar descanso
          </button>
          {mostrarDescanso && (
            <AjusteDescanso
              ejercicioId={ejercicio.id}
              descansoSegundos={ejercicio.descanso_segundos}
              onAjustado={() => { setMostrarDescanso(false); onCambiado(); }}
            />
          )}
        </div>

        {diasHermanos?.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => setMostrarMoverCopiar((v) => !v)}
              className="self-start text-[11px] font-medium text-text-muted underline underline-offset-2"
            >
              Mover / copiar a otro día
            </button>
            {mostrarMoverCopiar && (
              <MoverCopiarEjercicio
                ejercicioId={ejercicio.id}
                diasHermanos={diasHermanos}
                onListo={() => { setMostrarMoverCopiar(false); onCambiado(); }}
                onError={setError}
              />
            )}
          </div>
        )}

        <ComentarioBoton
          endpoint={`/ejercicios/${ejercicio.id}/comentario`}
          comentarioActual={ejercicio.comentario}
          recordarActual={ejercicio.comentario_recordar}
          onGuardado={onCambiado}
        />
      </div>

      {error && <span className="text-[11px] text-danger">{error}</span>}

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

// Sumar/restar una serie a mano, sin esperar al cierre de microciclo - el
// backend valida el piso (SERIES_MINIMO) y el tope segun objetivo/ejercicio.
function AjusteSeries({ ejercicioId, seriesActuales, onAjustado, onError }) {
  const [enviando, setEnviando] = useState(false);

  async function ajustar(delta) {
    setEnviando(true);
    onError('');
    try {
      await api.patch(`/ejercicios/${ejercicioId}/series`, { delta });
      onAjustado();
    } catch (err) {
      onError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-text-faint">Series</span>
      <button
        type="button"
        onClick={() => ajustar(-1)}
        disabled={enviando}
        className="w-7 h-7 rounded-md border border-border bg-surface text-text-muted text-[13px] leading-none disabled:opacity-40"
      >
        −
      </button>
      <span className="tabular text-[13px] font-semibold w-4 text-center">{seriesActuales}</span>
      <button
        type="button"
        onClick={() => ajustar(1)}
        disabled={enviando}
        className="w-7 h-7 rounded-md border border-border bg-surface text-text-muted text-[13px] leading-none disabled:opacity-40"
      >
        +
      </button>
    </div>
  );
}

// Cambiar el peso base (el que se precarga la proxima sesion) sin depender
// del modo lineal forzado ni esperar al cierre de microciclo.
function AjustePeso({ ejercicioId, pesoActual, onAjustado }) {
  const [peso, setPeso] = useState(pesoActual ?? '');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function confirmar() {
    const valor = Number(peso);
    if (!peso || !Number.isFinite(valor) || valor <= 0) {
      setError('Ingresá un peso válido.');
      return;
    }
    setEnviando(true);
    setError('');
    try {
      await api.patch(`/ejercicios/${ejercicioId}/peso`, { peso: valor });
      onAjustado();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="number" inputMode="decimal" value={peso}
        onChange={(e) => setPeso(e.target.value)}
        className="w-20 h-8 rounded-md border border-border bg-bg px-2 tabular text-[13px] outline-none focus:border-accent"
      />
      <button
        type="button"
        onClick={confirmar}
        disabled={enviando}
        className="h-8 px-3 rounded-md bg-accent text-accent-fg text-[12px] font-semibold disabled:opacity-60"
      >
        {enviando ? 'Guardando…' : 'Guardar'}
      </button>
      {error && <span className="text-[11px] text-danger">{error}</span>}
    </div>
  );
}

// Descanso entre series, en segundos - solo informativo (no lo toca el
// motor de progresion), para que el usuario sepa cuanto descansar.
function AjusteDescanso({ ejercicioId, descansoSegundos, onAjustado }) {
  const [descanso, setDescanso] = useState(descansoSegundos ?? 90);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function confirmar() {
    const valor = Number(descanso);
    if (!Number.isInteger(valor) || valor < 10 || valor > 600) {
      setError('Ingresá un descanso entre 10 y 600 segundos.');
      return;
    }
    setEnviando(true);
    setError('');
    try {
      await api.patch(`/ejercicios/${ejercicioId}/descanso`, { descanso_segundos: valor });
      onAjustado();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="number" inputMode="numeric" step={5} min={10} max={600} value={descanso}
        onChange={(e) => setDescanso(e.target.value)}
        className="w-20 h-8 rounded-md border border-border bg-bg px-2 tabular text-[13px] outline-none focus:border-accent"
      />
      <span className="text-[11px] text-text-faint">segundos</span>
      <button
        type="button"
        onClick={confirmar}
        disabled={enviando}
        className="h-8 px-3 rounded-md bg-accent text-accent-fg text-[12px] font-semibold disabled:opacity-60"
      >
        {enviando ? 'Guardando…' : 'Guardar'}
      </button>
      {error && <span className="text-[11px] text-danger">{error}</span>}
    </div>
  );
}

// Mueve (conserva peso/series, solo cambia de dia) o copia (queda una
// instancia nueva a testear) un ejercicio ya asignado a otro dia de la
// misma rutina - por si durante el entrenamiento se decide que queda mejor
// en otro dia, o que conviene repetirlo en dos.
function MoverCopiarEjercicio({ ejercicioId, diasHermanos, onListo, onError }) {
  const [modo, setModo] = useState('mover');
  const [enviando, setEnviando] = useState(null);

  async function elegirDia(diaRutinaId) {
    setEnviando(diaRutinaId);
    onError('');
    try {
      await api.post(`/ejercicios/${ejercicioId}/${modo === 'mover' ? 'mover' : 'copiar'}`, { dia_rutina_id: diaRutinaId });
      onListo();
    } catch (err) {
      onError(err.message);
    } finally {
      setEnviando(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1.5">
        {[{ id: 'mover', label: 'Mover' }, { id: 'copiar', label: 'Copiar' }].map((m) => (
          <button
            type="button"
            key={m.id}
            onClick={() => setModo(m.id)}
            className={`px-2.5 h-7 rounded-full border text-[11.5px] font-medium ${
              modo === m.id ? 'bg-accent text-accent-fg border-accent' : 'bg-bg border-border text-text-muted'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {diasHermanos.map((d) => (
          <button
            type="button"
            key={d.id}
            disabled={enviando !== null}
            onClick={() => elegirDia(d.id)}
            className="px-2.5 h-7 rounded-full border border-border bg-bg text-text-muted text-[11.5px] font-medium capitalize disabled:opacity-60"
          >
            {enviando === d.id ? 'Guardando…' : CAPITALIZAR(d.dia_semana)}
          </button>
        ))}
      </div>
    </div>
  );
}

// Nota destacada cuando el comentario tiene "recordarme" activado - se
// muestra sola, sin que haga falta abrir el formulario de comentario, la
// proxima vez que se entra a esta pantalla (ver comentario_recordar en
// dia_rutina/ejercicio_asignado).
function ComentarioRecordatorio({ comentario }) {
  return (
    <div className="bg-warning-bg text-warning text-[12.5px] leading-relaxed rounded-lg px-3 py-2 border-l-2 border-warning">
      {comentario}
    </div>
  );
}

// Comentario libre (dia o ejercicio, segun el endpoint que reciba) con un
// tilde "recordarme" - si esta tildado, ComentarioRecordatorio lo muestra
// destacado la proxima vez que se abra esta pantalla, sin necesidad de
// tocar nada.
function ComentarioBoton({ endpoint, comentarioActual, recordarActual, onGuardado, etiqueta }) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState(comentarioActual || '');
  const [recordar, setRecordar] = useState(Boolean(recordarActual));
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  async function guardar() {
    setEnviando(true);
    setError('');
    try {
      await api.patch(endpoint, { comentario: texto.trim() || null, recordar });
      setAbierto(false);
      onGuardado();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="self-start text-[11px] font-medium text-text-muted underline underline-offset-2"
      >
        {comentarioActual ? 'Editar comentario' : (etiqueta || 'Comentario')}
      </button>
      {abierto && (
        <div className="flex flex-col gap-2 bg-bg border border-border rounded-lg p-2.5 min-w-[220px]">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={3}
            placeholder="Escribí un comentario…"
            className="w-full rounded-md border border-border bg-surface px-2.5 py-2 text-[13px] outline-none focus:border-accent resize-none"
          />
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={recordar}
              onChange={(e) => setRecordar(e.target.checked)}
              className="w-4 h-4 accent-accent"
            />
            <span className="text-[12px] text-text-muted">Recordarme en la próxima actualización de entrenamiento</span>
          </label>
          {error && <span className="text-[11px] text-danger">{error}</span>}
          <button
            type="button"
            onClick={guardar}
            disabled={enviando}
            className="self-start h-8 px-3 rounded-md bg-accent text-accent-fg text-[12px] font-semibold disabled:opacity-60"
          >
            {enviando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      )}
    </div>
  );
}

function SustituirEjercicio({ ejercicio, onListo }) {
  const [candidatos, setCandidatos] = useState(null);
  const [elegido, setElegido] = useState('');
  const [particular, setParticular] = useState(false);
  const [nombreParticular, setNombreParticular] = useState('');
  const [peso, setPeso] = useState('');
  const [reps1, setReps1] = useState('');
  const [reps2, setReps2] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    api.get(`/ejercicios/${ejercicio.id}/candidatos`).then(setCandidatos).catch((err) => setError(err.message));
  }, [ejercicio.id]);

  async function confirmar() {
    const faltaEjercicio = particular ? !nombreParticular.trim() : !elegido;
    if (faltaEjercicio || peso === '' || reps1 === '' || reps2 === '') {
      setError('Completá el ejercicio nuevo, el peso y las 2 series de testeo.');
      return;
    }
    setEnviando(true);
    setError('');
    try {
      await api.post(`/ejercicios/${ejercicio.id}/sustituir`, {
        nuevo_ejercicio_id: particular ? undefined : Number(elegido),
        nombre_personalizado: particular ? nombreParticular.trim() : undefined,
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

      {!particular && candidatos === null && <span className="text-[12px] text-text-muted">Cargando opciones…</span>}
      {!particular && candidatos?.length === 0 && (
        <span className="text-[12px] text-text-muted">No hay alternativas para este músculo con tu equipamiento actual.</span>
      )}
      {!particular && candidatos?.length > 0 && (
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
      )}
      {particular && (
        <input
          value={nombreParticular}
          onChange={(e) => setNombreParticular(e.target.value)}
          placeholder="Nombre del ejercicio particular"
          className="h-9 rounded-lg border border-border bg-surface px-2.5 text-[13px] outline-none focus:border-accent"
        />
      )}
      <button
        type="button"
        onClick={() => { setParticular((v) => !v); setError(''); }}
        className="self-start text-[11.5px] text-text-muted underline underline-offset-2"
      >
        {particular ? '← Elegir del catálogo' : 'No está en la lista, cargar uno particular'}
      </button>

      <div className="grid grid-cols-3 gap-2">
        <NumberField label="Peso (kg)" value={peso} onChange={setPeso} />
        <NumberField label="Reps S1" value={reps1} onChange={setReps1} />
        <NumberField label="Reps S2" value={reps2} onChange={setReps2} />
      </div>

      {error && <span className="text-[12px] text-danger">{error}</span>}

      <button
        type="button"
        onClick={confirmar}
        disabled={enviando || (particular ? !nombreParticular.trim() : !candidatos?.length)}
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
