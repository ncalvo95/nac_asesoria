import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api/client.js';
import ArmadoManualRutina from '../components/ArmadoManualRutina.jsx';
import ArmadoSplitPersonalizado from '../components/ArmadoSplitPersonalizado.jsx';

const DIAS = [
  { id: 'lunes', label: 'Lun' },
  { id: 'martes', label: 'Mar' },
  { id: 'miercoles', label: 'Mié' },
  { id: 'jueves', label: 'Jue' },
  { id: 'viernes', label: 'Vie' },
  { id: 'sabado', label: 'Sáb' },
  { id: 'domingo', label: 'Dom' },
];

const EQUIPO_TAGS = ['barra', 'mancuernas', 'banco', 'polea', 'maquina', 'banda', 'paralelas', 'barra_dominadas'];

const MUSCULOS = [
  { id: 'pecho', label: 'Pecho' },
  { id: 'espalda', label: 'Espalda' },
  { id: 'dorsales', label: 'Dorsales' },
  { id: 'deltoides', label: 'Deltoides' },
  { id: 'biceps', label: 'Bíceps' },
  { id: 'triceps', label: 'Tríceps' },
  { id: 'abdominales', label: 'Abdominales' },
  { id: 'cuadriceps', label: 'Cuádriceps' },
  { id: 'isquiotibiales', label: 'Isquiotibiales' },
  { id: 'gluteos', label: 'Glúteos' },
  { id: 'pantorrillas', label: 'Pantorrillas' },
];

export default function OnboardingPage() {
  const { usuario: sesion } = useAuth();
  const { usuarioId: usuarioIdParam } = useParams();
  const usuario = usuarioIdParam ? { id: Number(usuarioIdParam) } : sesion;
  const navigate = useNavigate();

  const [modo, setModo] = useState('auto');
  const [diasManual, setDiasManual] = useState([]);
  const [diasSplit, setDiasSplit] = useState([]);

  const [tipo, setTipo] = useState('hipertrofia');
  const [subObjetivo, setSubObjetivo] = useState('');
  const [deporte, setDeporte] = useState('');
  const [dias, setDias] = useState(['lunes', 'martes', 'jueves', 'viernes']);
  const [varianteSplit, setVarianteSplit] = useState('upper_lower');
  const [duracion, setDuracion] = useState(60);
  const [equipoTipo, setEquipoTipo] = useState('gimnasio');
  const [checklist, setChecklist] = useState(EQUIPO_TAGS);
  const [musculosUbicacion, setMusculosUbicacion] = useState({});
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  function toggleDia(id) {
    setDias((prev) => (prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]));
  }
  function toggleTag(tag) {
    setChecklist((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }
  function toggleMusculoEnCasa(musculo) {
    setMusculosUbicacion((prev) => {
      // No obligatorio: si no esta en el mapa, cae en "gimnasio" por
      // default (ver src/services/routineBuilder.js -> tagsDisponibles).
      if (prev[musculo] === 'casa') {
        const { [musculo]: _omit, ...resto } = prev;
        return resto;
      }
      return { ...prev, [musculo]: 'casa' };
    });
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    if (!subObjetivo.trim()) {
      setError('Contanos tu sub-objetivo.');
      return;
    }
    if (tipo === 'rendimiento' && !deporte.trim()) {
      setError('Si el objetivo es rendimiento, indicá el deporte.');
      return;
    }
    if (modo === 'auto' && (dias.length < 2 || dias.length > 6)) {
      setError('Elegí entre 2 y 6 días.');
      return;
    }
    if (modo === 'manual') {
      if (diasManual.length < 2 || diasManual.length > 6) {
        setError('Armá entre 2 y 6 días.');
        return;
      }
      if (diasManual.some((d) => d.ejercicios.length === 0)) {
        setError('Todos los días necesitan al menos un ejercicio.');
        return;
      }
    }
    if (modo === 'split') {
      if (diasSplit.length < 2 || diasSplit.length > 6) {
        setError('Armá entre 2 y 6 días.');
        return;
      }
      if (diasSplit.some((d) => d.musculos.length === 0)) {
        setError('Todos los días necesitan al menos un músculo.');
        return;
      }
    }

    setEnviando(true);
    try {
      let huboPendientes = false;
      const marcar = (resultado) => {
        if (resultado?.pendiente) huboPendientes = true;
        return resultado;
      };

      marcar(await api.put(`/usuarios/${usuario.id}/objetivo`, {
        tipo, sub_objetivo: subObjetivo, deporte: tipo === 'rendimiento' ? deporte : undefined,
      }));

      if (modo === 'manual') {
        marcar(await api.post(`/usuarios/${usuario.id}/rutina/manual`, {
          dias: diasManual.map((d) => ({ dia_semana: d.dia_semana, ejercicios: d.ejercicios.map((ej) => ej.id) })),
        }));
      } else if (modo === 'split') {
        marcar(await api.put(`/usuarios/${usuario.id}/equipamiento`, {
          tipo: equipoTipo,
          checklist: equipoTipo === 'casa' || equipoTipo === 'mixto' ? checklist : [],
          musculos_ubicacion: equipoTipo === 'mixto' ? musculosUbicacion : {},
        }));
        marcar(await api.post(`/usuarios/${usuario.id}/rutina/split`, {
          dias: diasSplit.map((d) => ({ dia_semana: d.dia_semana, musculos: d.musculos, duracion_minutos: Number(d.duracion_minutos) })),
        }));
      } else {
        const duracionPorDia = Object.fromEntries(dias.map((d) => [d, Number(duracion)]));
        marcar(await api.put(`/usuarios/${usuario.id}/disponibilidad`, {
          dias_especificos: dias, duracion_sesion: duracionPorDia,
        }));
        marcar(await api.put(`/usuarios/${usuario.id}/equipamiento`, {
          tipo: equipoTipo,
          checklist: equipoTipo === 'casa' || equipoTipo === 'mixto' ? checklist : [],
          musculos_ubicacion: equipoTipo === 'mixto' ? musculosUbicacion : {},
        }));
        marcar(await api.post(`/usuarios/${usuario.id}/rutina`, {
          variante_split: (dias.length === 4 || dias.length === 5) ? varianteSplit : undefined,
        }));
      }

      // Si algo quedo pendiente de aprobacion del coach, no hay rutina nueva
      // (o no refleja lo recien pedido) - mandamos a Progreso, que muestra
      // que esta esperando aprobacion, en vez de a Entrenamiento como si ya
      // se hubiera aplicado.
      const base = usuarioIdParam ? `/coach/clientes/${usuarioIdParam}` : '';
      navigate(`${base}${huboPendientes ? '/progreso' : '/entrenamiento'}`);
    } catch (err) {
      setError(err.message || 'No se pudo generar la rutina.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="min-h-dvh px-6 py-10 max-w-md mx-auto flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-bold">Contanos cómo entrenás</h1>
        <p className="text-[13px] text-text-muted">Con esto armamos tu rutina y la semana de testeo.</p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-7">
        <section className="flex flex-col gap-3">
          <span className="text-xs font-semibold text-text-muted uppercase tracking-wide">Cómo querés armar tu rutina</span>
          <div className="flex gap-2">
            {[
              { id: 'auto', label: 'Generarla automáticamente' },
              { id: 'split', label: 'Elegir mi split' },
              { id: 'manual', label: 'Armarla yo mismo' },
            ].map((op) => (
              <button
                type="button"
                key={op.id}
                onClick={() => setModo(op.id)}
                className={`flex-1 h-14 rounded-lg border text-[11.5px] font-semibold px-1.5 ${
                  modo === op.id ? 'bg-accent text-accent-fg border-accent' : 'bg-surface border-border text-text-muted'
                }`}
              >
                {op.label}
              </button>
            ))}
          </div>
          {modo === 'manual' && (
            <p className="text-[12px] text-text-muted">
              Elegís vos los ejercicios de cada día. Igual seguimos calculando el rango de reps, la
              progresión semana a semana y el volumen por músculo.
            </p>
          )}
          {modo === 'split' && (
            <p className="text-[12px] text-text-muted">
              Elegís vos qué músculos entrenás cada día (ej. espalda+bíceps, pecho+tríceps, piernas).
              El sistema elige los ejercicios dentro de cada día, igual que en el modo automático.
            </p>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <span className="text-xs font-semibold text-text-muted uppercase tracking-wide">Objetivo</span>
          <div className="flex gap-2">
            {['fuerza', 'hipertrofia', 'rendimiento'].map((t) => (
              <button
                type="button"
                key={t}
                onClick={() => setTipo(t)}
                className={`flex-1 h-10 rounded-lg border text-[13px] font-semibold capitalize ${
                  tipo === t ? 'bg-accent text-accent-fg border-accent' : 'bg-surface border-border text-text-muted'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <input
            value={subObjetivo}
            onChange={(e) => setSubObjetivo(e.target.value)}
            placeholder="Sub-objetivo (ej. ganancia global, 1RM sentadilla…)"
            className="h-11 rounded-[10px] border border-border bg-surface px-3.5 text-[14px] outline-none focus:border-accent"
          />
          {tipo === 'rendimiento' && (
            <input
              value={deporte}
              onChange={(e) => setDeporte(e.target.value)}
              placeholder="Deporte"
              className="h-11 rounded-[10px] border border-border bg-surface px-3.5 text-[14px] outline-none focus:border-accent"
            />
          )}
        </section>

        {modo === 'auto' && (
          <section className="flex flex-col gap-3">
            <span className="text-xs font-semibold text-text-muted uppercase tracking-wide">Días disponibles</span>
            <div className="flex gap-1.5 flex-wrap">
              {DIAS.map((d) => (
                <button
                  type="button"
                  key={d.id}
                  onClick={() => toggleDia(d.id)}
                  className={`w-11 h-11 rounded-full border text-[12.5px] font-semibold ${
                    dias.includes(d.id) ? 'bg-accent text-accent-fg border-accent' : 'bg-surface border-border text-text-muted'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-3 text-[13px] text-text-muted">
              Minutos por sesión
              <input
                type="number"
                min={30}
                max={90}
                step={5}
                value={duracion}
                onChange={(e) => setDuracion(e.target.value)}
                className="w-20 h-9 rounded-lg border border-border bg-surface px-2.5 tabular text-[13.5px] text-text outline-none focus:border-accent"
              />
            </label>

            {(dias.length === 4 || dias.length === 5) && (
              <div className="flex flex-col gap-2">
                <span className="text-[12px] text-text-muted">Cómo repartir la semana</span>
                <div className="flex flex-col gap-1.5">
                  {[
                    {
                      id: 'upper_lower',
                      label: dias.length === 4 ? 'Upper / Lower ×2' : 'Push/Pull/Legs + Upper/Lower',
                      hint: 'Todo el cuerpo con frecuencia 2×.',
                    },
                    {
                      id: 'push_pull',
                      label: dias.length === 4 ? 'Push / Pull ×2' : 'Push/Pull/Legs + Push/Pull',
                      hint: dias.length === 4
                        ? 'Solo torso (pecho, espalda, hombros, brazos) — sin piernas.'
                        : 'Más foco en torso (frecuencia 2×); piernas queda en frecuencia 1×.',
                    },
                  ].map((v) => (
                    <button
                      type="button"
                      key={v.id}
                      onClick={() => setVarianteSplit(v.id)}
                      className={`text-left rounded-lg border px-3 py-2 ${
                        varianteSplit === v.id ? 'bg-accent text-accent-fg border-accent' : 'bg-surface border-border text-text-muted'
                      }`}
                    >
                      <div className="text-[12.5px] font-semibold">{v.label}</div>
                      <div className={`text-[11px] ${varianteSplit === v.id ? 'opacity-90' : 'text-text-faint'}`}>{v.hint}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {modo === 'split' && (
          <section className="flex flex-col gap-3">
            <span className="text-xs font-semibold text-text-muted uppercase tracking-wide">Tu split</span>
            <ArmadoSplitPersonalizado dias={diasSplit} onChange={setDiasSplit} />
          </section>
        )}

        {(modo === 'auto' || modo === 'split') && (
          <>
            <section className="flex flex-col gap-3">
              <span className="text-xs font-semibold text-text-muted uppercase tracking-wide">Equipamiento</span>
              <div className="flex gap-2">
                {['gimnasio', 'casa', 'mixto'].map((t) => (
                  <button
                    type="button"
                    key={t}
                    onClick={() => setEquipoTipo(t)}
                    className={`flex-1 h-10 rounded-lg border text-[13px] font-semibold capitalize ${
                      equipoTipo === t ? 'bg-accent text-accent-fg border-accent' : 'bg-surface border-border text-text-muted'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              {(equipoTipo === 'casa' || equipoTipo === 'mixto') && (
                <div className="flex flex-col gap-2">
                  {equipoTipo === 'mixto' && (
                    <span className="text-[12px] text-text-muted">Qué tenés disponible en los músculos que entrenás en casa:</span>
                  )}
                  <div className="flex gap-1.5 flex-wrap">
                    {EQUIPO_TAGS.map((tag) => (
                      <button
                        type="button"
                        key={tag}
                        onClick={() => toggleTag(tag)}
                        className={`px-3 h-8 rounded-full border text-[12px] font-medium ${
                          checklist.includes(tag) ? 'bg-accent text-accent-fg border-accent' : 'bg-surface border-border text-text-muted'
                        }`}
                      >
                        {tag.replace('_', ' ')}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {equipoTipo === 'mixto' && (
                <div className="flex flex-col gap-2">
                  <span className="text-[12px] text-text-muted">
                    Elegí qué músculos entrenás en casa (opcional — el que no toques se asume en el gimnasio):
                  </span>
                  <div className="flex gap-1.5 flex-wrap">
                    {MUSCULOS.map((m) => (
                      <button
                        type="button"
                        key={m.id}
                        onClick={() => toggleMusculoEnCasa(m.id)}
                        className={`px-3 h-8 rounded-full border text-[12px] font-medium ${
                          musculosUbicacion[m.id] === 'casa'
                            ? 'bg-accent text-accent-fg border-accent'
                            : 'bg-surface border-border text-text-muted'
                        }`}
                      >
                        {m.label} {musculosUbicacion[m.id] === 'casa' ? '(casa)' : '(gym)'}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </>
        )}

        {modo === 'manual' && (
          <section className="flex flex-col gap-3">
            <span className="text-xs font-semibold text-text-muted uppercase tracking-wide">Tus días y ejercicios</span>
            <ArmadoManualRutina dias={diasManual} onChange={setDiasManual} />
          </section>
        )}

        {error && <p className="text-[13px] text-danger">{error}</p>}

        <button
          type="submit"
          disabled={enviando}
          className="h-12 rounded-[10px] bg-accent text-accent-fg text-[15px] font-semibold disabled:opacity-60"
        >
          {enviando ? 'Guardando rutina…' : modo === 'manual' ? 'Guardar mi rutina' : modo === 'split' ? 'Generar con mi split' : 'Generar mi rutina'}
        </button>
      </form>
    </div>
  );
}
