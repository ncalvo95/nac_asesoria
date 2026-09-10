import { useEffect, useState } from 'react';
import { api } from '../api/client.js';

const CAPITALIZAR = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Antes de dejar quitar un dia, muestra el impacto real (que musculos
// quedarian sin ningun dia activo) y deja elegir si redistribuirlos en otro
// dia o sacarlos nomas. Ver GET/DELETE /dias/:id[/impacto].
export default function QuitarDiaModal({ diaRutinaId, diaSemana, onClose, onQuitado }) {
  const [impacto, setImpacto] = useState(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);
  const [redistribuir, setRedistribuir] = useState(true);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    api.get(`/dias/${diaRutinaId}/impacto`)
      .then((data) => {
        setImpacto(data);
        setRedistribuir(data.musculos.some((m) => m.solo_en_este_dia));
      })
      .catch((err) => setError(err.message))
      .finally(() => setCargando(false));
  }, [diaRutinaId]);

  const musculosSolo = impacto?.musculos.filter((m) => m.solo_en_este_dia) ?? [];
  const musculosCubiertos = impacto?.musculos.filter((m) => !m.solo_en_este_dia) ?? [];
  const noSePuede = impacto && impacto.quedarian_dias_activos < 2;

  async function confirmar() {
    setEnviando(true);
    setError('');
    try {
      const rutina = await api.del(`/dias/${diaRutinaId}`, { redistribuir });
      onQuitado(rutina);
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
          <h2 className="text-[15px] font-bold">Quitar {CAPITALIZAR(diaSemana)}</h2>
          <button type="button" onClick={onClose} className="text-text-faint text-[13px]">✕</button>
        </div>

        {cargando && <p className="text-[13px] text-text-muted">Calculando el impacto…</p>}

        {impacto && (
          <>
            {noSePuede ? (
              <p className="text-[13px] text-danger">La rutina necesita al menos 2 días activos — no se puede quitar este.</p>
            ) : (
              <>
                {musculosSolo.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <span className="text-[12px] font-semibold text-warning">
                      Estos músculos se quedarían sin ningún día si no los redistribuís:
                    </span>
                    <span className="text-[12.5px] text-text-muted capitalize">
                      {musculosSolo.map((m) => m.musculo_nombre).join(', ')}
                    </span>
                  </div>
                )}
                {musculosCubiertos.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <span className="text-[12px] text-text-faint">
                      Estos ya se entrenan en otro día (solo baja la frecuencia):
                    </span>
                    <span className="text-[12.5px] text-text-muted capitalize">
                      {musculosCubiertos.map((m) => m.musculo_nombre).join(', ')}
                    </span>
                  </div>
                )}

                {musculosSolo.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    {[
                      { v: true, label: 'Redistribuir esos músculos en otro día', hint: 'Se les arma un ejercicio nuevo (a testear) en el día activo con menos carga.' },
                      { v: false, label: 'Sacarlo nomás', hint: 'Esos músculos dejan de entrenarse hasta que los agregues a mano en otro día.' },
                    ].map((opt) => (
                      <button
                        type="button"
                        key={String(opt.v)}
                        onClick={() => setRedistribuir(opt.v)}
                        className={`text-left rounded-lg border px-3 py-2 ${
                          redistribuir === opt.v ? 'bg-accent text-accent-fg border-accent' : 'bg-bg border-border text-text-muted'
                        }`}
                      >
                        <div className="text-[12.5px] font-semibold">{opt.label}</div>
                        <div className={`text-[11px] ${redistribuir === opt.v ? 'opacity-90' : 'text-text-faint'}`}>{opt.hint}</div>
                      </button>
                    ))}
                  </div>
                )}

                {error && <p className="text-[12.5px] text-danger">{error}</p>}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 h-10 rounded-lg border border-border bg-surface text-text-muted text-[13px] font-semibold"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={confirmar}
                    disabled={enviando}
                    className="flex-[2] h-10 rounded-lg border border-danger text-danger text-[13px] font-semibold disabled:opacity-60"
                  >
                    {enviando ? 'Quitando…' : 'Quitar día'}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
