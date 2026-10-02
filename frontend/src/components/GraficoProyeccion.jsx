// Grafico de linea minimo (SVG a mano, sin libreria - mismo criterio
// "diseño liviano" del resto del proyecto) del peso proyectado semana a
// semana del modo objetivo. Usa las variables de tema (var(--color-*)) en
// vez de colores fijos para que se vea bien en claro y oscuro sin tocar nada.
const W = 320;
const H = 130;
const PAD_L = 30;
const PAD_R = 8;
const PAD_T = 10;
const PAD_B = 20;

export default function GraficoProyeccion({ proyeccion }) {
  if (!proyeccion || proyeccion.length < 2) return null;

  const pesos = proyeccion.map((f) => f.pesoProyectadoKg);
  const min = Math.min(...pesos);
  const max = Math.max(...pesos);
  const rango = Math.max(0.1, max - min);
  const n = proyeccion.length;

  const x = (i) => PAD_L + (i / (n - 1)) * (W - PAD_L - PAD_R);
  const y = (peso) => PAD_T + (1 - (peso - min) / rango) * (H - PAD_T - PAD_B);

  const puntos = proyeccion.map((f, i) => `${x(i)},${y(f.pesoProyectadoKg)}`).join(' ');

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] text-text-muted">Peso proyectado (kg)</span>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Peso proyectado semana a semana">
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} stroke="var(--color-border)" strokeWidth="1" />
        <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} stroke="var(--color-border)" strokeWidth="1" />
        <text x={2} y={y(max) + 3} fontSize="9" fill="var(--color-text-faint)">{max}</text>
        <text x={2} y={y(min) + 3} fontSize="9" fill="var(--color-text-faint)">{min}</text>
        <polyline points={puntos} fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {proyeccion.map((f, i) => (
          <circle key={f.semana} cx={x(i)} cy={y(f.pesoProyectadoKg)} r="2.5" fill="var(--color-accent)" />
        ))}
        <text x={PAD_L} y={H - 4} fontSize="9" fill="var(--color-text-faint)">S1</text>
        <text x={W - PAD_R - 16} y={H - 4} fontSize="9" fill="var(--color-text-faint)">S{n}</text>
      </svg>
    </div>
  );
}
