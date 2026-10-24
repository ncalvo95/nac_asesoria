const SIN_FLECHAS = '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

function redondear(n) {
  return Math.round(n * 100) / 100;
}

// Campo numerico con - / + a los costados. Si el campo esta vacio, los botones
// parten de la sugerencia gris (placeholder) y no de cero: con el peso o las
// reps que ya se esperan, un toque en + o - da el valor vecino directamente.
export function CampoNumerico({ value, onChange, placeholder, paso, decimal = false, claseBorde = 'border-border', etiqueta }) {
  function actual() {
    if (value !== '' && value != null && Number.isFinite(Number(value))) return Number(value);
    const ph = Number(placeholder);
    return Number.isFinite(ph) && placeholder !== '' && placeholder != null ? ph : 0;
  }
  function mover(direccion) {
    onChange(String(Math.max(0, redondear(actual() + direccion * paso))));
  }
  return (
    <div className="flex items-center gap-0.5 min-w-0">
      <button
        type="button"
        onClick={() => mover(-1)}
        aria-label={`Restar ${paso} a ${etiqueta}`}
        className="h-9 w-6 shrink-0 rounded-md border border-border bg-bg text-text-muted text-[15px] leading-none"
      >
        −
      </button>
      <input
        type="number"
        inputMode={decimal ? 'decimal' : 'numeric'}
        value={value}
        placeholder={placeholder}
        aria-label={etiqueta}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full min-w-0 h-9 rounded-lg border bg-bg px-1 tabular text-[13.5px] text-center outline-none focus:border-accent placeholder:text-text-faint ${SIN_FLECHAS} ${claseBorde}`}
      />
      <button
        type="button"
        onClick={() => mover(1)}
        aria-label={`Sumar ${paso} a ${etiqueta}`}
        className="h-9 w-6 shrink-0 rounded-md border border-border bg-bg text-text-muted text-[15px] leading-none"
      >
        +
      </button>
    </div>
  );
}

export const RIR_MAX = 4;

// De "no podia mas" (rojo) a "me sobraba" (neutro): el color le da sentido al
// numero sin tener que acordarse de la escala.
const RIR_CLASE = {
  0: 'bg-danger-bg text-danger border-danger',
  1: 'bg-warning-bg text-warning border-warning',
  2: 'bg-success-bg text-success border-success',
  3: 'bg-track text-text-muted border-border',
  4: 'bg-track text-text-muted border-border',
};
export const RIR_TEXTO = {
  0: 'Al límite: no podías hacer ni una repetición más',
  1: 'Te quedaba 1 repetición más',
  2: 'Te quedaban 2 repeticiones más',
  3: 'Te quedaban 3 repeticiones más (bastante fácil)',
  4: 'Te quedaban 4 o más repeticiones (muy fácil)',
};

// Un toque suma 1 y despues de 4 vuelve a 0 - mas rapido que tipear en un
// numerico, que en el celular abre el teclado entero para un solo digito.
export function BotonRIR({ value, onChange }) {
  const n = Math.min(RIR_MAX, Math.max(0, Number(value) || 0));
  return (
    <button
      type="button"
      onClick={() => onChange((n + 1) % (RIR_MAX + 1))}
      title={`RIR ${n}: ${RIR_TEXTO[n]}. Tocá para cambiarlo.`}
      aria-label={`RIR ${n}: ${RIR_TEXTO[n]}`}
      className={`h-9 w-full rounded-lg border tabular text-[14px] font-bold ${RIR_CLASE[n]}`}
    >
      {n}
    </button>
  );
}

export function BotonSerieHecha({ hecha, onClick, numero }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={hecha}
      aria-label={hecha ? `Serie ${numero} hecha (tocá para desmarcar)` : `Marcar la serie ${numero} como hecha`}
      title={hecha ? 'Hecha' : 'Marcar como hecha e iniciar el descanso'}
      className={`h-9 w-full rounded-lg border text-[15px] font-bold leading-none ${
        hecha ? 'bg-success-bg text-success border-success' : 'bg-bg text-text-faint border-border'
      }`}
    >
      ✓
    </button>
  );
}

// "RIR" del encabezado: abre la explicacion de la escala (una sola vez por
// pantalla, no en cada tarjeta).
export function EncabezadoRIR({ abierta, onToggle }) {
  return (
    <button type="button" onClick={onToggle} className="text-center underline decoration-dotted underline-offset-2" aria-expanded={abierta}>
      RIR ⓘ
    </button>
  );
}

export function TextoLeyendaRIR() {
  return (
    <div className="bg-bg border border-border rounded-lg px-3 py-2 text-[11.5px] text-text-muted leading-relaxed">
      <strong className="text-text">RIR</strong> = repeticiones que te quedaron en reserva al terminar la serie. Tocá el número para cambiarlo.
      <ul className="mt-1 flex flex-col gap-0.5">
        {Object.entries(RIR_TEXTO).map(([n, t]) => (
          <li key={n} className="flex items-center gap-2">
            <span className={`inline-flex items-center justify-center w-5 h-5 rounded-md border text-[11px] font-bold ${RIR_CLASE[n]}`}>{n}</span>
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}
