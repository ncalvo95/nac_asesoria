import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api/client.js';
import AgregarDiaModal from '../components/AgregarDiaModal.jsx';
import QuitarDiaModal from '../components/QuitarDiaModal.jsx';
import CambiarDiaModal from '../components/CambiarDiaModal.jsx';
import MoverCopiarDiaModal from '../components/MoverCopiarDiaModal.jsx';
import EditarSemana0Modal from '../components/EditarSemana0Modal.jsx';
import ExportarExcelModal from '../components/ExportarExcelModal.jsx';
import { useArrastreOrden } from '../hooks/useArrastreOrden.js';
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

// Duración aproximada del día: mismo criterio que segundosEstimadosEjercicio
// en src/services/routineBuilder.js (30s de trabajo por serie + el descanso
// entre series + 5 min de transición por ejercicio), pero acá con las
// series y el descanso REALES de cada ejercicio_asignado -que ya pueden
// haberse movido lejos de los 2/90s con los que se armó el día- en vez de
// congelados en el momento del armado.
const SEGUNDOS_POR_SERIE = 30;
const SEGUNDOS_TRANSICION_EJERCICIO = 300;
function duracionEstimadaDia(dia) {
  const segundos = dia.ejercicios.reduce((acc, ej) => {
    const series = ej.series_actuales || 0;
    if (series <= 0) return acc;
    const descanso = ej.descanso_segundos ?? 90;
    return acc + SEGUNDOS_POR_SERIE * series + descanso * (series - 1) + SEGUNDOS_TRANSICION_EJERCICIO;
  }, 0);
  return Math.round(segundos / 60);
}

function ExportarExcel({ rutinaId, usuarioId, microciclos }) {
  const [mostrar, setMostrar] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setMostrar(true)}
        className="text-[12px] font-semibold text-accent border border-accent rounded-lg px-2.5 py-1.5 whitespace-nowrap"
      >
        Exportar Excel
      </button>
      {mostrar && (
        <ExportarExcelModal
          rutinaId={rutinaId}
          usuarioId={usuarioId}
          microciclos={microciclos}
          onClose={() => setMostrar(false)}
        />
      )}
    </>
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

// dia_semana de hoy segun el reloj del dispositivo, para abrir la pantalla
// directo en el dia que corresponde en vez de siempre el primero de la
// rutina - si hoy no es un dia de entrenamiento, quien llama cae al primer
// dia (ver elegirDiaInicial).
function diaSemanaHoy() {
  return ORDEN_DIAS[(new Date().getDay() + 6) % 7]; // getDay(): 0=domingo -> lunes=0..domingo=6
}

// Elige el dia con el que arranca la pantalla: el de hoy si la rutina
// entrena ese dia, si no el primero de la lista (mismo fallback que antes).
function elegirDiaInicial(dias) {
  const hoy = diaSemanaHoy();
  return dias.find((d) => d.dia_semana === hoy)?.id ?? dias[0]?.id;
}

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

function sumarDiasFecha(fechaIso, dias) {
  const fecha = new Date(`${fechaIso}T00:00:00`);
  fecha.setDate(fecha.getDate() + dias);
  return fecha.toISOString().slice(0, 10);
}

function Semana0Form({ rutina, usuario, microciclo, onListo, todosMusculos }) {
  // Estado local mutable de los dias/ejercicios (independiente del prop
  // "rutina", que queda fijo desde que se monta la pantalla) - hace falta
  // porque sustituir un ejercicio antes del testeo cambia que ejercicio va
  // en cada slot, sin recargar toda la pantalla.
  const [dias, setDias] = useState(() => rutina.dias.map((d) => ({ ...d, ejercicios: d.ejercicios.map((e) => ({ ...e })) })));
  const [fechaInicio, setFechaInicio] = useState(rutina.fecha_inicio?.slice(0, 10) || '');
  const [diaId, setDiaId] = useState(() => elegirDiaInicial(dias));

  const todosEjercicios = useMemo(
    () => dias.flatMap((d) => d.ejercicios.map((e) => ({ ...e, dia_semana: d.dia_semana }))),
    [dias]
  );
  const borradorKey = `nac_borrador_semana0_${rutina.id}`;
  const [valores, setValores] = useState(() => {
    // El borrador del backend (microciclo.borrador_semana0) es lo que se
    // cargo desde CUALQUIER dispositivo y se empujo con el boton "Guardar
    // progreso"; el de localStorage es solo la copia instantanea de este
    // mismo dispositivo/pestaña, que puede tener tipeo mas reciente que
    // todavia no se empujo. Por eso localStorage gana campo por campo
    // cuando tiene algo cargado, y el del backend rellena el resto.
    let borradorBackend = {};
    try {
      borradorBackend = microciclo?.borrador_semana0 ? JSON.parse(microciclo.borrador_semana0) : {};
    } catch {
      borradorBackend = {};
    }
    const borradorLocal = leerBorrador(borradorKey) || {};
    return Object.fromEntries(
      todosEjercicios.map((e) => {
        const local = borradorLocal[e.id];
        const remoto = borradorBackend[e.id];
        const vacio = { peso: '', reps1: '', reps2: '' };
        if (!local) return [e.id, remoto || vacio];
        if (!remoto) return [e.id, local];
        return [e.id, {
          peso: local.peso || remoto.peso || '',
          reps1: local.reps1 || remoto.reps1 || '',
          reps2: local.reps2 || remoto.reps2 || '',
        }];
      })
    );
  });
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [guardandoFecha, setGuardandoFecha] = useState(false);
  const [guardandoProgreso, setGuardandoProgreso] = useState(false);
  const [progresoGuardado, setProgresoGuardado] = useState(false);

  useEffect(() => { guardarBorrador(borradorKey, valores); }, [borradorKey, valores]);

  // Empuja lo tipeado hasta ahora al servidor (sin cerrar el testeo ni
  // arrancar la semana 1) para que se vea desde otro dispositivo - a
  // diferencia del submit, acepta ejercicios incompletos.
  async function guardarProgreso() {
    setError('');
    setGuardandoProgreso(true);
    setProgresoGuardado(false);
    try {
      await api.put(`/rutinas/${rutina.id}/semana0/borrador`, { valores });
      setProgresoGuardado(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardandoProgreso(false);
    }
  }

  const diaActual = dias.find((d) => d.id === diaId) ?? dias[0];

  function set(id, campo, valor) {
    setValores((v) => ({ ...v, [id]: { ...v[id], [campo]: valor } }));
    setProgresoGuardado(false);
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

  // Reordenar arrastrando la etiqueta del ejercicio (mismo hook que
  // RegistroDia, ver useArrastreOrden.js para el detalle del algoritmo).
  async function guardarOrdenArrastreSemana0(ids) {
    const nuevosEjercicios = ids.map((id) => diaActual.ejercicios.find((ej) => ej.id === id)).filter(Boolean);
    setDias((prev) => prev.map((d) => (d.id === diaActual.id ? { ...d, ejercicios: nuevosEjercicios } : d)));
    const orden = ids.map((id, i) => ({ ejercicio_asignado_id: id, orden: i + 1 }));
    try {
      await api.patch(`/dias/${diaActual.id}/orden`, { orden });
    } catch (err) {
      setError(err.message);
    }
  }

  const { ordenArrastre, arrastrandoId, cardRefs, iniciarArrastre: iniciarArrastreSemana0 } = useArrastreOrden(
    diaActual.ejercicios.map((ej) => ej.id),
    guardarOrdenArrastreSemana0
  );

  const ejerciciosMostrados = ordenArrastre
    ? ordenArrastre.map((id) => diaActual.ejercicios.find((ej) => ej.id === id)).filter(Boolean)
    : diaActual.ejercicios;

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
    <form
      onSubmit={onSubmit}
      // Toda la pantalla es UN solo <form> (el submit real es el boton
      // "Guardar testeo..." de mas abajo) - sin esto, tocar Enter/"Listo" en
      // cualquier input anidado (por ejemplo el peso/reps de "+ Agregar
      // ejercicio", que todavia no se confirmo con su propio boton) dispara
      // el submit implicito del form completo y cierra el testeo de golpe.
      onKeyDown={(e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.preventDefault(); }}
      className="flex flex-col gap-4 p-4 pb-6 md:max-w-5xl md:mx-auto"
    >
      <div className="px-1 flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-[17px] font-bold">{microciclo?.numero === 0 ? 'Semana 0 · Testeo' : 'Nueva semana de testeo'}</h1>
          <ExportarExcel rutinaId={rutina.id} usuarioId={usuario.id} microciclos={rutina.microciclos} />
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
        {ejerciciosMostrados.map((ej) => {
          const esUltimoDelMusculo = diaActual.ejercicios.filter(
            (e) => e.musculo_objetivo_id === ej.musculo_objetivo_id
          ).length === 1;
          const advertencia = ej.es_top_de_musculo || esUltimoDelMusculo
            ? `Este es el ejercicio ${ej.es_top_de_musculo ? 'principal' : 'único'} de ${CAPITALIZAR(formatearMusculo(ej.musculo_nombre))} en este día. ¿Seguro que querés quitarlo?`
            : null;
          return (
            <div
              key={ej.id}
              ref={(node) => { cardRefs.current[ej.id] = node; }}
              className={`bg-surface border border-border rounded-[14px] p-4 flex flex-col gap-3 min-w-0 ${
                arrastrandoId === ej.id ? 'opacity-60 ring-2 ring-accent' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <span
                  onPointerDown={(e) => iniciarArrastreSemana0(e, ej.id)}
                  className="flex items-center gap-1.5 -m-3 p-3 cursor-grab active:cursor-grabbing select-none"
                  style={{ touchAction: 'none' }}
                  title="Mantené presionado para reordenar"
                >
                  <span aria-hidden="true" className="text-[19px] leading-none text-text-faint">⠿</span>
                  <span className="text-[14px] font-semibold">{ej.ejercicio_nombre}</span>
                </span>
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
          );
        })}

        <AgregarEjercicioDia
          diaRutinaId={diaActual.id}
          musculos={todosMusculos}
          onAgregado={(nuevo, musculoNombre) => onAgregado(diaActual.id, nuevo, musculoNombre)}
        />
      </div>

      {error && <p className="text-[13px] text-danger px-1">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={guardarProgreso}
          disabled={guardandoProgreso}
          className="h-12 px-4 rounded-[10px] border border-accent text-accent text-[14px] font-semibold disabled:opacity-60 whitespace-nowrap"
        >
          {guardandoProgreso ? 'Guardando…' : 'Guardar'}
        </button>
        <button
          type="submit"
          disabled={enviando}
          className="flex-1 h-12 rounded-[10px] bg-accent text-accent-fg text-[15px] font-semibold disabled:opacity-60"
        >
          {enviando ? 'Guardando…' : microciclo?.numero === 0 ? 'Guardar testeo y arrancar semana 1' : 'Guardar testeo y continuar'}
        </button>
      </div>
      {progresoGuardado && (
        <p className="text-[12.5px] text-text-muted self-center">
          Progreso guardado - ya lo podés ver desde otro dispositivo.
        </p>
      )}

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
        Quitar ejercicio
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

  const [diaId, setDiaId] = useState(() => elegirDiaInicial(diasUnicos) ?? rutina.dias[0].id);
  const dia = rutina.dias.find((d) => d.id === diaId) ?? rutina.dias[0];
  const [mostrarAgregarDia, setMostrarAgregarDia] = useState(false);
  const [mostrarQuitarDia, setMostrarQuitarDia] = useState(false);
  const [mostrarCambiarDia, setMostrarCambiarDia] = useState(false);
  const [mostrarMoverCopiarDia, setMostrarMoverCopiarDia] = useState(false);
  const [mostrarEditarSemana0, setMostrarEditarSemana0] = useState(false);

  // rutina.semana_actual (1 o 2, ver obtenerRutinaActiva en rutinaService.js)
  // es null si no hay microciclo en curso de 2 semanas todavia (testeo). Cual
  // semana se esta VIENDO puede diferir de la actual: el usuario puede tocar
  // "Semana 1" desde la semana 2 para consultar como le fue, de solo lectura
  // - no cambia nada de lo que esta entrenando hoy.
  const [semanaVista, setSemanaVista] = useState(rutina.semana_actual ?? 1);
  const esSemanaActual = semanaVista === rutina.semana_actual;

  // Coloreado verde/rojo de peso y reps contra lo pactado (en vivo y en
  // semanas ya cerradas) - preferencia de este dispositivo, no del
  // usuario en el backend (mismo criterio que el tema claro/oscuro en
  // ThemeContext.jsx), asi que cada quien lo prende/apaga en su propia
  // PC/celular sin afectar al otro.
  const [coloreadoActivo, setColoreadoActivo] = useState(() => leerBorrador('nac_coloreado_activo') ?? true);
  function alternarColoreado() {
    setColoreadoActivo((prev) => {
      const nuevo = !prev;
      guardarBorrador('nac_coloreado_activo', nuevo);
      return nuevo;
    });
  }
  const fechaDia = rutina.semana_actual
    ? fechaParaDia(sumarDiasFecha(microciclo.fecha_inicio, semanaVista === 2 ? 7 : 0), dia.dia_semana)
    : null;

  return (
    <div className="flex flex-col gap-4 p-4 pb-6 md:max-w-5xl md:mx-auto">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-[17px] font-bold">{CAPITALIZAR(dia.dia_semana)}</h1>
            {fechaDia && <span className="tabular text-[12px] text-text-faint">{formatearFechaCorta(fechaDia)}</span>}
            <span className="tabular text-[12px] text-text-muted">Microciclo {microciclo.numero}</span>
            <span
              className="tabular text-[12px] text-text-faint"
              title="Estimado: 30s de trabajo por serie + el descanso entre series + 5 min de transición por ejercicio (cambiar de máquina, cargar/descargar)"
            >
              ~{duracionEstimadaDia(dia)} min
            </span>
            <FaseNutricional rutinaId={rutina.id} faseActual={microciclo.fase_nutricional} onCambiada={onRutinaCambiada} />
            <button
              type="button"
              onClick={alternarColoreado}
              title={coloreadoActivo ? 'Apagar el coloreado de peso/reps contra lo pactado' : 'Prender el coloreado de peso/reps contra lo pactado'}
              className={`h-6 rounded-full border px-2.5 text-[11px] font-semibold ${
                coloreadoActivo ? 'bg-accent text-accent-fg border-accent' : 'bg-surface border-border text-text-muted'
              }`}
            >
              🎨 Colores {coloreadoActivo ? 'ON' : 'OFF'}
            </button>
          </div>
          <ExportarExcel rutinaId={rutina.id} usuarioId={usuario.id} microciclos={rutina.microciclos} />
        </div>
        {rutina.semana_actual && (
          <div className="flex items-center gap-1.5 self-start">
            {[1, 2].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setSemanaVista(n)}
                className={`px-2.5 h-7 rounded-md border text-[12px] font-semibold ${
                  n === semanaVista ? 'bg-accent text-accent-fg border-accent' : 'bg-surface border-border text-text-muted'
                }`}
              >
                Semana {n}{n === rutina.semana_actual ? ' · hoy' : ''}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex gap-1.5 flex-wrap">
            {diasUnicos.map((d) => {
              const registroTab = d.registros_semana ? d.registros_semana[semanaVista] : d.sesion_actual;
              const fechaTab = rutina.semana_actual
                ? fechaParaDia(sumarDiasFecha(microciclo.fecha_inicio, semanaVista === 2 ? 7 : 0), d.dia_semana)
                : null;
              return (
              <button
                key={d.id}
                onClick={() => setDiaId(d.id)}
                className={`relative flex flex-col items-center px-3 h-9 justify-center rounded-xl border text-[12.5px] font-semibold leading-tight ${
                  d.id === dia.id ? 'bg-accent text-accent-fg border-accent' : 'bg-surface border-border text-text-muted'
                }`}
              >
                {CAPITALIZAR(d.dia_semana)}
                {fechaTab && <span className="text-[9.5px] font-normal opacity-80">{formatearFechaCorta(fechaTab)}</span>}
                {registroTab && (
                  <span
                    title={registroTab.salteada ? `Salteado semana ${semanaVista}` : `Registrado semana ${semanaVista}`}
                    className={`absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] leading-none text-white ${
                      registroTab.salteada ? 'bg-text-faint' : 'bg-success'
                    }`}
                  >
                    {registroTab.salteada ? '–' : '✓'}
                  </span>
                )}
              </button>
              );
            })}
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
              onClick={() => setMostrarMoverCopiarDia(true)}
              className="text-[11.5px] font-medium text-text-muted underline underline-offset-2 whitespace-nowrap"
            >
              Intercambiar/copiar día
            </button>
            {microciclo.numero >= 1 && (
              <button
                type="button"
                onClick={() => setMostrarEditarSemana0(true)}
                className="text-[11.5px] font-medium text-text-muted underline underline-offset-2 whitespace-nowrap"
              >
                Editar Semana 0
              </button>
            )}
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
      {esSemanaActual ? (
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
          semanaActual={rutina.semana_actual}
          coloreadoActivo={coloreadoActivo}
        />
      ) : (
        <ResumenSemanaPasada
          key={`${dia.id}-${semanaVista}`}
          dia={dia}
          numeroSemana={semanaVista}
          registro={dia.registros_semana?.[semanaVista] ?? null}
          coloreadoActivo={coloreadoActivo}
        />
      )}

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
      {mostrarMoverCopiarDia && (
        <MoverCopiarDiaModal
          diaRutinaId={dia.id}
          diaSemanaActual={dia.dia_semana}
          diasHermanos={diasUnicos.filter((d) => d.id !== dia.id)}
          onClose={() => setMostrarMoverCopiarDia(false)}
          onListo={() => { setMostrarMoverCopiarDia(false); onRutinaCambiada(); }}
        />
      )}
      {mostrarEditarSemana0 && (
        <EditarSemana0Modal
          rutinaId={rutina.id}
          onClose={() => setMostrarEditarSemana0(false)}
          onCorregido={() => { setMostrarEditarSemana0(false); onRutinaCambiada(); }}
        />
      )}
    </div>
  );
}

// Vista de solo lectura de una semana que NO es la actual (ver semanaVista
// en DiaEntrenamiento) - consultar como fue la semana 1 sin perder de vista
// que lo que se esta entrenando/editando hoy es la semana actual, que sigue
// siendo RegistroDia de siempre. No permite cargar ni editar nada: eso solo
// se hace en la semana actual, como siempre paso.
function ResumenSemanaPasada({ dia, numeroSemana, registro, coloreadoActivo }) {
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

  return (
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
  );
}

// Compara contra lo pactado del microciclo en curso (ej.peso_actual/
// ej.piso_reps, que reflejan progreso_ejercicio_microciclo - ver
// ejerciciosStmt en rutinaService.js) - verde si se hizo mas, rojo si
// menos. Las reps solo se colorean si el peso no cambio: si subiste o
// bajaste el peso, hacer menos o mas reps es esperable y no dice nada por
// si solo.
//
// Cada serie real se compara contra un objetivo FIJO calculado una sola
// vez desde piso_reps (piso_reps - 2*indice: serie 1 = piso_reps, serie 2
// = piso_reps-2, ...) - mismo criterio que colorVsPactadoLive (el modo en
// vivo). Antes esta funcion comparaba solo la ULTIMA serie real contra
// piso_reps sin decrementar, lo que en una semana YA CERRADA (vista
// "Semana 1"/"Semana 2" tras haber avanzado a la semana siguiente)
// marcaba en rojo una caida de reps perfectamente esperable por fatiga.
function colorVsPactado(series, ej) {
  const reales = series.filter((s) => !s.es_dropset).sort((a, b) => a.numero_serie - b.numero_serie);
  if (reales.length === 0) return { pesoColor: null, repsColores: [] };
  let pesoColor = null;
  if (ej.peso_actual != null) {
    const pesoUsado = reales[0].peso;
    if (pesoUsado > ej.peso_actual) pesoColor = 'verde';
    else if (pesoUsado < ej.peso_actual) pesoColor = 'rojo';
  }
  const repsColores = reales.map((s, idx) => {
    if (pesoColor != null || ej.piso_reps == null) return null;
    const target = ej.piso_reps - 2 * idx;
    if (s.reps > target) return 'verde';
    if (s.reps < target) return 'rojo';
    return null;
  });
  return { pesoColor, repsColores };
}

function colorClase(color) {
  if (color === 'verde') return 'text-success font-semibold';
  if (color === 'rojo') return 'text-danger font-semibold';
  return '';
}

// Version en vivo de colorVsPactado, para mientras se esta tipeando la
// sesion de hoy (RegistroDia): mismo criterio, pero sobre el estado local
// `series` (peso/reps como string, `esDropset` en camelCase, y puede
// estar vacio si todavia no se tipeo nada) en vez de series ya
// registradas contra el backend. Un campo vacio no cuenta como "0" -
// simplemente no hay nada que comparar todavia, asi que no se pinta.
//
// `seriesReferencia` es la cantidad de series que tenia el ejercicio
// cuando se abrio esta pantalla (antes de cualquier "+1 serie" tocado en
// esta misma sesion). Una serie mas alla de esa cantidad es nueva, nunca
// se entreno antes - no hay con que compararla, asi que no se pinta (el
// peso si se sigue comparando: peso_actual no es "el peso de la serie N",
// es el peso de trabajo del ejercicio en general, asi que sigue siendo
// una referencia valida aunque la serie en si sea nueva).
//
// Las reps de cada serie se comparan contra un objetivo FIJO derivado de
// lo pactado (piso_reps - 2*indice: serie 1 = piso_reps, serie 2 =
// piso_reps-2, serie 3 = piso_reps-4, ...), calculado una sola vez desde
// el plan original - NO contra lo que se tipeo en la serie anterior de
// esta sesion (eso es lo que hace `calcularSugerenciaReps`, para el
// placeholder gris, con otro proposito: sugerir un numero realista dado
// como viene la sesion). Si se usara esa sugerencia dinamica para pintar,
// mejorar la serie 1 "contagia" un objetivo mas exigente a la serie 2 -
// mantenerse en la serie 2 (el mismo -2 que pautaba el plan original)
// quedaba marcado en rojo solo por haber mejorado la serie 1, cuando en
// realidad mejoraste una serie y te mantuviste en la otra, dos cosas
// distintas que no deberian mezclarse.
function colorVsPactadoLive(series, ej, seriesReferencia) {
  const reales = series.filter((s) => !s.esDropset);
  if (reales.length === 0) return { pesoColor: null, repsColores: [] };
  let pesoColor = null;
  const primerPeso = reales[0].peso;
  if (ej.peso_actual != null && primerPeso !== '' && primerPeso != null) {
    const pesoUsado = Number(primerPeso);
    if (pesoUsado > ej.peso_actual) pesoColor = 'verde';
    else if (pesoUsado < ej.peso_actual) pesoColor = 'rojo';
  }
  const repsColores = reales.map((s, idx) => {
    if (pesoColor != null || idx >= seriesReferencia || ej.piso_reps == null) return null;
    if (s.reps === '' || s.reps == null) return null;
    const target = ej.piso_reps - 2 * idx;
    const repsUsadas = Number(s.reps);
    if (!Number.isFinite(repsUsadas)) return null;
    if (repsUsadas > target) return 'verde';
    if (repsUsadas < target) return 'rojo';
    return null;
  });
  return { pesoColor, repsColores };
}

function colorClaseInput(color) {
  if (color === 'verde') return 'border-success text-success font-semibold';
  if (color === 'rojo') return 'border-danger text-danger font-semibold';
  return 'border-border';
}

function RegistroDia({ dia, microciclo, usuario, progreso, onGuardado, onRutinaCambiada, todosMusculos, diasHermanos, semanaActual, coloreadoActivo }) {
  const borradorKey = `nac_borrador_dia_${dia.id}_${microciclo.id}`;
  const [series, setSeries] = useState(() => {
    const base = construirEstadoInicial(dia);

    // Si esta semana ya se registro (no salteada) una sesion de este dia,
    // precargar el formulario con lo que REALMENTE se guardo - antes, al
    // guardar con exito se borraba el borrador local (mas abajo) pero el
    // formulario nunca volvia a leer la sesion ya guardada, asi que
    // reabrir un dia ya registrado mostraba todo en blanco (peso/reps en
    // gris, como si nunca se hubiera tipeado nada) y el RIR vuelto a su
    // default (1) - el registro en si seguia intacto en la base, solo la
    // vista no lo reflejaba. dia.sesion_actual ya trae las series (ver
    // registroDeSemana en rutinaService.js).
    //
    // Si esta semana TODAVIA no tiene nada propio y es la semana 2, se
    // precarga en cambio con lo que se registro en la semana 1 de este
    // mismo microciclo - las dos semanas de un microciclo entrenan al
    // MISMO peso/piso pactado (ver techoDesde en progressionEngine.js,
    // que compara semana 1 vs semana 2 al cerrar el bloque), asi que la
    // semana 2 es literalmente un intento de igualar o mejorar la semana
    // 1, no una rutina en blanco - pedir tipear ejercicio por ejercicio,
    // serie por serie, peso, reps y RIR de nuevo desde cero no tenia
    // sentido cuando ya se habia cargado exactamente eso 7 dias antes.
    // El coloreado en vivo (colorVsPactadoLive) sigue comparando contra
    // lo pactado (peso_actual/piso_reps), nunca contra estos valores
    // precargados, asi que superarlos o igualarlos sigue siendo "mejorar"
    // o "mantenerse" en los terminos del plan original - no un objetivo
    // nuevo inventado a partir de la semana 1.
    const registroBase = (dia.sesion_actual && !dia.sesion_actual.salteada)
      ? dia.sesion_actual
      : (semanaActual === 2 && dia.registros_semana?.[1] && !dia.registros_semana[1].salteada
        ? dia.registros_semana[1]
        : null);
    if (registroBase) {
      const porEjercicio = new Map();
      for (const s of registroBase.series) {
        if (!porEjercicio.has(s.ejercicio_asignado_id)) porEjercicio.set(s.ejercicio_asignado_id, []);
        porEjercicio.get(s.ejercicio_asignado_id).push(s);
      }
      for (const [ejId, sets] of porEjercicio) {
        if (!base[ejId]) continue;
        const reales = sets.filter((s) => !s.es_dropset).sort((a, b) => a.numero_serie - b.numero_serie);
        const dropsets = sets.filter((s) => s.es_dropset);
        const nuevasReales = base[ejId].map((row, idx) => (reales[idx]
          ? { peso: String(reales[idx].peso), reps: String(reales[idx].reps), rir: reales[idx].rir ?? 1, esDropset: false }
          : row));
        base[ejId] = [...nuevasReales, ...dropsets.map((d) => ({ peso: String(d.peso), reps: String(d.reps), rir: d.rir ?? 1, esDropset: true }))];
      }
    }

    // Borrador del backend (dia.borrador_registro, empujado desde
    // CUALQUIER dispositivo via el boton "Guardar borrador" - ver
    // guardarBorradorDia en progressionEngine.js) primero, y el de
    // localStorage de este mismo dispositivo encima - si hay tipeo local
    // mas reciente que todavia no se empujo, gana ese (mismo criterio que
    // el borrador de Semana 0).
    if (dia.borrador_registro) aplicarBorradorEnBase(base, dia.borrador_registro);
    aplicarBorradorEnBase(base, leerBorrador(borradorKey) || {});
    return base;
  });
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [ok, setOk] = useState(false);
  const [modoExpress, setModoExpress] = useState(false);
  // Confirmacion antes de pisar datos ya tipeados (ver mas abajo) - null
  // cuando no hay ningun cambio de modo esperando confirmacion.
  const [confirmarCambioModo, setConfirmarCambioModo] = useState(null); // 'activar' | 'desactivar' | null
  const [guardandoBorrador, setGuardandoBorrador] = useState(false);
  const [borradorGuardado, setBorradorGuardado] = useState(false);

  // Cuantas series tenia cada ejercicio al abrir esta pantalla - se
  // captura una sola vez (el inicializador de useState no vuelve a correr
  // aunque dia.ejercicios cambie de prop despues, ej. al tocar "+1 serie",
  // que refetchea la rutina) para poder distinguir mas adelante una serie
  // recien agregada AHORA (sin referencia previa) de una que ya estaba.
  const [seriesPactadasAlAbrir] = useState(() => {
    const map = {};
    for (const ej of dia.ejercicios) map[ej.id] = ej.series_actuales;
    return map;
  });

  // No persistir el valor de "series" tal cual queda al MONTAR: en ese
  // momento ya puede traer datos reales sin que el usuario haya tocado
  // nada -precarga de semana 1 en semana 2 (ver arriba), sesion ya
  // registrada, borrador remoto recien mezclado- y guardarlos de nuevo en
  // localStorage los disfraza de "tipeo local de este dispositivo". Bug
  // real que esto arregla: si el celular editaba algo y tocaba "Guardar
  // borrador", al abrir la PC (que nunca habia tipeado nada, solo tenia
  // la precarga de semana 1) el merge de borradores aplicaba primero el
  // remoto -con el cambio del celular- pero DESPUES el local de la PC,
  // que ya habia guardado en su propio localStorage la precarga sin
  // editar apenas montó - y esa carga local, al tener datos "reales" (no
  // vacios), pisaba el cambio recien traido del celular.
  //
  // Comparar por REFERENCIA contra el valor capturado al renderizar por
  // primera vez (en vez de "saltear solo la primera vez que corre el
  // efecto") es a proposito: en desarrollo, StrictMode invoca los efectos
  // de montaje dos veces, así que un contador/flag de "primera vez" ya se
  // gasta en esa primera invocación fantasma y el efecto persiste igual
  // en la segunda. `series` solo cambia de referencia cuando de verdad
  // hay un `setSeries` con datos distintos (los efectos de reconciliacion
  // de abajo devuelven la misma referencia si no hubo cambio real), asi
  // que esta comparacion es inmune a cuantas veces se invoque el efecto.
  const seriesInicialRef = useRef(series);
  useEffect(() => {
    if (series === seriesInicialRef.current) return;
    guardarBorrador(borradorKey, series);
  }, [borradorKey, series]);
  // El aviso "borrador guardado" es solo para el instante despues de
  // tocar el boton - si se sigue tipeando despues, deja de ser cierto.
  useEffect(() => { setBorradorGuardado(false); }, [series]);

  // Empuja lo tipeado hasta ahora (peso/reps/RIR/dropset) al backend, sin
  // registrar la sesion - para que se vea desde otro dispositivo (ej.
  // cargar la rutina en la compu en casa y despues abrirla en el celular
  // en el gimnasio). Antes esto solo vivia en localStorage de este mismo
  // dispositivo/navegador, asi que un DropSet tildado (o cualquier peso/
  // reps ya tipeado) no se veia del otro lado hasta recien registrar la
  // sesion entera.
  async function guardarBorradorRemoto() {
    setError('');
    setGuardandoBorrador(true);
    setBorradorGuardado(false);
    try {
      await api.put(`/dias/${dia.id}/borrador`, { microciclo_id: microciclo.id, valores: series });
      setBorradorGuardado(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardandoBorrador(false);
    }
  }

  // true si hay algun peso/reps ya tipeado en el dia actual (series reales,
  // no dropset) - para no pisarlo sin avisar al activar/desactivar el modo
  // express (bug real: antes esto pisaba el progreso ya cargado sin
  // preguntar nada, incluso si ya se habian tipeado series reales de hoy).
  function hayDatosTipeados() {
    return dia.ejercicios.some((ej) => (series[ej.id] || []).some((s) => s.peso !== '' || s.reps !== ''));
  }

  // Rutina Express: para cuando hay tiempo de ir al gimnasio pero no de
  // hacer el dia entero como esta planeado. No es una rutina aparte ni se
  // persiste en ningun lado -solo reescribe el estado local "series" de
  // este dia, como si el usuario hubiera tipeado todo esto a mano- asi que
  // no hace falta borrarla despues: si se registra la sesion, queda como
  // una sesion mas (igual que cualquier otra); si se abandona sin
  // registrar, es un borrador mas que se pisa la proxima vez que se entra.
  // Por ejercicio: 2 series reales al mismo peso que ya tenia (la 1ra con
  // el objetivo de reps de siempre, la 2da libre - sin reps fijadas) + 1
  // dropset a la mitad de ese peso. El descanso de 60s entre series 1 y 2
  // es solo una indicacion en el cartel de abajo, no se persiste (asi la
  // proxima semana el dia vuelve a su descanso normal sin tocar nada).
  function activarModoExpress() {
    if (hayDatosTipeados()) {
      setConfirmarCambioModo('activar');
      return;
    }
    aplicarModoExpress();
  }

  function aplicarModoExpress() {
    setSeries((prev) => {
      const copia = { ...prev };
      for (const ej of dia.ejercicios) {
        const peso = ej.peso_actual != null ? String(ej.peso_actual) : '';
        const pesoDropset = ej.peso_actual != null ? String(Math.round(ej.peso_actual) / 2) : '';
        copia[ej.id] = [
          { peso, reps: ej.piso_reps != null ? String(ej.piso_reps) : '', rir: 1, esDropset: false },
          { peso, reps: '', rir: 1, esDropset: false },
          { peso: pesoDropset, reps: '', rir: 1, esDropset: true },
        ];
      }
      return copia;
    });
    setModoExpress(true);
    setConfirmarCambioModo(null);
  }

  function desactivarModoExpress() {
    if (hayDatosTipeados()) {
      setConfirmarCambioModo('desactivar');
      return;
    }
    aplicarDesactivarModoExpress();
  }

  function aplicarDesactivarModoExpress() {
    setSeries(construirEstadoInicial(dia));
    setModoExpress(false);
    setConfirmarCambioModo(null);
  }

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

  // AjusteSeries (el +/- de "Series") cambia series_actuales en el backend y
  // refetchea la rutina, pero "series" ya tenia una entrada para ese
  // ejercicio desde el mount - sin esto, seriesPorEjercicio de arriba nunca
  // volvia a mirar series_actuales (el "??" no dispara con un array ya
  // existente) y la fila nueva/quitada no aparecia hasta recargar la pagina
  // entera. Agrega o saca filas reales al final (nunca toca las de dropset)
  // preservando lo que el usuario ya tipeo en las que quedan.
  const seriesActualesKey = dia.ejercicios.map((e) => `${e.id}:${e.series_actuales}`).join(',');
  useEffect(() => {
    setSeries((prev) => {
      let cambio = false;
      const copia = { ...prev };
      for (const ej of dia.ejercicios) {
        const actual = copia[ej.id];
        if (!actual) continue;
        const reales = actual.filter((s) => !s.esDropset);
        const dropsets = actual.filter((s) => s.esDropset);
        if (reales.length === ej.series_actuales) continue;
        cambio = true;
        const nuevasReales = reales.length < ej.series_actuales
          ? [...reales, ...Array.from({ length: ej.series_actuales - reales.length }, () => ({ peso: '', reps: '', rir: 1, esDropset: false }))]
          : reales.slice(0, ej.series_actuales);
        copia[ej.id] = [...nuevasReales, ...dropsets];
      }
      return cambio ? copia : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seriesActualesKey]);

  // Sustituir un ejercicio ("Cambiar ejercicio") cambia su ejercicio_id y le
  // fija un peso/piso de reps nuevos (via una serie de referencia que se
  // carga en un modal aparte, no en estos inputs) - pero mantiene el MISMO
  // ejercicio_asignado_id (mismo puesto en la rutina). Sin este reset, lo
  // que ya estuviera tipeado en "series" para ese id -del ejercicio VIEJO,
  // antes de sustituirlo- seguia mostrandose (y coloreandose contra el
  // peso/piso del ejercicio NUEVO), mezclando datos de dos ejercicios
  // distintos bajo el mismo casillero.
  const ejercicioIdKey = dia.ejercicios.map((e) => `${e.id}:${e.ejercicio_id}`).join(',');
  const ejercicioIdPrevioRef = useRef(ejercicioIdKey);
  useEffect(() => {
    const anteriores = Object.fromEntries(
      ejercicioIdPrevioRef.current.split(',').filter(Boolean).map((par) => par.split(':'))
    );
    ejercicioIdPrevioRef.current = ejercicioIdKey;
    const sustituidos = dia.ejercicios.filter(
      (ej) => anteriores[ej.id] != null && anteriores[ej.id] !== String(ej.ejercicio_id)
    );
    if (sustituidos.length === 0) return;
    setSeries((prev) => {
      const copia = { ...prev };
      for (const ej of sustituidos) copia[ej.id] = construirSeriesPorDefecto(ej);
      return copia;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ejercicioIdKey]);

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

  // Carga de una el peso de referencia (el mismo que ya se ve como
  // placeholder gris) y la baja de reps esperada en cada serie, para no
  // tener que tipearlos serie por serie. Pisa lo que ya este tipeado en las
  // filas reales (no toca las de dropset) - es una carga explicita, no un
  // autocompletado silencioso.
  function autocompletarReferencia(ejercicioId) {
    setSeries((prev) => {
      const ej = dia.ejercicios.find((e) => e.id === ejercicioId);
      const actuales = prev[ejercicioId] ?? seriesPorEjercicio[ejercicioId];
      if (!ej || ej.peso_actual == null || !actuales) return prev;
      const pesoRef = String(ej.peso_actual);
      const base = actuales.map((s) => (s.esDropset ? s : { ...s, peso: pesoRef, reps: '' }));
      const conReps = base.map((s, idx) => (s.esDropset ? s : { ...s, reps: calcularSugerenciaReps(ej, base, idx) ?? '' }));
      return { ...prev, [ejercicioId]: conReps };
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

  async function guardarOrdenArrastre(ids) {
    const orden = ids.map((id, i) => ({ ejercicio_asignado_id: id, orden: i + 1 }));
    try {
      await api.patch(`/dias/${dia.id}/orden`, { orden });
      onRutinaCambiada();
    } catch (err) {
      setError(err.message);
    }
  }

  const { ordenArrastre, arrastrandoId, cardRefs, iniciarArrastre } = useArrastreOrden(
    dia.ejercicios.map((ej) => ej.id),
    guardarOrdenArrastre
  );

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

      {!modoExpress && (
        <button
          type="button"
          onClick={activarModoExpress}
          className="self-start text-[12px] font-semibold text-accent underline underline-offset-2"
        >
          ⚡ Poco tiempo hoy — armar rutina express
        </button>
      )}
      {modoExpress && (
        <div className="bg-warning-bg text-warning text-[12.5px] rounded-lg px-3 py-2.5 flex items-center justify-between gap-2 flex-wrap">
          <span>
            <strong>Modo express:</strong> 2 series al mismo peso de siempre (la 2da sin objetivo de reps fijo)
            + 1 dropset a mitad de peso. Descansá 60s entre la serie 1 y la 2.
          </span>
          <button type="button" onClick={desactivarModoExpress} className="font-semibold underline underline-offset-2 whitespace-nowrap">
            Volver a la rutina normal
          </button>
        </div>
      )}

      {confirmarCambioModo && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => setConfirmarCambioModo(null)}
        >
          <div
            className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-3 w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-[15px] font-bold">Ya tenés datos cargados hoy</h2>
            <p className="text-[13px] text-text-muted leading-relaxed">
              {confirmarCambioModo === 'activar'
                ? 'Armar la rutina express va a reemplazar el peso y las reps que ya tipeaste en este día. ¿Seguro que querés continuar?'
                : 'Volver a la rutina normal va a reemplazar el peso y las reps que ya tipeaste en este día. ¿Seguro que querés continuar?'}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmarCambioModo(null)}
                className="flex-1 h-10 rounded-lg border border-border bg-bg text-text-muted text-[13px] font-semibold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => (confirmarCambioModo === 'activar' ? aplicarModoExpress() : aplicarDesactivarModoExpress())}
                className="flex-[2] h-10 rounded-lg border border-danger text-danger text-[13px] font-semibold"
              >
                Sí, reemplazar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 md:grid md:grid-cols-2 md:items-start md:gap-4">
        {ejerciciosMostrados.map((ej) => {
          const nota = notasPorEjercicio.get(ej.id);
          const esUltimoDelMusculo = dia.ejercicios.filter(
            (e) => e.musculo_objetivo_id === ej.musculo_objetivo_id
          ).length === 1;
          const seriesReferencia = seriesPactadasAlAbrir[ej.id] ?? ej.series_actuales;
          const { pesoColor, repsColores } = coloreadoActivo
            ? colorVsPactadoLive(seriesPorEjercicio[ej.id], ej, seriesReferencia)
            : { pesoColor: null, repsColores: [] };
          return (
            <div
              key={ej.id}
              ref={(node) => { cardRefs.current[ej.id] = node; }}
              className={`bg-surface border border-border rounded-[14px] p-4 flex flex-col gap-3 min-w-0 ${
                arrastrandoId === ej.id ? 'opacity-60 ring-2 ring-accent' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col gap-1">
                  <span
                    onPointerDown={(e) => iniciarArrastre(e, ej.id)}
                    // -m-3 p-3 agranda el area de agarre real (toque/click)
                    // bastante mas alla del texto sin correr el layout
                    // visual -el padding infla la caja, el margen negativo
                    // la vuelve a acomodar en el mismo lugar-: antes el
                    // target era solo la altura de una linea de texto
                    // (~20px), muy chico para agarrar comodo con el dedo.
                    className="flex items-center gap-1.5 -m-3 p-3 cursor-grab active:cursor-grabbing select-none"
                    style={{ touchAction: 'none' }}
                    title="Mantené presionado para reordenar"
                  >
                    <span aria-hidden="true" className="text-[19px] leading-none text-text-faint">⠿</span>
                    <span className="text-[14.5px] font-semibold">{ej.ejercicio_nombre}</span>
                  </span>
                  <span className="text-[12px] text-text-faint whitespace-nowrap">
                    {ej.rango_reps_min}–{ej.rango_reps_max} reps · Descanso {ej.descanso_segundos}s
                  </span>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <span className="text-[11px] font-semibold text-text-muted bg-bg border border-border rounded-md px-2 py-0.5 uppercase">
                    {formatearMusculo(ej.musculo_nombre)}
                  </span>
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
                      className={`w-full min-w-0 h-9 rounded-lg border bg-bg px-2 tabular text-[13.5px] text-center outline-none focus:border-accent placeholder:text-text-faint ${
                        !s.esDropset && s.peso !== '' && s.peso != null ? colorClaseInput(pesoColor) : 'border-border'
                      }`}
                    />
                    <input
                      type="number" inputMode="numeric" value={s.reps}
                      placeholder={sugerenciaReps}
                      onChange={(e) => actualizarSerie(ej.id, idx, 'reps', e.target.value)}
                      className={`w-full min-w-0 h-9 rounded-lg border bg-bg px-2 tabular text-[13.5px] text-center outline-none focus:border-accent placeholder:text-text-faint ${
                        !s.esDropset ? colorClaseInput(repsColores[idx]) : 'border-border'
                      }`}
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
                onAutocompletar={() => autocompletarReferencia(ej.id)}
                todosMusculos={todosMusculos}
              />
            </div>
          );
        })}

        <AgregarEjercicioDia diaRutinaId={dia.id} musculos={todosMusculos} onAgregado={onRutinaCambiada} />
      </div>

      {error && <p className="text-[13px] text-danger">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={guardarBorradorRemoto}
          disabled={guardandoBorrador}
          className="h-11 px-3.5 rounded-[10px] border border-accent text-accent text-[13px] font-semibold disabled:opacity-60 whitespace-nowrap"
        >
          {guardandoBorrador ? 'Guardando…' : 'Guardar borrador'}
        </button>
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
      {borradorGuardado && (
        <p className="text-[12.5px] text-text-muted text-center">
          Borrador guardado - ya lo podés ver desde otro dispositivo.
        </p>
      )}
    </>
  );
}

function EjercicioAcciones({ ejercicio, usuario, onCambiado, diasHermanos, esUltimoDelMusculo, dropsetActivo, onToggleDropset, onAutocompletar, todosMusculos }) {
  const advertenciaQuitar = ejercicio.es_top_de_musculo || esUltimoDelMusculo
    ? `Este es el ejercicio ${ejercicio.es_top_de_musculo ? 'principal' : 'único'} de ${CAPITALIZAR(formatearMusculo(ejercicio.musculo_nombre))} en este día. ¿Seguro que querés quitarlo?`
    : null;
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [mostrarSustituir, setMostrarSustituir] = useState(false);
  const [mostrarPeso, setMostrarPeso] = useState(false);
  const [mostrarDescanso, setMostrarDescanso] = useState(false);
  const [mostrarMoverCopiar, setMostrarMoverCopiar] = useState(false);
  const [mostrarEditarNombre, setMostrarEditarNombre] = useState(false);
  const [mostrarSecundarios, setMostrarSecundarios] = useState(false);
  const [error, setError] = useState('');
  const menuRef = useRef(null);

  // Cerrar el menú "⋯" al tocar afuera - las acciones que abre (Peso base,
  // Descanso, etc.) quedan visibles debajo de la tarjeta, así que un click
  // en cualquier otro lado de la pantalla debe cerrarlo primero.
  useEffect(() => {
    if (!menuAbierto) return;
    function onClickFuera(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuAbierto(false);
    }
    // Scrollear tambien lo cierra (no solo tocar afuera) - al ser
    // position:absolute, el menu no sigue a la tarjeta y queda flotando en
    // cualquier lado si no se cierra solo.
    function onScroll() {
      setMenuAbierto(false);
    }
    window.addEventListener('mousedown', onClickFuera);
    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => {
      window.removeEventListener('mousedown', onClickFuera);
      window.removeEventListener('scroll', onScroll, { capture: true });
    };
  }, [menuAbierto]);

  function abrir(setter) {
    setMenuAbierto(false);
    setter(true);
  }

  return (
    <div className="flex flex-col gap-2 pt-1 border-t border-border -mx-4 px-4">
      <div className="flex items-center justify-between gap-2 pt-2">
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
          <button
            type="button"
            onClick={onAutocompletar}
            disabled={ejercicio.peso_actual == null}
            title="Cargar el peso y las reps de referencia en todas las series"
            className="text-[11px] font-semibold text-accent underline underline-offset-2 whitespace-nowrap disabled:opacity-40 disabled:no-underline"
          >
            Autocompletar
          </button>
        </div>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuAbierto((v) => !v)}
            className="w-7 h-7 rounded-md border border-border bg-surface text-text-muted text-[15px] leading-none flex items-center justify-center"
            title="Más acciones"
          >
            ⋯
          </button>
          {menuAbierto && (
            <div className="absolute right-0 top-full mt-1 z-20 w-48 bg-surface border border-border rounded-lg shadow-lg py-1 flex flex-col">
              <ComentarioBoton
                endpoint={`/ejercicios/${ejercicio.id}/comentario`}
                comentarioActual={ejercicio.comentario}
                recordarActual={ejercicio.comentario_recordar}
                onGuardado={onCambiado}
                variante="menu"
              />
              <button
                type="button"
                onClick={() => abrir(setMostrarSustituir)}
                className="text-left px-3 py-2 text-[13px] text-text-muted hover:bg-bg"
              >
                Cambiar ejercicio
              </button>
              <button
                type="button"
                onClick={() => abrir(setMostrarPeso)}
                className="text-left px-3 py-2 text-[13px] text-text-muted hover:bg-bg"
              >
                Peso base
              </button>
              <button
                type="button"
                onClick={() => abrir(setMostrarDescanso)}
                className="text-left px-3 py-2 text-[13px] text-text-muted hover:bg-bg"
              >
                Descanso
              </button>
              <button
                type="button"
                onClick={() => abrir(setMostrarSecundarios)}
                className="text-left px-3 py-2 text-[13px] text-text-muted hover:bg-bg"
              >
                Músculos secundarios
              </button>
              {diasHermanos?.length > 0 && (
                <button
                  type="button"
                  onClick={() => abrir(setMostrarMoverCopiar)}
                  className="text-left px-3 py-2 text-[13px] text-text-muted hover:bg-bg"
                >
                  Mover/copiar
                </button>
              )}
              {ejercicio.patron_movimiento === 'personalizado' && (
                <button
                  type="button"
                  onClick={() => abrir(setMostrarEditarNombre)}
                  className="text-left px-3 py-2 text-[13px] text-text-muted hover:bg-bg"
                >
                  Editar nombre
                </button>
              )}
              <div className="border-t border-border my-1" />
              <div className="px-3 py-1.5">
                <QuitarEjercicioBoton
                  ejercicioAsignadoId={ejercicio.id}
                  nombreEjercicio={ejercicio.ejercicio_nombre}
                  tieneSeries={Boolean(ejercicio.tiene_series)}
                  onQuitado={() => { setMenuAbierto(false); onCambiado(); }}
                  advertencia={advertenciaQuitar}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {mostrarPeso && (
        <div className="flex justify-end">
          <AjustePeso
            ejercicioId={ejercicio.id}
            pesoActual={ejercicio.peso_actual}
            onAjustado={() => { setMostrarPeso(false); onCambiado(); }}
          />
        </div>
      )}
      {mostrarDescanso && (
        <div className="flex justify-end">
          <AjusteDescanso
            ejercicioId={ejercicio.id}
            descansoSegundos={ejercicio.descanso_segundos}
            onAjustado={() => { setMostrarDescanso(false); onCambiado(); }}
          />
        </div>
      )}
      {mostrarSecundarios && (
        <div className="flex justify-end">
          <AjusteMusculosSecundarios
            ejercicio={ejercicio}
            todosMusculos={todosMusculos}
            onAjustado={() => { setMostrarSecundarios(false); onCambiado(); }}
          />
        </div>
      )}
      {mostrarMoverCopiar && (
        <div className="flex justify-end">
          <MoverCopiarEjercicio
            ejercicioId={ejercicio.id}
            ejercicioCatalogoId={ejercicio.ejercicio_id}
            diasHermanos={diasHermanos}
            onListo={() => { setMostrarMoverCopiar(false); onCambiado(); }}
            onError={setError}
          />
        </div>
      )}
      {mostrarEditarNombre && (
        <div className="flex justify-end">
          <EditarNombreParticular
            ejercicioId={ejercicio.id}
            nombreActual={ejercicio.ejercicio_nombre}
            onEditado={() => { setMostrarEditarNombre(false); onCambiado(); }}
          />
        </div>
      )}

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

const FASE_LABEL = { volumen: 'Volumen', definicion: 'Definición', mantenimiento: 'Mantenimiento' };
const FASE_CLASE = {
  volumen: 'bg-success-bg text-success border-success',
  definicion: 'bg-warning-bg text-warning border-warning',
  mantenimiento: 'bg-bg text-text-muted border-border',
};

// Fase nutricional que el usuario dice estar llevando esta semana
// (volumen/definicion/mantenimiento) - puramente informativo para que se
// vea de un vistazo en Entrenamiento, no afecta al motor de progresion.
function FaseNutricional({ rutinaId, faseActual, onCambiada }) {
  const [enviando, setEnviando] = useState(false);

  async function cambiar(fase) {
    setEnviando(true);
    try {
      await api.patch(`/rutinas/${rutinaId}/fase-nutricional`, { fase: fase || null });
      onCambiada();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <select
      value={faseActual || ''}
      onChange={(e) => cambiar(e.target.value)}
      disabled={enviando}
      title="Fase nutricional esta semana"
      className={`text-[11px] font-semibold rounded-full pl-2.5 pr-1.5 py-1 border outline-none disabled:opacity-60 ${
        faseActual ? FASE_CLASE[faseActual] : 'bg-bg text-text-faint border-border'
      }`}
    >
      <option value="">Fase: sin definir</option>
      <option value="volumen">{FASE_LABEL.volumen}</option>
      <option value="definicion">{FASE_LABEL.definicion}</option>
      <option value="mantenimiento">{FASE_LABEL.mantenimiento}</option>
    </select>
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

// Hasta 2 musculos secundarios elegidos a mano para ESTE ejercicio puntual -
// se suman a los que ya trae el catalogo (no los reemplazan), para cuando
// el catalogo no capta bien lo que el ejercicio le pega a un musculo, o
// para un ejercicio "particular" sin dato de catalogo. Se usan para
// discriminar reps efectivas directas/indirectas por musculo en Progreso.
function AjusteMusculosSecundarios({ ejercicio, todosMusculos, onAjustado }) {
  const [elegidos, setElegidos] = useState(() => {
    try {
      return JSON.parse(ejercicio.musculos_secundarios_json || '[]');
    } catch {
      return [];
    }
  });
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  function toggle(nombre) {
    setElegidos((prev) => {
      if (prev.includes(nombre)) return prev.filter((m) => m !== nombre);
      if (prev.length >= 2) return prev;
      return [...prev, nombre];
    });
  }

  async function confirmar() {
    setEnviando(true);
    setError('');
    try {
      await api.patch(`/ejercicios/${ejercicio.id}/musculos-secundarios`, { musculos: elegidos });
      onAjustado();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  const opciones = (todosMusculos || []).filter((m) => m.nombre !== ejercicio.musculo_nombre);

  return (
    <div className="flex flex-col gap-2 items-end">
      <span className="text-[11px] text-text-faint">Hasta 2, además de los que ya trae el ejercicio</span>
      <div className="flex gap-1.5 flex-wrap justify-end max-w-xs">
        {opciones.map((m) => {
          const activo = elegidos.includes(m.nombre);
          return (
            <button
              key={m.nombre}
              type="button"
              onClick={() => toggle(m.nombre)}
              disabled={!activo && elegidos.length >= 2}
              className={`px-2.5 h-7 rounded-full border text-[11px] font-medium disabled:opacity-40 ${
                activo ? 'bg-accent text-accent-fg border-accent' : 'bg-surface border-border text-text-muted'
              }`}
            >
              {formatearMusculo(m.nombre)}
            </button>
          );
        })}
      </div>
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
// Antes de mover/copiar, si el dia destino ya tiene un ejercicio_asignado
// del mismo ejercicio_id (ver ejercicioCatalogoId), el backend rechaza con
// 409 a menos que mandemos reemplazar:true - en vez de esperar ese rechazo,
// nos fijamos de una en diasHermanos[].ejercicios (que ya tenemos en
// memoria) y le preguntamos al usuario antes de mandar nada.
function MoverCopiarEjercicio({ ejercicioId, ejercicioCatalogoId, diasHermanos, onListo, onError }) {
  const [modo, setModo] = useState('mover');
  const [enviando, setEnviando] = useState(null);
  const [confirmarConflicto, setConfirmarConflicto] = useState(null);

  async function enviar(diaRutinaId, reemplazar) {
    setEnviando(diaRutinaId);
    onError('');
    try {
      await api.post(`/ejercicios/${ejercicioId}/${modo === 'mover' ? 'mover' : 'copiar'}`, {
        dia_rutina_id: diaRutinaId,
        reemplazar,
      });
      onListo();
    } catch (err) {
      onError(err.message);
    } finally {
      setEnviando(null);
      setConfirmarConflicto(null);
    }
  }

  function elegirDia(d) {
    const conflicto = d.ejercicios?.find((e) => e.ejercicio_id === ejercicioCatalogoId);
    if (conflicto) {
      setConfirmarConflicto({ dia: d, nombreExistente: conflicto.ejercicio_nombre });
      return;
    }
    enviar(d.id, false);
  }

  if (confirmarConflicto) {
    return (
      <div className="flex flex-col gap-2 bg-bg border border-border rounded-lg p-2.5 max-w-[260px]">
        <span className="text-[12px] text-warning leading-relaxed">
          {CAPITALIZAR(confirmarConflicto.dia.dia_semana)} ya tiene "{confirmarConflicto.nombreExistente}" — ¿lo reemplazás?
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setConfirmarConflicto(null)}
            className="flex-1 h-8 rounded-md border border-border bg-surface text-text-muted text-[12px] font-semibold"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={enviando !== null}
            onClick={() => enviar(confirmarConflicto.dia.id, true)}
            className="flex-1 h-8 rounded-md bg-danger text-white text-[12px] font-semibold disabled:opacity-60"
          >
            {enviando !== null ? 'Guardando…' : 'Reemplazar'}
          </button>
        </div>
      </div>
    );
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
            onClick={() => elegirDia(d)}
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
// variante="menu": mismo componente pero con la tipografia/padding de una
// fila de menu colapsado (ver EjercicioAcciones) en vez del link subrayado
// que usan "Comentario del dia" y demas usos sueltos.
function ComentarioBoton({ endpoint, comentarioActual, recordarActual, onGuardado, etiqueta, variante }) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState(comentarioActual || '');
  const [recordar, setRecordar] = useState(Boolean(recordarActual));
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const comoItemMenu = variante === 'menu';

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
    <div className={comoItemMenu ? 'flex flex-col' : 'flex flex-col gap-1.5'}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className={comoItemMenu
          ? 'text-left px-3 py-2 text-[13px] text-text-muted hover:bg-bg'
          : 'self-start text-[11px] font-medium text-text-muted underline underline-offset-2 whitespace-nowrap'}
      >
        {comentarioActual ? 'Editar comentario' : (etiqueta || 'Comentario')}
      </button>
      {abierto && (
        <div className={`flex flex-col gap-2 bg-bg border border-border rounded-lg p-2.5 ${comoItemMenu ? 'mx-3 mb-2' : 'min-w-[220px]'}`}>
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

// Mezcla un borrador (del backend o de localStorage, misma forma: {
// [ejercicioAsignadoId]: [{peso,reps,rir,esDropset}, ...] }) encima de
// `base` (mutandola in-place) - usado dos veces en cascada al armar el
// estado inicial de RegistroDia (ver mas abajo), primero con el borrador
// del backend y despues con el de localStorage, para que el tipeo local
// mas reciente (si lo hay) gane por sobre lo ultimo empujado al servidor.
//
// Solo pisa una fila si esa fila tiene ALGO realmente tipeado (peso o
// reps no vacios) - si no, se deja lo que ya estaba en `base` (que puede
// venir de una pasada anterior de esta misma funcion, ej. el borrador del
// backend). Esto es clave para el segundo llamado (localStorage): el
// simple hecho de abrir la pantalla en un dispositivo ya deja un borrador
// local vacio guardado (mismo useEffect que lo persiste en cada cambio,
// incluido el montaje inicial) - sin este chequeo, ese borrador vacio
// pisaria con strings vacios lo que se acababa de traer del backend
// (cargado en OTRO dispositivo), haciendo parecer que nunca llego nada.
function aplicarBorradorEnBase(base, borrador) {
  for (const [ejId, sets] of Object.entries(borrador)) {
    if (!base[ejId]) continue;
    sets.forEach((s, idx) => {
      const tieneAlgoTipeado = (s.peso !== '' && s.peso != null) || (s.reps !== '' && s.reps != null);
      if (!tieneAlgoTipeado) return;
      if (base[ejId][idx]) {
        base[ejId][idx] = { ...base[ejId][idx], ...s };
      } else if (s.esDropset) {
        // La fila de dropset no forma parte de series_actuales (es una
        // serie extra) - el merge de arriba la saltea porque no hay indice
        // previo con el que mezclarla, y se perdia silenciosamente si se
        // recargaba la pagina antes de guardar la sesion.
        base[ejId] = [...base[ejId], { peso: '', reps: '', rir: 1, esDropset: false, ...s }];
      }
    });
  }
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
