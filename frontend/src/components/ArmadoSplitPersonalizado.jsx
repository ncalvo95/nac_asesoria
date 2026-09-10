const DIAS_TODOS = [
  { id: 'lunes', label: 'Lunes' },
  { id: 'martes', label: 'Martes' },
  { id: 'miercoles', label: 'Miércoles' },
  { id: 'jueves', label: 'Jueves' },
  { id: 'viernes', label: 'Viernes' },
  { id: 'sabado', label: 'Sábado' },
  { id: 'domingo', label: 'Domingo' },
];

const MUSCULOS = [
  { id: 'pecho', label: 'Pecho' },
  { id: 'espalda', label: 'Espalda' },
  { id: 'dorsales', label: 'Dorsales' },
  { id: 'deltoides_lateral', label: 'Deltoides lateral' },
  { id: 'deltoides_anterior', label: 'Deltoides anterior' },
  { id: 'deltoides_posterior', label: 'Deltoides posterior' },
  { id: 'biceps', label: 'Bíceps' },
  { id: 'triceps', label: 'Tríceps' },
  { id: 'abdominales', label: 'Abdominales' },
  { id: 'cuadriceps', label: 'Cuádriceps' },
  { id: 'isquiotibiales', label: 'Isquiotibiales' },
  { id: 'gluteos', label: 'Glúteos' },
  { id: 'abductores', label: 'Abductores' },
  { id: 'aductores', label: 'Aductores' },
  { id: 'pantorrillas', label: 'Pantorrillas' },
  { id: 'lumbares', label: 'Lumbares' },
];

const ORDEN_DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
const CAPITALIZAR = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Aviso (nunca bloquea) cuando un musculo repite en dos dias consecutivos
// del split - considera el ciclo semanal completo (domingo->lunes tambien
// cuenta como consecutivo si ambos estan elegidos), no solo el orden en que
// se agregaron los dias.
function calcularAdvertencias(dias) {
  const musculoADias = new Map();
  for (const d of dias) {
    const idx = ORDEN_DIAS.indexOf(d.dia_semana);
    for (const m of d.musculos) {
      if (!musculoADias.has(m)) musculoADias.set(m, []);
      musculoADias.get(m).push({ idx, dia: d.dia_semana });
    }
  }
  const advertencias = [];
  for (const [musculo, entries] of musculoADias) {
    if (entries.length < 2) continue;
    const ordenados = [...entries].sort((a, b) => a.idx - b.idx);
    for (let i = 0; i < ordenados.length; i++) {
      const actual = ordenados[i];
      const siguiente = ordenados[(i + 1) % ordenados.length];
      let gap = siguiente.idx - actual.idx;
      if (gap <= 0) gap += 7;
      if (gap === 1) {
        const label = MUSCULOS.find((m) => m.id === musculo)?.label || musculo;
        advertencias.push(`${label}: ${CAPITALIZAR(actual.dia)} y ${CAPITALIZAR(siguiente.dia)} son días consecutivos (menos de 48hs de descanso para ese músculo).`);
      }
    }
  }
  return advertencias;
}

// dias: [{ dia_semana, musculos: [nombre, ...], duracion_minutos }]
export default function ArmadoSplitPersonalizado({ dias, onChange }) {
  function agregarDia(diaId) {
    onChange([...dias, { dia_semana: diaId, musculos: [], duracion_minutos: 60 }]);
  }
  function quitarDia(idx) {
    onChange(dias.filter((_, i) => i !== idx));
  }
  function toggleMusculo(idx, musculoId) {
    const dia = dias[idx];
    const nuevos = dia.musculos.includes(musculoId) ? dia.musculos.filter((m) => m !== musculoId) : [...dia.musculos, musculoId];
    const copia = [...dias];
    copia[idx] = { ...dia, musculos: nuevos };
    onChange(copia);
  }
  function setDuracion(idx, minutos) {
    const copia = [...dias];
    copia[idx] = { ...copia[idx], duracion_minutos: Number(minutos) };
    onChange(copia);
  }

  const advertencias = calcularAdvertencias(dias);
  const diasDisponibles = DIAS_TODOS.filter((d) => !dias.some((x) => x.dia_semana === d.id));

  return (
    <div className="flex flex-col gap-4">
      {dias.map((dia, idx) => {
        const label = DIAS_TODOS.find((d) => d.id === dia.dia_semana)?.label;
        return (
          <div key={dia.dia_semana} className="rounded-xl border border-border bg-surface p-3.5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-[13.5px] font-semibold">{label}</span>
              <button type="button" onClick={() => quitarDia(idx)} className="text-[12px] text-danger">
                Quitar día
              </button>
            </div>

            <div className="flex gap-1.5 flex-wrap">
              {MUSCULOS.map((m) => (
                <button
                  type="button"
                  key={m.id}
                  onClick={() => toggleMusculo(idx, m.id)}
                  className={`px-3 h-8 rounded-full border text-[12px] font-medium ${
                    dia.musculos.includes(m.id) ? 'bg-accent text-accent-fg border-accent' : 'bg-bg border-border text-text-muted'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <label className="flex items-center gap-3 text-[13px] text-text-muted">
              Minutos disponibles
              <input
                type="number"
                min={20}
                max={180}
                step={5}
                value={dia.duracion_minutos}
                onChange={(e) => setDuracion(idx, e.target.value)}
                className="w-20 h-9 rounded-lg border border-border bg-bg px-2.5 tabular text-[13.5px] text-text outline-none focus:border-accent"
              />
            </label>
          </div>
        );
      })}

      {dias.length < 6 && (
        <div className="flex flex-col gap-2">
          <span className="text-[12px] text-text-muted">Agregar día:</span>
          <div className="flex gap-1.5 flex-wrap">
            {diasDisponibles.map((d) => (
              <button
                type="button"
                key={d.id}
                onClick={() => agregarDia(d.id)}
                className="px-3 h-9 rounded-lg border border-dashed border-border text-[12.5px] text-text-muted"
              >
                + {d.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {advertencias.length > 0 && (
        <div className="rounded-xl border border-warning bg-warning-bg p-3 flex flex-col gap-1.5">
          <span className="text-[12px] font-semibold text-warning">Aviso de descanso (podés seguir igual):</span>
          {advertencias.map((a, i) => (
            <span key={i} className="text-[12px] text-warning">{a}</span>
          ))}
        </div>
      )}
    </div>
  );
}
