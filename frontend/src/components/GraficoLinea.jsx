import { useRef, useState } from 'react';

const W = 320;
const H = 150;
const M = { arriba: 12, derecha: 14, abajo: 22, izquierda: 34 };

// Grafico de linea de una sola serie, SVG a mano (mismo criterio que
// GraficoProyeccion/Sparkline: sin libreria). Una serie no lleva leyenda - el
// titulo de quien lo usa ya dice que es. La linea es fina, la grilla apenas se
// ve y los puntos que marcan un maximo historico llevan un anillo (con su
// nombre en el tooltip, no solo el color). Al pasar el dedo o el mouse se ve
// el detalle del punto mas cercano.
//
// puntos: [{ etiqueta: '9/11', valor: 83.3, detalle: '62.5 kg x 10', record: bool }]
export default function GraficoLinea({ puntos, unidad = '', descripcion }) {
  const [activo, setActivo] = useState(null);
  const svgRef = useRef(null);
  if (!puntos || puntos.length < 2) return null;

  const valores = puntos.map((p) => p.valor);
  let min = Math.min(...valores);
  let max = Math.max(...valores);
  if (max - min < 1e-6) { min -= 1; max += 1; }
  const colchon = (max - min) * 0.12;
  min -= colchon;
  max += colchon;

  const n = puntos.length;
  const ancho = W - M.izquierda - M.derecha;
  const alto = H - M.arriba - M.abajo;
  const x = (i) => M.izquierda + (i / (n - 1)) * ancho;
  const y = (v) => M.arriba + (1 - (v - min) / (max - min)) * alto;
  const marcas = [min + colchon, (min + max) / 2, max - colchon];
  const linea = puntos.map((p, i) => `${x(i)},${y(p.valor)}`).join(' ');
  const redondear = (v) => Math.round(v * 10) / 10;

  function alMover(e) {
    const rect = svgRef.current.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - M.izquierda) / ancho) * (n - 1));
    setActivo(Math.min(n - 1, Math.max(0, i)));
  }

  const p = activo != null ? puntos[activo] : null;

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto select-none"
        style={{ touchAction: 'pan-y' }}
        role="img"
        aria-label={descripcion ?? `Evolución de ${puntos[0].valor} a ${puntos[n - 1].valor} ${unidad}`}
        onPointerMove={alMover}
        onPointerDown={alMover}
        onPointerLeave={() => setActivo(null)}
      >
        {marcas.map((m) => (
          <g key={m}>
            <line x1={M.izquierda} x2={W - M.derecha} y1={y(m)} y2={y(m)} stroke="var(--color-border)" strokeWidth="1" strokeDasharray="2 3" />
            <text x={M.izquierda - 5} y={y(m) + 3} textAnchor="end" fontSize="9" fill="var(--color-text-faint)" className="tabular">{redondear(m)}</text>
          </g>
        ))}
        <text x={M.izquierda} y={H - 6} fontSize="9" fill="var(--color-text-faint)">{puntos[0].etiqueta}</text>
        <text x={W - M.derecha} y={H - 6} textAnchor="end" fontSize="9" fill="var(--color-text-faint)">{puntos[n - 1].etiqueta}</text>

        <polyline points={linea} fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {puntos.map((pt, i) => (
          <g key={i}>
            {pt.record && <circle cx={x(i)} cy={y(pt.valor)} r="6" fill="none" stroke="var(--color-success)" strokeWidth="1.5" />}
            <circle cx={x(i)} cy={y(pt.valor)} r={i === n - 1 || activo === i ? 4 : 2.5} fill="var(--color-accent)" stroke="var(--color-surface)" strokeWidth="1.5" />
          </g>
        ))}
        {activo != null && (
          <line x1={x(activo)} x2={x(activo)} y1={M.arriba} y2={H - M.abajo} stroke="var(--color-text-faint)" strokeWidth="1" />
        )}
        {/* Etiqueta directa del ultimo valor, que es el que importa hoy */}
        <text
          x={x(n - 1)} y={y(puntos[n - 1].valor) - 9} textAnchor="end" fontSize="10" fontWeight="600"
          fill="var(--color-text)" className="tabular"
        >
          {redondear(puntos[n - 1].valor)} {unidad}
        </text>
      </svg>
      {p && (
        <div
          className="pointer-events-none absolute -top-1 z-10 bg-surface border border-border rounded-lg shadow px-2 py-1 text-[11px] leading-snug whitespace-nowrap"
          style={{ left: `${(x(activo) / W) * 100}%`, transform: `translateX(${activo > n / 2 ? '-100%' : '0'})` }}
        >
          <strong className="tabular">{p.etiqueta}: {redondear(p.valor)} {unidad}</strong>
          {p.detalle && <span className="block text-text-muted">{p.detalle}</span>}
          {p.record && <span className="block text-success font-semibold">Récord</span>}
        </div>
      )}
    </div>
  );
}
