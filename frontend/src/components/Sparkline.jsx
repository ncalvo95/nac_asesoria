// Mini-grafico de tendencia para una fila de tabla (sin ejes, sin leyenda -
// el numero exacto ya esta al lado en texto, esto es solo el refuerzo
// visual de "para donde va"). Mismo criterio "SVG a mano, sin libreria" que
// GraficoProyeccion.jsx. La linea va en un tono apagado (texto tenue) y
// solo el ultimo punto -donde estamos hoy- se resalta en el color de
// acento, siguiendo el contrato de "stat tile" (trend: sparkline en el
// tono de low-key, el período actual en el acento).
const W = 64;
const H = 22;
const PAD = 3;

export default function Sparkline({ valores, color = 'var(--color-accent)' }) {
  if (!valores || valores.length < 2) return null;

  const min = Math.min(...valores);
  const max = Math.max(...valores);
  const rango = Math.max(1e-6, max - min);
  const n = valores.length;

  const x = (i) => PAD + (i / (n - 1)) * (W - PAD * 2);
  const y = (v) => PAD + (1 - (v - min) / rango) * (H - PAD * 2);

  const puntos = valores.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const ultimo = { x: x(n - 1), y: y(valores[n - 1]) };

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Tendencia: de ${min} a ${max}`}>
      <polyline points={puntos} fill="none" stroke="var(--color-text-faint)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={ultimo.x} cy={ultimo.y} r="2.5" fill={color} />
    </svg>
  );
}
