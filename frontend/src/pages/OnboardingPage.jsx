import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api/client.js';

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
  const { usuario } = useAuth();
  const navigate = useNavigate();

  const [tipo, setTipo] = useState('hipertrofia');
  const [subObjetivo, setSubObjetivo] = useState('');
  const [deporte, setDeporte] = useState('');
  const [dias, setDias] = useState(['lunes', 'martes', 'jueves', 'viernes']);
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
    if (dias.length < 2 || dias.length > 6) {
      setError('Elegí entre 2 y 6 días.');
      return;
    }
    if (!subObjetivo.trim()) {
      setError('Contanos tu sub-objetivo.');
      return;
    }
    if (tipo === 'rendimiento' && !deporte.trim()) {
      setError('Si el objetivo es rendimiento, indicá el deporte.');
      return;
    }

    setEnviando(true);
    try {
      await api.put(`/usuarios/${usuario.id}/objetivo`, {
        tipo, sub_objetivo: subObjetivo, deporte: tipo === 'rendimiento' ? deporte : undefined,
      });
      const duracionPorDia = Object.fromEntries(dias.map((d) => [d, Number(duracion)]));
      await api.put(`/usuarios/${usuario.id}/disponibilidad`, {
        dias_especificos: dias, duracion_sesion: duracionPorDia,
      });
      await api.put(`/usuarios/${usuario.id}/equipamiento`, {
        tipo: equipoTipo,
        checklist: equipoTipo === 'casa' || equipoTipo === 'mixto' ? checklist : [],
        musculos_ubicacion: equipoTipo === 'mixto' ? musculosUbicacion : {},
      });
      await api.post(`/usuarios/${usuario.id}/rutina`);
      navigate('/entrenamiento');
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
        </section>

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

        {error && <p className="text-[13px] text-danger">{error}</p>}

        <button
          type="submit"
          disabled={enviando}
          className="h-12 rounded-[10px] bg-accent text-accent-fg text-[15px] font-semibold disabled:opacity-60"
        >
          {enviando ? 'Generando rutina…' : 'Generar mi rutina'}
        </button>
      </form>
    </div>
  );
}
