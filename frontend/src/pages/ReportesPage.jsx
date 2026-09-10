import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api/client.js';

export default function ReportesPage() {
  const { usuario: sesion } = useAuth();
  const { usuarioId: usuarioIdParam } = useParams();
  const usuario = usuarioIdParam ? { id: Number(usuarioIdParam) } : sesion;

  const [reportes, setReportes] = useState(null);
  const [abierto, setAbierto] = useState(null);
  const [error, setError] = useState('');
  const [generando, setGenerando] = useState(false);

  async function cargarLista() {
    try {
      setReportes(await api.get(`/usuarios/${usuario.id}/reportes`));
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => { cargarLista(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [usuario.id]);

  async function generar(tipo) {
    setGenerando(true);
    setError('');
    try {
      const r = await api.post(`/usuarios/${usuario.id}/reportes`, { tipo });
      setAbierto(r);
      await cargarLista();
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerando(false);
    }
  }

  async function abrir(id) {
    if (abierto?.id === id) { setAbierto(null); return; }
    try {
      setAbierto(await api.get(`/usuarios/${usuario.id}/reportes/${id}`));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="flex flex-col gap-6 p-4 pb-8">
      <div>
        <h1 className="text-[17px] font-bold">Reportes</h1>
        <p className="text-[12px] text-text-muted mt-0.5">Comparación de peso, reps y volumen a lo largo del tiempo.</p>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => generar('mesociclo')}
          disabled={generando}
          className="flex-1 h-10 rounded-[10px] border border-border bg-surface text-text-muted text-[13px] font-semibold disabled:opacity-60"
        >
          Resumen de mesociclo
        </button>
        <button
          onClick={() => generar('semestral')}
          disabled={generando}
          className="flex-1 h-10 rounded-[10px] bg-accent text-accent-fg text-[13px] font-semibold disabled:opacity-60"
        >
          {generando ? 'Generando…' : 'Reporte semestral'}
        </button>
      </div>

      {error && <p className="text-[13px] text-danger">{error}</p>}

      <div className="flex flex-col gap-2">
        {reportes?.length === 0 && (
          <p className="text-[13px] text-text-muted">Todavía no generaste ningún reporte.</p>
        )}
        {reportes?.map((r) => (
          <div key={r.id} className="bg-surface border border-border rounded-xl overflow-hidden">
            <button
              onClick={() => abrir(r.id)}
              className="w-full text-left p-3.5 flex items-center justify-between gap-3"
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-[13px] font-semibold capitalize">{r.tipo}</span>
                <span className="text-[11.5px] text-text-muted">{r.periodo_cubierto}</span>
              </div>
              <span className="text-[11px] text-text-faint">{new Date(r.fecha_generacion).toLocaleDateString('es-AR')}</span>
            </button>
            {abierto?.id === r.id && <DetalleReporte datos={abierto.datos} />}
          </div>
        ))}
      </div>
    </div>
  );
}

function DetalleReporte({ datos }) {
  if (!datos) return null;
  return (
    <div className="border-t border-border p-3.5 flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wide">Por ejercicio</span>
        <div className="flex flex-col gap-2">
          {datos.porEjercicio.map((e) => {
            const totalEfectivas = e.historial.reduce((acc, h) => acc + (h.reps_efectivas || 0), 0);
            return (
              <div key={e.ejercicio_asignado_id} className="flex items-center justify-between gap-2">
                <span className="text-[12.5px]">{e.ejercicio_nombre}</span>
                <div className="flex flex-col items-end">
                  <span className="tabular text-[12px] text-text-muted whitespace-nowrap">
                    {e.peso_inicial}kg×{e.reps_piso_inicial} → <span className="text-text font-semibold">{e.peso_actual}kg×{e.reps_techo_actual}</span>
                  </span>
                  <span className="tabular text-[11px] text-text-faint">{totalEfectivas} reps efectivas totales</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>
      <section className="flex flex-col gap-2">
        <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wide">Volumen por músculo (últimos microciclos)</span>
        <div className="flex flex-col gap-2">
          {datos.porMusculo.map((m) => (
            <div key={m.musculo} className="flex items-center justify-between gap-2">
              <span className="text-[12.5px] capitalize">{m.musculo}</span>
              <div className="flex flex-col items-end">
                <span className="tabular text-[12px] text-text-muted">
                  {m.historial.map((h) => h.volumen_directo).join(' → ') || 'sin datos'}
                </span>
                <span className="tabular text-[11px] text-text-faint">
                  {m.historial.map((h) => h.reps_efectivas).join(' → ') || 'sin datos'} reps efectivas
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
