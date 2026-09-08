import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api/client.js';

export default function ProgresoPage() {
  const { usuario: sesion } = useAuth();
  const { usuarioId: usuarioIdParam } = useParams();
  const usuario = usuarioIdParam ? { id: Number(usuarioIdParam) } : sesion;
  const [rutina, setRutina] = useState(null);
  const [progreso, setProgreso] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [cerrando, setCerrando] = useState(false);
  const [deload, setDeload] = useState(null);
  const [pidiendoDeload, setPidiendoDeload] = useState(false);

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
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  async function pedirDeload() {
    setPidiendoDeload(true);
    setError('');
    try {
      const d = await api.post(`/rutinas/${rutina.id}/deload`);
      setDeload(d);
    } catch (err) {
      setError(err.message);
    } finally {
      setPidiendoDeload(false);
    }
  }

  useEffect(() => { cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [usuario.id]);

  async function cerrarMicrociclo() {
    const actual = rutina.microciclos.find((m) => m.estado === 'en_curso');
    if (!actual || actual.numero === 0) return;
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
  const puedeCerrar = actual && actual.numero >= 1;

  return (
    <div className="flex flex-col gap-6 p-4 pb-8">
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
          href={`/api/rutinas/${rutina.id}/export.xlsx`}
          className="text-[12.5px] font-semibold text-accent border border-accent rounded-lg px-3 py-2"
        >
          Exportar Excel
        </a>
      </div>

      {puedeCerrar && (
        <div className="flex gap-2">
          <button
            onClick={cerrarMicrociclo}
            disabled={cerrando}
            className="flex-1 h-11 rounded-[10px] bg-accent text-accent-fg text-[14px] font-semibold disabled:opacity-60"
          >
            {cerrando ? 'Cerrando…' : `Cerrar microciclo ${actual.numero}`}
          </button>
          {!deload && (
            <button
              onClick={pedirDeload}
              disabled={pidiendoDeload}
              className="h-11 px-4 rounded-[10px] border border-border bg-surface text-text-muted text-[13px] font-semibold disabled:opacity-60"
            >
              {pidiendoDeload ? 'Calculando…' : 'Pedir descarga'}
            </button>
          )}
        </div>
      )}

      {error && <p className="text-[13px] text-danger">{error}</p>}

      {deload && (
        <section className="flex flex-col gap-3">
          <span className="text-[13px] font-semibold text-text-muted tracking-wide">SEMANA DE DESCARGA</span>
          <p className="text-[12px] text-text-muted leading-relaxed -mt-1">
            Reemplazá tus series normales por esto durante esta semana. El piso y el techo del microciclo no se tocan.
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

      {progreso?.musculos?.length > 0 && (
        <section className="flex flex-col gap-3">
          <span className="text-[13px] font-semibold text-text-muted tracking-wide">VOLUMEN SEMANAL POR MÚSCULO</span>
          <div className="flex flex-col gap-3">
            {progreso.musculos.map((m) => {
              const pct = Math.min(100, Math.round((m.volumen_directo / m.mav) * 100));
              const color = m.cerca_de_mav ? 'var(--color-danger)' : pct >= 75 ? 'var(--color-warning)' : 'var(--color-accent)';
              const valueColor = m.cerca_de_mav ? 'text-danger' : pct >= 75 ? 'text-warning' : 'text-text-faint';
              return (
                <div key={m.nombre} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-semibold capitalize">{m.nombre}</span>
                    <span className={`tabular text-[12px] font-bold ${valueColor}`}>
                      {m.volumen_directo}<span className="text-text-faint font-medium"> / {m.mav} series</span>
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-track overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                  </div>
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
