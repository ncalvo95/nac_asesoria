import { useState } from 'react';
import { Link } from 'react-router-dom';
import { API_BASE } from '../api/client.js';

const DIAS = [
  { id: 'lunes', label: 'Lun' },
  { id: 'martes', label: 'Mar' },
  { id: 'miercoles', label: 'Mié' },
  { id: 'jueves', label: 'Jue' },
  { id: 'viernes', label: 'Vie' },
  { id: 'sabado', label: 'Sáb' },
  { id: 'domingo', label: 'Dom' },
];

export default function GuestPage() {
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState('hipertrofia');
  const [subObjetivo, setSubObjetivo] = useState('');
  const [deporte, setDeporte] = useState('');
  const [dias, setDias] = useState(['lunes', 'martes', 'jueves', 'viernes']);
  const [equipoTipo, setEquipoTipo] = useState('gimnasio');
  const [error, setError] = useState('');
  const [generando, setGenerando] = useState(false);
  const [listo, setListo] = useState(false);

  function toggleDia(id) {
    setDias((prev) => (prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setListo(false);
    if (dias.length < 2 || dias.length > 6) {
      setError('Elegí entre 2 y 6 días.');
      return;
    }
    if (!subObjetivo.trim()) {
      setError('Contanos tu sub-objetivo.');
      return;
    }
    if (tipo === 'rendimiento' && !deporte.trim()) {
      setError('Si el objetivo es rendimiento, indicá el deporte.');
      return;
    }

    setGenerando(true);
    try {
      const res = await fetch(`${API_BASE}/guest/rutina.xlsx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: nombre || undefined,
          objetivo: { tipo, sub_objetivo: subObjetivo, deporte: tipo === 'rendimiento' ? deporte : undefined },
          equipamiento: { tipo: equipoTipo, checklist: [] },
          dias_especificos: dias,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || 'No se pudo generar el plan.');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'plan-entrenamiento-6-meses.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setListo(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerando(false);
    }
  }

  return (
    <div className="min-h-dvh px-6 py-10 max-w-md mx-auto flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-bold">Plan de 6 meses, sin registrarte</h1>
        <p className="text-[13px] text-text-muted leading-relaxed">
          Completá esto y te descargamos un Excel con tu rutina y el motor de progresión ya armado en fórmulas: cargás tus pesos de semana 0 y el resto se completa solo.
        </p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-7">
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Tu nombre (opcional)"
          className="h-11 rounded-[10px] border border-border bg-surface px-3.5 text-[14px] outline-none focus:border-accent"
        />

        <section className="flex flex-col gap-3">
          <span className="text-xs font-semibold text-text-muted uppercase tracking-wide">Objetivo</span>
          <div className="flex gap-2">
            {['fuerza', 'hipertrofia', 'rendimiento'].map((t) => (
              <button
                type="button"
                key={t}
                onClick={() => setTipo(t)}
                className={`flex-1 h-10 rounded-lg border text-[13px] font-semibold capitalize ${
                  tipo === t ? 'bg-accent text-accent-fg border-accent' : 'bg-surface border-border text-text-muted'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <input
            value={subObjetivo}
            onChange={(e) => setSubObjetivo(e.target.value)}
            placeholder="Sub-objetivo (ej. ganancia global, 1RM sentadilla…)"
            className="h-11 rounded-[10px] border border-border bg-surface px-3.5 text-[14px] outline-none focus:border-accent"
          />
          {tipo === 'rendimiento' && (
            <input
              value={deporte}
              onChange={(e) => setDeporte(e.target.value)}
              placeholder="Deporte"
              className="h-11 rounded-[10px] border border-border bg-surface px-3.5 text-[14px] outline-none focus:border-accent"
            />
          )}
        </section>

        <section className="flex flex-col gap-3">
          <span className="text-xs font-semibold text-text-muted uppercase tracking-wide">Días disponibles</span>
          <div className="flex gap-1.5 flex-wrap">
            {DIAS.map((d) => (
              <button
                type="button"
                key={d.id}
                onClick={() => toggleDia(d.id)}
                className={`w-11 h-11 rounded-full border text-[12.5px] font-semibold ${
                  dias.includes(d.id) ? 'bg-accent text-accent-fg border-accent' : 'bg-surface border-border text-text-muted'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <span className="text-xs font-semibold text-text-muted uppercase tracking-wide">Equipamiento</span>
          <div className="flex gap-2">
            {['gimnasio', 'casa', 'mixto'].map((t) => (
              <button
                type="button"
                key={t}
                onClick={() => setEquipoTipo(t)}
                className={`flex-1 h-10 rounded-lg border text-[13px] font-semibold capitalize ${
                  equipoTipo === t ? 'bg-accent text-accent-fg border-accent' : 'bg-surface border-border text-text-muted'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </section>

        {error && <p className="text-[13px] text-danger">{error}</p>}
        {listo && !error && (
          <p className="text-[13px] text-success">Listo, se descargó tu plan. Abrilo en Excel, LibreOffice o Google Sheets.</p>
        )}

        <button
          type="submit"
          disabled={generando}
          className="h-12 rounded-[10px] bg-accent text-accent-fg text-[15px] font-semibold disabled:opacity-60"
        >
          {generando ? 'Generando…' : 'Descargar mi plan en Excel'}
        </button>

        <Link to="/login" className="text-[13px] text-center text-text-muted">
          ¿Preferís usar la app con cuenta? <span className="text-accent font-semibold">Iniciá sesión</span>
        </Link>
      </form>
    </div>
  );
}
