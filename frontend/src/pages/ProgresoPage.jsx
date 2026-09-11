import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api, API_BASE } from '../api/client.js';
import { formatearMusculo } from '../utils/musculo.js';

const TIPO_LABEL = {
  objetivo: 'Objetivo',
  disponibilidad: 'Disponibilidad',
  equipamiento: 'Equipamiento',
  rutina_auto: 'Generar rutina (automática)',
  rutina_manual: 'Generar rutina (manual)',
  rutina_split: 'Generar rutina (split personalizado)',
};

export default function ProgresoPage() {
  const { usuario: sesion } = useAuth();
  const { usuarioId: usuarioIdParam } = useParams();
  const usuario = usuarioIdParam ? { id: Number(usuarioIdParam) } : sesion;
  const esPropioCliente = !usuarioIdParam && sesion.rol === 'cliente';
  const [rutina, setRutina] = useState(null);
  const [progreso, setProgreso] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [cerrando, setCerrando] = useState(false);
  const [deload, setDeload] = useState(null);
  const [pidiendoDeload, setPidiendoDeload] = useState(false);
  const [testeos, setTesteos] = useState([]);
  const [pidiendoTesteo, setPidiendoTesteo] = useState(false);

  async function cargar() {
    setCargando(true);
    setError('');
    try {
      const r = await api.get(`/usuarios/${usuario.id}/rutina`);
      setRutina(r);
      const p = await api.get(`/rutinas/${r.id}/progreso`);
      setProgreso(p);
      const d = await api.get(`/rutinas/${r.id}/deload/actual`).catch(() => null);
      setDeload(d);
      const t = await api.get(`/rutinas/${r.id}/testeos`).catch(() => []);
      setTesteos(t.filter((x) => x.ejercicios.length > 0));
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  // Transforma DE VERDAD la semana en curso en una semana de descarga - no
  // hay vuelta atras, por eso la confirmacion explicita antes de llamar al
  // backend.
  async function marcarDescarga() {
    if (!window.confirm(
      'Esta semana será transformada en tu semana de descarga, esta acción no tiene marcha atrás. ' +
      'Luego de la descarga, se retomará la rutina desde el último microciclo completado.'
    )) return;
    setPidiendoDeload(true);
    setError('');
    try {
      const d = await api.post(`/rutinas/${rutina.id}/deload`);
      setDeload(d);
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setPidiendoDeload(false);
    }
  }

  // Convierte la semana en curso en una nueva semana de testeo (2 series por
  // ejercicio) para recalibrar peso/reps sin perder la rutina - se completa
  // despues en la pantalla de Entrenamiento, igual que la semana 0 original.
  async function pedirNuevoTesteo() {
    if (!window.confirm(
      'Esto convierte la semana actual en una nueva semana de testeo (2 series por ejercicio) para recalibrar peso y reps desde cero. ' +
      'Vas a poder compararla con testeos anteriores. La vas a completar en la pantalla de Entrenamiento. ¿Confirmás?'
    )) return;
    setPidiendoTesteo(true);
    setError('');
    try {
      await api.post(`/rutinas/${rutina.id}/testeo`);
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setPidiendoTesteo(false);
    }
  }

  useEffect(() => { cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [usuario.id]);

  async function cerrarMicrociclo() {
    const actual = rutina.microciclos.find((m) => m.estado === 'en_curso');
    if (!actual || actual.tipo === 'testeo') return;
    setCerrando(true);
    setError('');
    try {
      await api.post(`/rutinas/${rutina.id}/microciclos/${actual.numero}/cerrar`);
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setCerrando(false);
    }
  }

  if (cargando) return <div className="p-6 text-sm text-text-muted">Cargando…</div>;
  if (!rutina) return null;

  const actual = rutina.microciclos.find((m) => m.estado === 'en_curso');
  const enTesteo = actual?.tipo === 'testeo';
  const enDescarga = actual?.tipo === 'descarga';
  const puedeCerrar = actual && actual.numero >= 1 && !enTesteo;
  const puedePedirDescargaOTesteo = actual && actual.numero >= 1 && !enTesteo && !enDescarga;

  return (
    <div className="flex flex-col gap-6 p-4 pb-8">
      {esPropioCliente && sesion.coach_id != null && <AprobacionCoach usuario={sesion} />}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[17px] font-bold">Progreso</h1>
          <p className="text-[12px] text-text-muted mt-0.5">
            {progreso?.microciclo?.numero > 0
              ? `Último cierre: microciclo ${progreso.microciclo.numero}`
              : progreso?.microciclo
              ? 'Semana 0 de testeo completada'
              : 'Todavía no cerraste ningún microciclo'}
          </p>
        </div>
        <a
          href={`${API_BASE}/rutinas/${rutina.id}/export.xlsx`}
          className="text-[12.5px] font-semibold text-accent border border-accent rounded-lg px-3 py-2"
        >
          Exportar Excel
        </a>
      </div>

      {enTesteo && (
        <p className="text-[13px] text-text-muted leading-relaxed bg-surface border border-border rounded-xl p-3.5">
          Tenés una semana de testeo en curso - completala desde <strong>Entrenamiento</strong> para que la rutina siga.
        </p>
      )}

      {puedeCerrar && (
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={cerrarMicrociclo}
            disabled={cerrando}
            className="flex-1 h-11 rounded-[10px] bg-accent text-accent-fg text-[14px] font-semibold disabled:opacity-60"
          >
            {cerrando ? 'Cerrando…' : `Cerrar microciclo ${actual.numero}`}
          </button>
          {puedePedirDescargaOTesteo && (
            <>
              <button
                onClick={marcarDescarga}
                disabled={pidiendoDeload}
                className="h-11 px-4 rounded-[10px] border border-border bg-surface text-text-muted text-[13px] font-semibold disabled:opacity-60"
              >
                {pidiendoDeload ? 'Marcando…' : 'Marcar semana de descarga'}
              </button>
              <button
                onClick={pedirNuevoTesteo}
                disabled={pidiendoTesteo}
                className="h-11 px-4 rounded-[10px] border border-border bg-surface text-text-muted text-[13px] font-semibold disabled:opacity-60"
              >
                {pidiendoTesteo ? 'Marcando…' : 'Nueva semana de testeo'}
              </button>
            </>
          )}
        </div>
      )}

      {error && <p className="text-[13px] text-danger">{error}</p>}

      {deload && enDescarga && (
        <section className="flex flex-col gap-3">
          <span className="text-[13px] font-semibold text-text-muted tracking-wide">SEMANA DE DESCARGA</span>
          <p className="text-[12px] text-text-muted leading-relaxed -mt-1">
            Esta semana entrenás con esto en vez de tus series normales. Al cerrarla, la rutina retoma exactamente donde estaba antes de la descarga.
          </p>
          <div className="flex flex-col gap-2.5">
            {deload.detalle.map((d) => (
              <div key={d.ejercicio_asignado_id} className="bg-surface border border-border rounded-xl p-3.5 flex flex-col gap-2">
                <span className="text-[13px] font-semibold">{d.ejercicio_nombre}</span>
                <div className="flex gap-1.5 flex-wrap">
                  {d.series_detalle.map((s) => (
                    <span key={s.numero_serie} className="tabular text-[12px] bg-bg border border-border rounded-md px-2 py-1">
                      S{s.numero_serie}: {s.peso}kg × {s.meta_reps}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {testeos.length >= 2 && (
        <section className="flex flex-col gap-3">
          <span className="text-[13px] font-semibold text-text-muted tracking-wide">COMPARAR SEMANAS DE TESTEO</span>
          <div className="flex flex-col gap-3">
            {testeos.map((t) => (
              <div key={t.microciclo.id} className="bg-surface border border-border rounded-xl p-3.5 flex flex-col gap-2">
                <span className="text-[12.5px] font-semibold text-text-muted">
                  {t.microciclo.numero === 0 ? 'Testeo inicial' : `Testeo repetido (semana ${t.microciclo.numero})`}
                  {t.microciclo.fecha_fin && ` · ${t.microciclo.fecha_fin}`}
                </span>
                <div className="flex flex-col gap-1.5">
                  {t.ejercicios.map((e) => (
                    <div key={e.ejercicio_asignado_id} className="flex items-center justify-between gap-2 text-[12.5px]">
                      <span className="text-text-muted">{e.ejercicio_nombre}</span>
                      <span className="tabular font-semibold whitespace-nowrap">
                        {e.peso}kg · {e.reps_serie1}/{e.reps_serie2} reps
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {progreso?.musculos?.length > 0 && (
        <section className="flex flex-col gap-3">
          <span className="text-[13px] font-semibold text-text-muted tracking-wide">VOLUMEN SEMANAL POR MÚSCULO</span>
          <div className="flex flex-col gap-3">
            {progreso.musculos.map((m) => {
              const pct = Math.min(100, Math.round((m.volumen_directo / m.mav) * 100));
              const color = m.cerca_de_mav ? 'var(--color-danger)' : pct >= 75 ? 'var(--color-warning)' : 'var(--color-accent)';
              const valueColor = m.cerca_de_mav ? 'text-danger' : pct >= 75 ? 'text-warning' : 'text-text-faint';
              const dropset = progreso.dropsets?.find((d) => d.nombre === m.nombre);
              return (
                <div key={m.nombre} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-semibold capitalize">{formatearMusculo(m.nombre)}</span>
                    <span className={`tabular text-[12px] font-bold ${valueColor}`}>
                      {m.volumen_directo}<span className="text-text-faint font-medium"> / {m.mav} series</span>
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-track overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                  </div>
                  <span className="tabular text-[11px] text-text-faint">
                    {m.reps_efectivas} reps efectivas en el bloque
                    {dropset && <> · {dropset.reps_efectivas} de dropset</>}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {progreso?.ejercicios?.some((e) => e.nota) && (
        <section className="flex flex-col gap-3">
          <span className="text-[13px] font-semibold text-text-muted tracking-wide">AL CIERRE DEL MICROCICLO</span>
          <div className="flex flex-col gap-2.5">
            {progreso.ejercicios.filter((e) => e.nota).map((e) => (
              <div
                key={e.id}
                className={`rounded-xl p-3.5 flex gap-2.5 ${e.mejoro ? 'bg-success-bg' : e.serie_agregada ? 'bg-warning-bg' : 'bg-surface border border-border'}`}
              >
                <div
                  className="w-2 h-2 rounded-full mt-1.5 flex-none"
                  style={{ background: e.mejoro ? 'var(--color-success)' : e.serie_agregada ? 'var(--color-warning)' : 'var(--color-text-faint)' }}
                />
                <div className="flex flex-col gap-0.5">
                  <span className="text-[13px] font-semibold">{e.ejercicio_nombre}</span>
                  <span className="text-[12px] text-text-muted leading-relaxed">{e.nota}</span>
                  <span className="tabular text-[11px] text-text-faint">{e.reps_efectivas} reps efectivas</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {!progreso?.microciclo && (
        <p className="text-[13px] text-text-muted">
          Cuando cierres tu primer microciclo (después de completar semana 1 y 2), acá vas a ver el volumen por músculo y qué ejercicios progresaron o se estancaron.
        </p>
      )}
    </div>
  );
}

// Toggle "que mi coach apruebe mis cambios de programacion" + lista de
// solicitudes propias (para saber que esta esperando aprobacion). Solo se
// muestra si el usuario es un cliente viendo su propio progreso y tiene un
// coach asignado - ver debeQuedarPendiente en solicitudCambio.js.
function AprobacionCoach({ usuario }) {
  const [activo, setActivo] = useState(Boolean(usuario.requiere_aprobacion_coach));
  const [solicitudes, setSolicitudes] = useState([]);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    api.get(`/usuarios/${usuario.id}/solicitudes`).then(setSolicitudes).catch(() => {});
  }, [usuario.id]);

  const pendientes = solicitudes.filter((s) => s.estado === 'pendiente');

  async function toggle() {
    setGuardando(true);
    try {
      const nuevo = !activo;
      await api.patch(`/usuarios/${usuario.id}/aprobacion-coach`, { activo: nuevo });
      setActivo(nuevo);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="flex flex-col gap-2.5 bg-surface border border-border rounded-xl p-3.5">
      <label className="flex items-center justify-between gap-3">
        <span className="text-[12.5px] text-text-muted leading-snug">
          Que mi coach apruebe mis cambios de objetivo, disponibilidad, equipamiento y rutina
        </span>
        <button
          type="button"
          onClick={toggle}
          disabled={guardando}
          className={`flex-none w-11 h-6 rounded-full transition-colors relative disabled:opacity-60 ${activo ? 'bg-accent' : 'bg-border'}`}
        >
          <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-surface transition-transform ${activo ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
        </button>
      </label>
      {pendientes.length > 0 && (
        <div className="flex flex-col gap-1 pt-1 border-t border-border">
          <span className="text-[11.5px] font-semibold text-warning uppercase tracking-wide">
            Esperando aprobación
          </span>
          {pendientes.map((s) => (
            <span key={s.id} className="text-[12px] text-text-muted">
              {TIPO_LABEL[s.tipo] || s.tipo}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
