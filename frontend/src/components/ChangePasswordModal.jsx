import { useState } from 'react';
import { api } from '../api/client.js';

export default function ChangePasswordModal({ onClose }) {
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [error, setError] = useState('');
  const [ok, setOk] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    if (nueva.length < 6) {
      setError('La contraseña nueva debe tener al menos 6 caracteres.');
      return;
    }
    if (nueva !== confirmar) {
      setError('La confirmación no coincide con la contraseña nueva.');
      return;
    }
    setEnviando(true);
    try {
      await api.patch('/auth/password', { password_actual: actual, password_nueva: nueva });
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
          <h2 className="text-[15px] font-bold">Cambiar contraseña</h2>
          <button type="button" onClick={onClose} className="text-text-faint text-[13px]">✕</button>
        </div>

        {ok ? (
          <>
            <p className="text-[13px] text-success">Contraseña actualizada correctamente.</p>
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
            <label className="flex flex-col gap-1">
              <span className="text-[11.5px] font-semibold text-text-muted">Contraseña actual</span>
              <input
                type="password"
                required
                value={actual}
                onChange={(e) => setActual(e.target.value)}
                className="h-10 rounded-lg border border-border bg-bg px-3 text-[13.5px] outline-none focus:border-accent"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11.5px] font-semibold text-text-muted">Contraseña nueva</span>
              <input
                type="password"
                required
                value={nueva}
                onChange={(e) => setNueva(e.target.value)}
                className="h-10 rounded-lg border border-border bg-bg px-3 text-[13.5px] outline-none focus:border-accent"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11.5px] font-semibold text-text-muted">Confirmar contraseña nueva</span>
              <input
                type="password"
                required
                value={confirmar}
                onChange={(e) => setConfirmar(e.target.value)}
                className="h-10 rounded-lg border border-border bg-bg px-3 text-[13.5px] outline-none focus:border-accent"
              />
            </label>

            {error && <p className="text-[12.5px] text-danger">{error}</p>}

            <button
              type="submit"
              disabled={enviando}
              className="h-10 rounded-lg bg-accent text-accent-fg text-[13.5px] font-semibold disabled:opacity-60"
            >
              {enviando ? 'Guardando…' : 'Guardar'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
