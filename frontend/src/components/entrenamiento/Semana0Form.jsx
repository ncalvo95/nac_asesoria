import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client.js';
import { useArrastreOrden } from '../../hooks/useArrastreOrden.js';
import { formatearMusculo } from '../../utils/musculo.js';
import { CAPITALIZAR, leerBorrador, guardarBorrador, borrarBorrador, elegirDiaInicial, fechaParaDia, formatearFechaCorta } from '../../utils/entrenamiento.js';
import { NumberField } from './NumberField.jsx';
import { AgregarEjercicioDia } from './AgregarEjercicioDia.jsx';
import { QuitarEjercicioBoton } from './QuitarEjercicioBoton.jsx';
import { ExportarExcel } from './ExportarExcel.jsx';

export function Semana0Form({ rutina, usuario, microciclo, onListo, todosMusculos }) {
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

export function CambiarEjercicioSemana0({ ejercicio, onSustituido }) {
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
