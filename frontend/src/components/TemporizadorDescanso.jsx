function reloj(segundos) {
  const s = Math.max(0, segundos);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Barra fija sobre la navegacion inferior: se ve mientras se scrollea por los
// ejercicios, que es justo cuando hace falta (entre series). Estado y reloj
// viven en useTemporizadorDescanso; esto solo lo dibuja.
export default function TemporizadorDescanso({ temporizador }) {
  const { activo, terminado, restante, total, etiqueta, sonidoActivo, ajustar, saltar, alternarSonido } = temporizador;
  if (!activo) return null;

  const progreso = total > 0 ? Math.min(1, Math.max(0, 1 - restante / total)) : 1;

  return (
    <div
      role="timer"
      aria-live="off"
      className="fixed left-0 right-0 bottom-[46px] z-30 px-3 pb-2 pointer-events-none"
    >
      <div
        className={`pointer-events-auto mx-auto max-w-md rounded-xl border shadow-lg overflow-hidden ${
          terminado ? 'bg-success-bg border-success text-success' : 'bg-surface border-border'
        }`}
      >
        <div className="flex flex-col gap-1.5 px-3 pt-2 pb-2">
          <div className="flex items-baseline justify-between gap-2 min-w-0">
            <span className={`text-[11px] font-semibold uppercase tracking-wide shrink-0 ${terminado ? 'text-success' : 'text-text-faint'}`}>
              {terminado ? '¡Descanso terminado!' : 'Descanso'}
            </span>
            <span className="text-[11.5px] text-text-muted truncate">{terminado ? 'Seguí con la próxima serie' : etiqueta}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="tabular text-[26px] font-bold leading-none flex-1">{reloj(restante)}</span>
            {!terminado && (
              <>
                <button
                  type="button"
                  onClick={() => ajustar(-15)}
                  className="h-9 w-11 rounded-lg border border-border bg-bg text-[12px] font-semibold text-text-muted"
                  aria-label="Restar 15 segundos"
                >
                  −15
                </button>
                <button
                  type="button"
                  onClick={() => ajustar(15)}
                  className="h-9 w-11 rounded-lg border border-border bg-bg text-[12px] font-semibold text-text-muted"
                  aria-label="Sumar 15 segundos"
                >
                  +15
                </button>
              </>
            )}
            <button
              type="button"
              onClick={alternarSonido}
              title={sonidoActivo ? 'Aviso con sonido y vibración (tocá para silenciar)' : 'Sin sonido (tocá para activarlo)'}
              aria-pressed={sonidoActivo}
              className="h-9 w-9 rounded-lg border border-border bg-bg text-[14px] leading-none"
            >
              {sonidoActivo ? '🔔' : '🔕'}
            </button>
            <button
              type="button"
              onClick={saltar}
              className="h-9 px-3 rounded-lg bg-accent text-accent-fg text-[12px] font-semibold"
            >
              {terminado ? 'Cerrar' : 'Saltar'}
            </button>
          </div>
        </div>
        {!terminado && (
          <div className="h-1 bg-track">
            <div className="h-full bg-accent transition-[width] duration-300 ease-linear" style={{ width: `${progreso * 100}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}
