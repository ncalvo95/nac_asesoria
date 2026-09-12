import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api, API_BASE } from '../api/client.js';
import AgregarDiaModal from '../components/AgregarDiaModal.jsx';
import QuitarDiaModal from '../components/QuitarDiaModal.jsx';
import CambiarDiaModal from '../components/CambiarDiaModal.jsx';
import { formatearMusculo } from '../utils/musculo.js';

const CAPITALIZAR = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Borrador en localStorage para lo que se va tipeando en Semana 0 y en el
// registro del dia - antes solo vivia en estado de React, asi que si el
// celular mataba la pestaña (se fue a background, se quedo sin memoria,
// se cerro el navegador) a mitad de un entrenamiento, todo lo cargado se
// perdia sin ningun aviso. Guardar cada cambio a medida que se escribe
// permite recuperarlo al volver a abrir la app, hasta que se confirma el
// guardado real contra el backend (momento en el que se borra el borrador).
function leerBorrador(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function guardarBorrador(key, valor) {
  try {
    localStorage.setItem(key, JSON.stringify(valor));
  } catch {
    // localStorage no disponible (privado, cuota, etc.) - sin borrador, pero no rompe nada.
  }
}
function borrarBorrador(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // idem arriba
  }
}

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

  if (microcicloActual.tipo === 'testeo') {
    return <Semana0Form rutina={rutina} usuario={usuario} microciclo={microcicloActual} onListo={cargar} todosMusculos={todosMusculos} />;
  }

  return (
    <DiaEntrenamiento
      rutina={rutina}
      microciclo={microcicloActual}
      usuario={usuario}
      progreso={progreso}
      onGuardado={recargarSilencioso}
      onRutinaCambiada={recargarSilencioso}
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

function Semana0Form({ rutina, usuario, microciclo, onListo, todosMusculos }) {
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
  const borradorKey = `nac_borrador_semana0_${rutina.id}`;
  const [valores, setValores] = useState(() => {
    const borrador = leerBorrador(borradorKey) || {};
    return Object.fromEntries(
      todosEjercicios.map((e) => [e.id, borrador[e.id] || { peso: '', reps1: '', reps2: '' }])
    );
  });
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [guardandoFecha, setGuardandoFecha] = useState(false);

  useEffect(() => { guardarBorrador(borradorKey, valores); }, [borradorKey, valores]);

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
    // El peso y la serie de referencia ya se cargaron al agregar el
    // ejercicio (ver AgregarEjercicioDia) - se precargan ambas series de
    // este testeo con ese mismo valor, editable si hace falta.
    setValores((v) => ({
      ...v,
      [nuevo.id]: { peso: String(nuevo.peso_actual ?? ''), reps1: String(nuevo.reps ?? ''), reps2: String(nuevo.reps ?? '') },
    }));
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
      borrarBorrador(borradorKey);
      onListo();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  async function saltear() {
    if (!window.confirm('¿Saltear esta semana de testeo? Vas a arrancar directo tu rutina y cargar el peso vos mismo en la primera sesión real. Se descarta lo que hayas tipeado acá.')) return;
    setError('');
    setEnviando(true);
    try {
      await api.post(`/rutinas/${rutina.id}/semana0/saltear`);
      borrarBorrador(borradorKey);
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
          <h1 className="text-[17px] font-bold">{microciclo?.numero === 0 ? 'Semana 0 · Testeo' : 'Nueva semana de testeo'}</h1>
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

      {diaActual.ejercicios.length === 0 && (
        <p className="text-[12.5px] text-text-muted">
          Todavía no hay ejercicios este día - agregalos abajo, con su peso y una serie de referencia.
        </p>
      )}

      <div className="flex flex-col gap-3 md:grid md:grid-cols-2 md:items-start md:gap-4">
        {diaActual.ejercicios.map((ej, idx) => {
          const esUltimoDelMusculo = diaActual.ejercicios.filter(
            (e) => e.musculo_objetivo_id === ej.musculo_objetivo_id
          ).length === 1;
          const advertencia = ej.es_top_de_musculo || esUltimoDelMusculo
            ? `Este es el ejercicio ${ej.es_top_de_musculo ? 'principal' : 'único'} de ${CAPITALIZAR(formatearMusculo(ej.musculo_nombre))} en este día. ¿Seguro que querés quitarlo?`
            : null;
          return (
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
                  <QuitarEjercicioBoton
                    ejercicioAsignadoId={ej.id}
                    nombreEjercicio={ej.ejercicio_nombre}
                    tieneSeries={Boolean(ej.tiene_series)}
                    onQuitado={() => onQuitado(diaActual.id, ej.id)}
                    advertencia={advertencia}
                  />
                </div>
              </div>
            </div>
          );
        })}

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
        {enviando ? 'Guardando…' : microciclo?.numero === 0 ? 'Guardar testeo y arrancar semana 1' : 'Guardar testeo y continuar'}
      </button>

      {microciclo?.numero === 0 && (
        <button
          type="button"
          onClick={saltear}
          disabled={enviando}
          className="text-[12.5px] font-medium text-text-muted underline underline-offset-2 disabled:opacity-60 self-center"
        >
          Saltear el testeo y empezar directo con mi rutina
        </button>
      )}
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
  const [peso, setPeso] = useState('');
  const [reps, setReps] = useState('');
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
    setPeso('');
    setReps('');
  }

  async function confirmar() {
    const faltaEjercicio = particular ? !nombreParticular.trim() : !elegido;
    if (!musculoId || faltaEjercicio || peso === '' || reps === '') {
      setError('Elegí el ejercicio y cargá el peso y la serie de referencia.');
      return;
    }
    setEnviando(true);
    setError('');
    try {
      const body = {
        musculo_id: Number(musculoId),
        ...(particular ? { nombre_personalizado: nombreParticular.trim() } : { ejercicio_id: Number(elegido) }),
        peso: Number(peso),
        reps: Number(reps),
      };
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

      {musculoId && (particular ? nombreParticular.trim() : elegido) && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[11.5px] text-text-muted leading-relaxed">
            Probá un peso con el que puedas hacer entre 12 y 16 reps, y cargá esa serie de referencia.
          </span>
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Peso (kg)" value={peso} onChange={setPeso} />
            <NumberField label="Reps" value={reps} onChange={setReps} />
          </div>
        </div>
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
          disabled={enviando || (particular ? !nombreParticular.trim() : !elegido) || peso === '' || reps === ''}
          className="flex-1 h-9 rounded-lg bg-accent text-accent-fg text-[13px] font-semibold disabled:opacity-60"
        >
          {enviando ? 'Agregando…' : 'Agregar'}
        </button>
      </div>
    </div>
  );
}

// Siempre pide confirmacion con un modal antes de quitar un ejercicio (no
// un window.confirm ni solo en el caso top/unico) - si ademas ya tiene
// series registradas, avisa fuerte que se pierden en cascada (ver
// quitarEjercicioAsignado en rutinaService.js).
function QuitarEjercicioBoton({ ejercicioAsignadoId, nombreEjercicio, onQuitado, advertencia, tieneSeries }) {
  const [mostrarConfirmar, setMostrarConfirmar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  async function quitar() {
    setEnviando(true);
    setError('');
    try {
      await api.del(`/ejercicios-asignados/${ejercicioAsignadoId}`);
      setMostrarConfirmar(false);
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
        onClick={() => setMostrarConfirmar(true)}
        className="text-[11px] font-medium text-danger underline underline-offset-2"
      >
        Quitar
      </button>
      {mostrarConfirmar && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => !enviando && setMostrarConfirmar(false)}
        >
          <div
            className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-3 w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-[15px] font-bold">Quitar {nombreEjercicio}</h2>
            <p className="text-[13px] text-text-muted leading-relaxed">¿Seguro que querés quitar este ejercicio del día?</p>
            {advertencia && <p className="text-[12.5px] text-warning leading-relaxed">{advertencia}</p>}
            {tieneSeries && (
              <p className="text-[12.5px] text-danger font-semibold leading-relaxed">
                Ya tiene series registradas — se van a perder esos datos de entrenamiento.
              </p>
            )}
            {error && <p className="text-[12.5px] text-danger">{error}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMostrarConfirmar(false)}
                disabled={enviando}
                className="flex-1 h-10 rounded-lg border border-border bg-bg text-text-muted text-[13px] font-semibold disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={quitar}
                disabled={enviando}
                className="flex-[2] h-10 rounded-lg border border-danger text-danger text-[13px] font-semibold disabled:opacity-60"
              >
                {enviando ? 'Quitando…' : 'Sí, quitar'}
              </button>
            </div>
          </div>
        </div>
      )}
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
  const [mostrarCambiarDia, setMostrarCambiarDia] = useState(false);

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
              onClick={() => setMostrarCambiarDia(true)}
              className="text-[11.5px] font-medium text-text-muted underline underline-offset-2 whitespace-nowrap"
            >
              Cambiar día
            </button>
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
      {mostrarCambiarDia && (
        <CambiarDiaModal
          diaRutinaId={dia.id}
          diaSemanaActual={dia.dia_semana}
          diasActivos={diasUnicos.filter((d) => d.id !== dia.id).map((d) => d.dia_semana)}
          onClose={() => setMostrarCambiarDia(false)}
          onCambiado={() => { setMostrarCambiarDia(false); onRutinaCambiada(); }}
        />
      )}
    </div>
  );
}

function RegistroDia({ dia, microciclo, usuario, progreso, onGuardado, onRutinaCambiada, todosMusculos, diasHermanos }) {
  const borradorKey = `nac_borrador_dia_${dia.id}_${microciclo.id}`;
  const [series, setSeries] = useState(() => {
    const base = construirEstadoInicial(dia);
    const borrador = leerBorrador(borradorKey) || {};
    for (const [ejId, sets] of Object.entries(borrador)) {
      if (!base[ejId]) continue;
      sets.forEach((s, idx) => {
        if (base[ejId][idx]) {
          base[ejId][idx] = { ...base[ejId][idx], ...s };
        } else if (s.esDropset) {
          // La fila de dropset no forma parte de series_actuales (es una
          // serie extra) - el merge de arriba la salteaba porque no hay
          // indice previo con el que mezclarla, y se perdia silenciosamente
          // si se recargaba la pagina antes de guardar la sesion.
          base[ejId] = [...base[ejId], { peso: '', reps: '', rir: 1, esDropset: false, ...s }];
        }
      });
    }
    return base;
  });
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [ok, setOk] = useState(false);

  useEffect(() => { guardarBorrador(borradorKey, series); }, [borradorKey, series]);

  // Como el guardado/agregado/reordenado ya no fuerza un remount de este
  // componente (ver onRutinaCambiada en EntrenamientoPage - antes recargaba
  // la pagina entera y reseteaba el dia seleccionado), "series" puede no
  // tener todavia una entrada para un ejercicio agregado despues del mount
  // (o al revés, seguir teniendo una de uno ya quitado) - se completa acá,
  // por render, sin pisar lo que el usuario ya tipeo para los que si existen.
  const seriesPorEjercicio = useMemo(() => {
    const map = {};
    for (const ej of dia.ejercicios) map[ej.id] = series[ej.id] ?? construirSeriesPorDefecto(ej);
    return map;
  }, [series, dia.ejercicios]);

  const notasPorEjercicio = useMemo(() => {
    const map = new Map();
    for (const e of progreso?.ejercicios ?? []) map.set(e.id, e);
    return map;
  }, [progreso]);

  function actualizarSerie(ejercicioId, idx, campo, valor) {
    setSeries((prev) => {
      const actual = prev[ejercicioId] ?? seriesPorEjercicio[ejercicioId];
      const copia = { ...prev, [ejercicioId]: [...actual] };
      copia[ejercicioId][idx] = { ...copia[ejercicioId][idx], [campo]: valor };
      return copia;
    });
  }

  // Agrega/quita una serie extra de dropset al final del ejercicio. El peso
  // arranca en la mitad de la ultima serie real cargada (o del peso base si
  // todavia no se cargo nada), redondeado a 0.5kg - el usuario lo puede
  // cambiar igual. No se recalcula si ya esta activa (toggle apaga/prende).
  function toggleDropset(ejercicioId) {
    setSeries((prev) => {
      const actuales = prev[ejercicioId] ?? seriesPorEjercicio[ejercicioId];
      if (actuales.some((s) => s.esDropset)) {
        return { ...prev, [ejercicioId]: actuales.filter((s) => !s.esDropset) };
      }
      const ej = dia.ejercicios.find((e) => e.id === ejercicioId);
      const ultimaReal = [...actuales].reverse().find((s) => s.peso !== '');
      const pesoBase = ultimaReal ? Number(ultimaReal.peso) : ej?.peso_actual;
      const pesoDropset = Number.isFinite(pesoBase) ? String(Math.round(pesoBase) / 2) : '';
      return { ...prev, [ejercicioId]: [...actuales, { peso: pesoDropset, reps: '', rir: 1, esDropset: true }] };
    });
  }

  // Reordenar arrastrando la etiqueta del ejercicio (mantener presionado y
  // mover arriba/abajo), en vez de flechas - con Pointer Events en vez de
  // drag-and-drop nativo de HTML5, que no anda bien con touch en varios
  // navegadores de celular (esta app es mobile-first). ordenArrastre es el
  // orden temporal (array de ids) mientras se arrastra, null cuando no hay
  // ningun arrastre en curso; cardRefs guarda el nodo DOM de cada tarjeta
  // para saber, en cada pointermove, sobre cual esta el puntero.
  const [ordenArrastre, setOrdenArrastre] = useState(null);
  const arrastreRef = useRef({ activo: false, ejercicioId: null });
  const cardRefs = useRef({});

  function iniciarArrastre(e, ejercicioId) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    arrastreRef.current = { activo: true, ejercicioId };
    setOrdenArrastre(dia.ejercicios.map((ej) => ej.id));
    window.addEventListener('pointermove', onPointerMoveArrastre);
    window.addEventListener('pointerup', onPointerUpArrastre);
    window.addEventListener('pointercancel', onPointerUpArrastre);
  }

  function onPointerMoveArrastre(e) {
    if (!arrastreRef.current.activo) return;
    const y = e.clientY;
    setOrdenArrastre((prev) => {
      if (!prev) return prev;
      let nuevoIndex = null;
      for (const [idStr, node] of Object.entries(cardRefs.current)) {
        if (!node) continue;
        const rect = node.getBoundingClientRect();
        if (y >= rect.top && y <= rect.bottom) {
          nuevoIndex = prev.indexOf(Number(idStr));
          break;
        }
      }
      if (nuevoIndex == null) return prev;
      const idxActual = prev.indexOf(arrastreRef.current.ejercicioId);
      if (idxActual === -1 || idxActual === nuevoIndex) return prev;
      const copia = [...prev];
      copia.splice(idxActual, 1);
      copia.splice(nuevoIndex, 0, arrastreRef.current.ejercicioId);
      return copia;
    });
  }

  function onPointerUpArrastre() {
    window.removeEventListener('pointermove', onPointerMoveArrastre);
    window.removeEventListener('pointerup', onPointerUpArrastre);
    window.removeEventListener('pointercancel', onPointerUpArrastre);
    arrastreRef.current.activo = false;
    setOrdenArrastre((prev) => {
      if (prev) guardarOrdenArrastre(prev);
      return null;
    });
  }

  async function guardarOrdenArrastre(ids) {
    const orden = ids.map((id, i) => ({ ejercicio_asignado_id: id, orden: i + 1 }));
    try {
      await api.patch(`/dias/${dia.id}/orden`, { orden });
      onRutinaCambiada();
    } catch (err) {
      setError(err.message);
    }
  }

  const ejerciciosMostrados = ordenArrastre
    ? ordenArrastre.map((id) => dia.ejercicios.find((ej) => ej.id === id)).filter(Boolean)
    : dia.ejercicios;

  async function guardarSesion() {
    setError('');
    const payload = [];
    for (const ej of dia.ejercicios) {
      for (const [idx, s] of seriesPorEjercicio[ej.id].entries()) {
        if (s.peso === '' || s.reps === '') {
          const serie = s.esDropset ? 'la serie de dropset' : 'todas las series';
          setError(`Completá el peso y las reps de ${serie} de "${ej.ejercicio_nombre}".`);
          return;
        }
        payload.push({
          ejercicio_asignado_id: ej.id,
          numero_serie: idx + 1,
          peso: Number(s.peso),
          reps: Number(s.reps),
          rir: Number(s.rir),
          es_dropset: s.esDropset ? 1 : 0,
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
      borrarBorrador(borradorKey);
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
      borrarBorrador(borradorKey);
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
        {ejerciciosMostrados.map((ej) => {
          const nota = notasPorEjercicio.get(ej.id);
          const esUltimoDelMusculo = dia.ejercicios.filter(
            (e) => e.musculo_objetivo_id === ej.musculo_objetivo_id
          ).length === 1;
          return (
            <div
              key={ej.id}
              ref={(node) => { cardRefs.current[ej.id] = node; }}
              className={`bg-surface border border-border rounded-[14px] p-4 flex flex-col gap-3 min-w-0 ${
                ordenArrastre && arrastreRef.current.ejercicioId === ej.id ? 'opacity-60 ring-2 ring-accent' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col gap-1">
                  <span
                    onPointerDown={(e) => iniciarArrastre(e, ej.id)}
                    className="text-[14.5px] font-semibold cursor-grab active:cursor-grabbing select-none"
                    style={{ touchAction: 'none' }}
                    title="Mantené presionado para reordenar"
                  >
                    ⠿ {ej.ejercicio_nombre}
                  </span>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-semibold text-text-muted bg-bg border border-border rounded-md px-2 py-0.5 uppercase">
                      {formatearMusculo(ej.musculo_nombre)}
                    </span>
                    <span className="text-[12px] text-text-faint whitespace-nowrap">
                      {ej.rango_reps_min}–{ej.rango_reps_max} reps · Descanso {ej.descanso_segundos}s
                    </span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <ComentarioBoton
                    endpoint={`/ejercicios/${ej.id}/comentario`}
                    comentarioActual={ej.comentario}
                    recordarActual={ej.comentario_recordar}
                    onGuardado={onRutinaCambiada}
                  />
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
              </div>

              {Boolean(ej.comentario_recordar && ej.comentario) && (
                <ComentarioRecordatorio comentario={ej.comentario} />
              )}

              <div className="grid grid-cols-[24px_1fr_1fr_1fr_34px] gap-2 text-[10px] font-semibold text-text-faint tracking-wide px-0.5">
                <span className="text-center">S</span><span className="text-center">KG</span><span className="text-center">REPS</span><span className="text-center">RIR</span><span title="Reps efectivas" className="text-center">RE</span>
              </div>
              {seriesPorEjercicio[ej.id].map((s, idx) => {
                const efectivas = repsEfectivas(s.reps, s.rir);
                const sugerenciaReps = calcularSugerenciaReps(ej, seriesPorEjercicio[ej.id], idx);
                return (
                  <div
                    key={idx}
                    className={`grid grid-cols-[24px_1fr_1fr_1fr_34px] gap-2 items-center ${s.esDropset ? 'opacity-90' : ''}`}
                  >
                    <span className="tabular text-[11px] font-semibold text-text-muted text-center">
                      {s.esDropset ? 'DS' : idx + 1}
                    </span>
                    <input
                      type="number" inputMode="decimal" value={s.peso}
                      placeholder={s.esDropset ? undefined : (ej.peso_actual != null ? String(ej.peso_actual) : undefined)}
                      onChange={(e) => actualizarSerie(ej.id, idx, 'peso', e.target.value)}
                      className="w-full min-w-0 h-9 rounded-lg border border-border bg-bg px-2 tabular text-[13.5px] text-center outline-none focus:border-accent placeholder:text-text-faint"
                    />
                    <input
                      type="number" inputMode="numeric" value={s.reps}
                      placeholder={sugerenciaReps}
                      onChange={(e) => actualizarSerie(ej.id, idx, 'reps', e.target.value)}
                      className="w-full min-w-0 h-9 rounded-lg border border-border bg-bg px-2 tabular text-[13.5px] text-center outline-none focus:border-accent placeholder:text-text-faint"
                    />
                    <input
                      type="number" inputMode="numeric" min={0} max={4} value={s.rir}
                      onChange={(e) => actualizarSerie(ej.id, idx, 'rir', e.target.value)}
                      className="w-full min-w-0 h-9 rounded-lg border border-border bg-bg px-2 tabular text-[13.5px] text-center outline-none focus:border-accent"
                    />
                    <span className="tabular text-[12.5px] text-text-faint text-center">{efectivas ?? '—'}</span>
                  </div>
                );
              })}
              <span className="tabular text-[11px] text-text-faint -mt-1">
                {seriesPorEjercicio[ej.id].filter((s) => !s.esDropset).reduce((acc, s) => acc + (repsEfectivas(s.reps, s.rir) || 0), 0)} reps efectivas en total
                {seriesPorEjercicio[ej.id].some((s) => s.esDropset) && (
                  <> · {seriesPorEjercicio[ej.id].filter((s) => s.esDropset).reduce((acc, s) => acc + (repsEfectivas(s.reps, s.rir) || 0), 0)} de dropset</>
                )}
              </span>

              <EjercicioAcciones
                ejercicio={ej}
                usuario={usuario}
                onCambiado={onRutinaCambiada}
                diasHermanos={diasHermanos}
                esUltimoDelMusculo={esUltimoDelMusculo}
                dropsetActivo={seriesPorEjercicio[ej.id].some((s) => s.esDropset)}
                onToggleDropset={() => toggleDropset(ej.id)}
              />
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

function EjercicioAcciones({ ejercicio, usuario, onCambiado, diasHermanos, esUltimoDelMusculo, dropsetActivo, onToggleDropset }) {
  const advertenciaQuitar = ejercicio.es_top_de_musculo || esUltimoDelMusculo
    ? `Este es el ejercicio ${ejercicio.es_top_de_musculo ? 'principal' : 'único'} de ${CAPITALIZAR(formatearMusculo(ejercicio.musculo_nombre))} en este día. ¿Seguro que querés quitarlo?`
    : null;
  const [mostrarSustituir, setMostrarSustituir] = useState(false);
  const [mostrarPeso, setMostrarPeso] = useState(false);
  const [mostrarDescanso, setMostrarDescanso] = useState(false);
  const [mostrarMoverCopiar, setMostrarMoverCopiar] = useState(false);
  const [mostrarEditarNombre, setMostrarEditarNombre] = useState(false);
  const [error, setError] = useState('');

  return (
    <div className="flex flex-col gap-2 pt-1 border-t border-border -mx-4 px-4">
      <div className="flex items-start justify-between gap-2 pt-2 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <AjusteSeries ejercicioId={ejercicio.id} seriesActuales={ejercicio.series_actuales} onAjustado={onCambiado} onError={setError} />
          <label className="flex items-center gap-1.5 shrink-0 cursor-pointer" title="DropSet">
            <input
              type="checkbox"
              checked={dropsetActivo}
              onChange={onToggleDropset}
              className="w-4 h-4 accent-accent"
            />
            <span className="text-[11px] font-semibold text-text-muted whitespace-nowrap">DS</span>
          </label>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMostrarSustituir((v) => !v)}
            className="text-[11px] font-medium text-text-muted underline underline-offset-2 whitespace-nowrap"
          >
            Cambiar ejercicio
          </button>
          <QuitarEjercicioBoton
            ejercicioAsignadoId={ejercicio.id}
            nombreEjercicio={ejercicio.ejercicio_nombre}
            tieneSeries={Boolean(ejercicio.tiene_series)}
            onQuitado={onCambiado}
            advertencia={advertenciaQuitar}
          />
        </div>
      </div>

      <div className="flex flex-col items-end gap-1.5">
        <div className="flex flex-wrap items-start justify-end gap-x-3 gap-y-1.5">
          <div className="flex flex-col items-end gap-1.5">
            <button
              type="button"
              onClick={() => setMostrarPeso((v) => !v)}
              className="text-[11px] font-medium text-text-muted underline underline-offset-2 whitespace-nowrap"
            >
              Peso base
            </button>
            {mostrarPeso && (
              <AjustePeso
                ejercicioId={ejercicio.id}
                pesoActual={ejercicio.peso_actual}
                onAjustado={() => { setMostrarPeso(false); onCambiado(); }}
              />
            )}
          </div>

          <div className="flex flex-col items-end gap-1.5">
            <button
              type="button"
              onClick={() => setMostrarDescanso((v) => !v)}
              className="text-[11px] font-medium text-text-muted underline underline-offset-2 whitespace-nowrap"
            >
              Descanso
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
            <div className="flex flex-col items-end gap-1.5">
              <button
                type="button"
                onClick={() => setMostrarMoverCopiar((v) => !v)}
                className="text-[11px] font-medium text-text-muted underline underline-offset-2 whitespace-nowrap"
              >
                Mover/copiar
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

          {ejercicio.patron_movimiento === 'personalizado' && (
            <div className="flex flex-col items-end gap-1.5">
              <button
                type="button"
                onClick={() => setMostrarEditarNombre((v) => !v)}
                className="text-[11px] font-medium text-text-muted underline underline-offset-2 whitespace-nowrap"
              >
                Editar nombre
              </button>
              {mostrarEditarNombre && (
                <EditarNombreParticular
                  ejercicioId={ejercicio.id}
                  nombreActual={ejercicio.ejercicio_nombre}
                  onEditado={() => { setMostrarEditarNombre(false); onCambiado(); }}
                />
              )}
            </div>
          )}
        </div>
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
    <div className="flex items-center gap-1.5 shrink-0">
      <span className="text-[11px] text-text-faint whitespace-nowrap">Series</span>
      <button
        type="button"
        onClick={() => ajustar(-1)}
        disabled={enviando}
        className="w-6 h-6 rounded-md border border-border bg-surface text-text-muted text-[13px] leading-none disabled:opacity-40"
      >
        −
      </button>
      <span className="tabular text-[13px] font-semibold w-4 text-center">{seriesActuales}</span>
      <button
        type="button"
        onClick={() => ajustar(1)}
        disabled={enviando}
        className="w-6 h-6 rounded-md border border-border bg-surface text-text-muted text-[13px] leading-none disabled:opacity-40"
      >
        +
      </button>
    </div>
  );
}

// Cambiar el peso base (el que se precarga la proxima sesion) sin esperar
// al cierre de microciclo.
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

// Corrige el nombre de un ejercicio "particular" (cargado a mano) por si
// se anoto mal - solo aparece para esos, nunca para uno del catalogo.
function EditarNombreParticular({ ejercicioId, nombreActual, onEditado }) {
  const [nombre, setNombre] = useState(nombreActual);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function confirmar() {
    if (!nombre.trim()) {
      setError('El nombre no puede estar vacío.');
      return;
    }
    setEnviando(true);
    setError('');
    try {
      await api.patch(`/ejercicios/${ejercicioId}/nombre-particular`, { nombre: nombre.trim() });
      onEditado();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        className="w-40 h-8 rounded-md border border-border bg-bg px-2 text-[13px] outline-none focus:border-accent"
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
        className="self-start text-[11px] font-medium text-text-muted underline underline-offset-2 whitespace-nowrap"
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
  const [reps, setReps] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    api.get(`/ejercicios/${ejercicio.id}/candidatos`).then(setCandidatos).catch((err) => setError(err.message));
  }, [ejercicio.id]);

  async function confirmar() {
    const faltaEjercicio = particular ? !nombreParticular.trim() : !elegido;
    if (faltaEjercicio || peso === '' || reps === '') {
      setError('Completá el ejercicio nuevo, el peso y la serie de referencia.');
      return;
    }
    setEnviando(true);
    setError('');
    try {
      await api.post(`/ejercicios/${ejercicio.id}/sustituir`, {
        nuevo_ejercicio_id: particular ? undefined : Number(elegido),
        nombre_personalizado: particular ? nombreParticular.trim() : undefined,
        peso: Number(peso),
        reps: Number(reps),
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
        Probá un peso con el que puedas hacer entre 12 y 16 reps, y cargá esa serie de referencia — se usa como piso para lo que queda de este microciclo.
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

      <div className="grid grid-cols-2 gap-2">
        <NumberField label="Peso (kg)" value={peso} onChange={setPeso} />
        <NumberField label="Reps" value={reps} onChange={setReps} />
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

function construirSeriesPorDefecto(ej) {
  return Array.from({ length: ej.series_actuales }, () => ({
    peso: '',
    reps: '',
    rir: 1,
    esDropset: false,
  }));
}

function construirEstadoInicial(dia) {
  return Object.fromEntries(dia.ejercicios.map((ej) => [ej.id, construirSeriesPorDefecto(ej)]));
}

// Sugerencia en gris (placeholder, no un valor cargado) de cuantas reps
// esperar en esta serie. La serie 1 usa el piso de reps calculado en el
// ultimo cierre de microciclo (progreso_ejercicio_microciclo.piso_reps); de
// ahi en mas, si se mantiene el mismo peso que en la serie anterior (con el
// descanso habitual entre series), es esperable un declive de ~2 reps -
// encadenado desde lo REALMENTE cargado en la serie anterior, o si todavia
// no se cargo nada ahi, desde su propia sugerencia (recursivo).
function calcularSugerenciaReps(ej, seriesEjercicio, idx) {
  const actual = seriesEjercicio[idx];
  if (actual.esDropset) return undefined;
  if (idx === 0) {
    return ej.piso_reps != null ? String(ej.piso_reps) : undefined;
  }
  const anterior = seriesEjercicio[idx - 1];
  if (anterior.esDropset) return undefined;
  const pesoActual = actual.peso !== '' ? Number(actual.peso) : ej.peso_actual;
  const pesoAnterior = anterior.peso !== '' ? Number(anterior.peso) : ej.peso_actual;
  const mismoPeso = pesoActual != null && pesoAnterior != null && Number.isFinite(pesoActual)
    && Number.isFinite(pesoAnterior) && pesoActual === pesoAnterior;
  if (!mismoPeso) return undefined;

  const repsAnterior = anterior.reps !== ''
    ? Number(anterior.reps)
    : Number(calcularSugerenciaReps(ej, seriesEjercicio, idx - 1));
  return Number.isFinite(repsAnterior) ? String(Math.max(0, repsAnterior - 2)) : undefined;
}
