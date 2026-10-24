import { useMemo, useState } from 'react';
import { zonaVolumen, ZONAS_VOLUMEN, estadoRecuperacion, ESTADOS_RECUPERACION, diasEntre } from '@shared/training/mapaMuscular.js';
import { SILUETA, CABEZA, REGIONES_FRENTE, REGIONES_ESPALDA, FUENTES } from '../utils/mapaMuscularRegiones.js';
import { formatearMusculo } from '../utils/musculo.js';
import { fechaCorta } from '../utils/fechas.js';

const CAPITALIZAR = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Color de cada estado. Siempre acompaña un texto (la lista de abajo y el
// detalle del musculo elegido), asi que el color nunca es la unica pista.
const mezcla = (color, pct) => `color-mix(in srgb, ${color} ${pct}%, var(--color-surface))`;
const COLOR_VOLUMEN = {
  sin_trabajo: 'var(--color-track)',
  bajo: mezcla('var(--color-warning)', 75),
  en_rango: mezcla('var(--color-success)', 55),
  alto: 'var(--color-success)',
  excedido: 'var(--color-danger)',
};
const COLOR_RECUPERACION = {
  sin_datos: 'var(--color-track)',
  reciente: 'var(--color-danger)',
  recuperandose: mezcla('var(--color-warning)', 75),
  recuperado: 'var(--color-success)',
};

// Mapa muscular: cuerpo de frente y de espalda coloreado por volumen de la
// semana (series directas de los ultimos 7 dias vs MEV/MAV/MRV) o por
// recuperacion (dias desde la ultima vez). Tocar un musculo muestra su detalle.
// datos: respuesta de GET /usuarios/:id/mapa-muscular.
export default function MapaMuscular({ datos }) {
  const [modo, setModo] = useState('volumen');
  const [elegido, setElegido] = useState(null);

  // Una fila por musculo con su lectura ya calculada; las regiones del dibujo
  // buscan aca por nombre (sumando las FUENTES, ej. las cabezas del deltoides).
  const porMusculo = useMemo(() => {
    const crudo = new Map(datos.musculos.map((m) => [m.nombre, m]));
    const filas = new Map();
    for (const m of datos.musculos) {
      const fuentes = FUENTES[m.nombre] ?? [m.nombre];
      const series = fuentes.reduce((acc, n) => acc + (crudo.get(n)?.series_7d ?? 0), 0);
      const ultimos = fuentes.map((n) => crudo.get(n)?.ultimo_entreno).filter(Boolean).sort();
      const ultimo = ultimos.length ? ultimos[ultimos.length - 1] : null;
      const dias = diasEntre(ultimo, datos.hoy);
      filas.set(m.nombre, {
        nombre: m.nombre, series, ultimo, dias,
        mev: m.mev, mav: m.mav, mrv: m.mrv,
        zona: zonaVolumen(series, m),
        recuperacion: estadoRecuperacion(dias),
      });
    }
    return filas;
  }, [datos]);

  const colorDe = (nombre) => {
    const f = porMusculo.get(nombre);
    if (!f) return 'var(--color-track)';
    return modo === 'volumen' ? COLOR_VOLUMEN[f.zona] : COLOR_RECUPERACION[f.recuperacion];
  };

  const sel = elegido ? porMusculo.get(elegido) : null;
  const filas = [...porMusculo.values()];
  const hayDatos = filas.some((f) => f.series > 0 || f.ultimo);

  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label="Qué mostrar" className="flex gap-1 bg-bg border border-border rounded-lg p-0.5 self-start">
        {[['volumen', 'Volumen (7 días)'], ['recuperacion', 'Recuperación']].map(([k, t]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={modo === k}
            onClick={() => setModo(k)}
            className={`px-3 h-8 rounded-md text-[12px] font-semibold ${modo === k ? 'bg-accent text-accent-fg' : 'text-text-muted'}`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-1">
        <Cuerpo titulo="Frente" regiones={REGIONES_FRENTE} colorDe={colorDe} elegido={elegido} onElegir={setElegido} />
        <Cuerpo titulo="Espalda" regiones={REGIONES_ESPALDA} colorDe={colorDe} elegido={elegido} onElegir={setElegido} />
      </div>

      <Leyenda modo={modo} />

      {sel ? (
        <div className="bg-bg border border-border rounded-lg px-3 py-2 text-[12.5px] leading-snug flex flex-col gap-0.5" role="status">
          <strong className="text-[13.5px]">{CAPITALIZAR(formatearMusculo(sel.nombre))}</strong>
          <span>
            <span className="tabular font-semibold">{sel.series}</span> series esta semana
            {sel.mav > 0 && <span className="text-text-muted"> (mínimo {sel.mev}, ideal hasta {sel.mav}, límite {sel.mrv})</span>}
            : <strong>{ZONAS_VOLUMEN[sel.zona]}</strong>
          </span>
          <span>
            {sel.ultimo
              ? <>Último entrenamiento: {fechaCorta(sel.ultimo)} ({sel.dias === 0 ? 'hoy' : `hace ${sel.dias} ${sel.dias === 1 ? 'día' : 'días'}`}): <strong>{ESTADOS_RECUPERACION[sel.recuperacion]}</strong></>
              : 'Todavía no registraste series de este músculo.'}
          </span>
        </div>
      ) : (
        <p className="text-[12px] text-text-faint">Tocá un músculo para ver su detalle.</p>
      )}

      {!hayDatos && (
        <p className="text-[12.5px] text-text-muted bg-bg border border-border rounded-lg px-3 py-2">
          Todavía no hay sesiones registradas: el mapa se va a colorear a medida que entrenes.
        </p>
      )}

      <details className="text-[12px]">
        <summary className="cursor-pointer text-accent font-semibold">Ver como tabla</summary>
        <table className="w-full mt-2 tabular text-[11.5px]">
          <thead>
            <tr className="text-left text-text-faint">
              <th className="font-semibold py-0.5">Músculo</th>
              <th className="font-semibold text-right">Series 7d</th>
              <th className="font-semibold pl-2">Volumen</th>
              <th className="font-semibold pl-2">Recuperación</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.nombre} className="border-t border-border">
                <td className="py-0.5">{CAPITALIZAR(formatearMusculo(f.nombre))}</td>
                <td className="text-right">{f.series}</td>
                <td className="pl-2">{ZONAS_VOLUMEN[f.zona]}</td>
                <td className="pl-2">{ESTADOS_RECUPERACION[f.recuperacion]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      <p className="text-[10.5px] text-text-faint">
        Cuenta series directas (al músculo principal del ejercicio). La recuperación es una regla simple por días desde la última vez (48-72 h), no una medición.
      </p>
    </div>
  );
}

function Cuerpo({ titulo, regiones, colorDe, elegido, onElegir }) {
  // La mitad izquierda se dibuja y se repite espejada (ver utils/mapaMuscularRegiones.js).
  const mitades = [
    { clave: 'izq', transform: undefined },
    { clave: 'der', transform: 'translate(200 0) scale(-1 1)' },
  ];
  return (
    <figure className="flex flex-col items-center">
      <svg viewBox="0 0 200 360" className="w-full h-auto max-h-[420px]" role="group" aria-label={`Cuerpo, vista de ${titulo.toLowerCase()}`}>
        <ellipse cx={CABEZA.cx} cy={CABEZA.cy} rx={CABEZA.rx} ry={CABEZA.ry} fill="var(--color-track)" stroke="var(--color-border)" />
        {mitades.map((h) => (
          <g key={h.clave} transform={h.transform}>
            <path d={`${SILUETA} Z`} fill="var(--color-track)" />
            <path d={SILUETA} fill="none" stroke="var(--color-border)" strokeWidth="1.2" strokeLinejoin="round" />
            {regiones.map((r) => (
              <path
                key={r.musculo}
                d={r.d}
                fill={colorDe(r.musculo)}
                stroke={elegido === r.musculo ? 'var(--color-text)' : 'var(--color-surface)'}
                strokeWidth={elegido === r.musculo ? 2 : 1}
                strokeLinejoin="round"
                className="cursor-pointer"
                role="button"
                tabIndex={0}
                aria-label={CAPITALIZAR(formatearMusculo(r.musculo))}
                onClick={() => onElegir(elegido === r.musculo ? null : r.musculo)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onElegir(elegido === r.musculo ? null : r.musculo); } }}
              />
            ))}
          </g>
        ))}
      </svg>
      <figcaption className="text-[11px] font-semibold text-text-faint uppercase tracking-wide">{titulo}</figcaption>
    </figure>
  );
}

function Leyenda({ modo }) {
  const items = modo === 'volumen'
    ? [['sin_trabajo', 'Sin trabajo'], ['bajo', 'Bajo'], ['en_rango', 'En rango'], ['alto', 'Alto'], ['excedido', 'Excedido']]
    : [['sin_datos', 'Sin registros'], ['reciente', 'Recién trabajado'], ['recuperandose', 'Recuperándose'], ['recuperado', 'Recuperado']];
  const colores = modo === 'volumen' ? COLOR_VOLUMEN : COLOR_RECUPERACION;
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-text-muted">
      {items.map(([k, t]) => (
        <span key={k} className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-[3px] border border-border" style={{ background: colores[k] }} />
          {t}
        </span>
      ))}
    </div>
  );
}
