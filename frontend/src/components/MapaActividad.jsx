import { useMemo } from 'react';
import { aIso, fechaCorta, lunesDe, parseFechaLocal } from '../utils/fechas.js';

const SEMANAS = 13;
const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// Cuatro niveles de un solo tono (el acento) segun cuantas series hubo ese dia
// respecto del dia mas cargado del periodo; un dia sin entreno es el tono
// neutro de las barras. Mismo recurso de "mezcla con la superficie" en claro y
// oscuro, asi no hay colores nuevos que validar.
const NIVELES = [28, 50, 75, 100];
function colorDeNivel(nivel) {
  if (nivel === 0) return 'var(--color-track)';
  return `color-mix(in srgb, var(--color-accent) ${NIVELES[nivel - 1]}%, var(--color-surface))`;
}

// Mapa de actividad (estilo calendario de contribuciones): una columna por
// semana (lunes a domingo), las ultimas 13 semanas. `dias` viene de
// GET /usuarios/:id/actividad ({ fecha, sesiones, series }).
export default function MapaActividad({ dias, hoy = new Date() }) {
  const { columnas, etiquetasMes, resumen } = useMemo(() => {
    const porFecha = new Map(dias.map((d) => [d.fecha, d]));
    const maxSeries = Math.max(1, ...dias.map((d) => d.series));
    const hoyIso = aIso(hoy);
    const inicio = lunesDe(hoy);
    inicio.setDate(inicio.getDate() - (SEMANAS - 1) * 7);

    const cols = [];
    const meses = [];
    let sesiones = 0;
    const semanasConEntreno = [];
    for (let c = 0; c < SEMANAS; c++) {
      const celdas = [];
      let hubo = false;
      for (let r = 0; r < 7; r++) {
        const f = new Date(inicio);
        f.setDate(inicio.getDate() + c * 7 + r);
        const iso = aIso(f);
        const futuro = iso > hoyIso;
        const d = porFecha.get(iso);
        const nivel = !d || d.series === 0 ? (d ? 1 : 0) : Math.min(4, Math.ceil((d.series / maxSeries) * 4));
        if (d) { sesiones += d.sesiones; hubo = true; }
        celdas.push({ iso, futuro, nivel, d });
      }
      semanasConEntreno.push(hubo);
      cols.push(celdas);
      const primero = parseFechaLocal(celdas[0].iso);
      if (c === 0 || primero.getDate() <= 7) meses.push({ c, texto: MESES[primero.getMonth()] });
    }
    // Racha: semanas seguidas con al menos un entreno, contando hacia atras
    // desde la actual - si la semana en curso todavia no tuvo entreno no
    // corta la racha (todavia hay tiempo), arranca de la anterior.
    let racha = 0;
    let i = SEMANAS - 1;
    if (!semanasConEntreno[i]) i -= 1;
    while (i >= 0 && semanasConEntreno[i]) { racha += 1; i -= 1; }
    return {
      columnas: cols,
      etiquetasMes: meses,
      resumen: { sesiones, semanas: semanasConEntreno.filter(Boolean).length, racha },
    };
  }, [dias, hoy]);

  const TAM = 15;
  const GAP = 3;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        <Dato valor={resumen.sesiones} etiqueta="Sesiones" />
        <Dato valor={`${resumen.semanas}/${SEMANAS}`} etiqueta="Semanas con entreno" />
        <Dato valor={resumen.racha} etiqueta={resumen.racha === 1 ? 'Semana seguida' : 'Semanas seguidas'} />
      </div>
      <div className="overflow-x-auto">
        <div className="inline-flex flex-col gap-1" role="img" aria-label={`Mapa de actividad de las últimas ${SEMANAS} semanas: ${resumen.sesiones} sesiones`}>
          <div className="flex" style={{ paddingLeft: 14 + GAP, height: 12 }}>
            {columnas.map((_, c) => {
              const mes = etiquetasMes.find((m) => m.c === c);
              return (
                <span key={c} className="text-[9.5px] text-text-faint leading-none" style={{ width: TAM + GAP }}>
                  {mes ? mes.texto : ''}
                </span>
              );
            })}
          </div>
          <div className="flex" style={{ gap: GAP }}>
            <div className="flex flex-col text-[9.5px] text-text-faint" style={{ gap: GAP, width: 14 }}>
              {DIAS.map((d, i) => (
                <span key={d} className="leading-none flex items-center" style={{ height: TAM }}>{i % 2 === 0 ? d : ''}</span>
              ))}
            </div>
            {columnas.map((celdas, c) => (
              <div key={c} className="flex flex-col" style={{ gap: GAP }}>
                {celdas.map((cel) => (
                  <span
                    key={cel.iso}
                    title={cel.futuro ? undefined : `${fechaCorta(cel.iso)}: ${cel.d ? `${cel.d.series} series` : 'sin entreno'}`}
                    className="rounded-[3px]"
                    style={{
                      width: TAM, height: TAM,
                      background: cel.futuro ? 'transparent' : colorDeNivel(cel.nivel),
                      outline: cel.iso === aIso(hoy) ? '1.5px solid var(--color-text-muted)' : 'none',
                      outlineOffset: 1,
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1.5 text-[10.5px] text-text-faint">
        Menos
        {[0, 1, 2, 3, 4].map((n) => (
          <span key={n} className="rounded-[3px]" style={{ width: 12, height: 12, background: colorDeNivel(n) }} />
        ))}
        Más series
      </div>
    </div>
  );
}

function Dato({ valor, etiqueta }) {
  return (
    <div className="bg-bg border border-border rounded-lg px-2.5 py-2 flex flex-col">
      <span className="tabular text-[20px] font-bold leading-tight">{valor}</span>
      <span className="text-[11px] text-text-muted leading-snug">{etiqueta}</span>
    </div>
  );
}
