import { useState } from 'react';
import { api } from '../api/client.js';

const TIPOS = [
  { id: 'bug', label: 'Reportar un error' },
  { id: 'sugerencia', label: 'Sugerencia' },
  { id: 'otro', label: 'Otro' },
];

export default function FeedbackModal({ onClose }) {
  const [tipo, setTipo] = useState('bug');
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');
  const [ok, setOk] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    if (!mensaje.trim()) {
      setError('Contá qué pasó o qué te gustaría pedir.');
      return;
    }
    setEnviando(true);
    try {
      await api.post('/feedback', { tipo, mensaje });
      setOk(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-3 w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-bold">Reportar un problema o sugerencia</h2>
          <button type="button" onClick={onClose} className="text-text-faint text-[13px]">✕</button>
        </div>

        {ok ? (
          <>
            <p className="text-[13px] text-success">Gracias, le llegó al administrador.</p>
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-lg bg-accent text-accent-fg text-[13.5px] font-semibold"
            >
              Cerrar
            </button>
          </>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-2.5">
            <div className="flex gap-2">
              {TIPOS.map((t) => (
                <button
                  type="button"
                  key={t.id}
                  onClick={() => setTipo(t.id)}
                  className={`flex-1 h-9 rounded-lg border text-[12px] font-semibold ${
                    tipo === t.id ? 'bg-accent text-accent-fg border-accent' : 'bg-bg border-border text-text-muted'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-[11.5px] font-semibold text-text-muted">Mensaje</span>
              <textarea
                required
                rows={5}
                value={mensaje}
                onChange={(e) => setMensaje(e.target.value)}
                placeholder="Contá qué pasó, en qué pantalla, o qué te gustaría que la app hiciera…"
                className="rounded-lg border border-border bg-bg px-3 py-2 text-[13.5px] outline-none focus:border-accent resize-none"
              />
            </label>

            {error && <p className="text-[12.5px] text-danger">{error}</p>}

            <button
              type="submit"
              disabled={enviando}
              className="h-10 rounded-lg bg-accent text-accent-fg text-[13.5px] font-semibold disabled:opacity-60"
            >
              {enviando ? 'Enviando…' : 'Enviar'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
