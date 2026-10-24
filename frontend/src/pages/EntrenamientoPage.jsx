import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api/client.js';
import PanelAdminEntrenamiento from '../components/PanelAdminEntrenamiento.jsx';
import { Semana0Form } from '../components/entrenamiento/Semana0Form.jsx';
import { DiaEntrenamiento } from '../components/entrenamiento/DiaEntrenamiento.jsx';

export default function EntrenamientoPage() {
  const { usuario: sesion } = useAuth();
  const { usuarioId: usuarioIdParam } = useParams();

  // Mismo criterio que NutricionPage: la propia pantalla del admin (sin
  // usuarioId en la URL) muestra el panel de configuración global en vez
  // de una rutina personal - el admin es un rol de configuración acá, no
  // un alumno.
  if (!usuarioIdParam && sesion.rol === 'admin') return <PanelAdminEntrenamiento />;

  const usuario = usuarioIdParam ? { id: Number(usuarioIdParam) } : sesion;
  const [rutina, setRutina] = useState(null);
  const [progreso, setProgreso] = useState(null);
  const [todosMusculos, setTodosMusculos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  async function cargar({ silencioso = false } = {}) {
    if (!silencioso) setCargando(true);
    try {
      const r = await api.get(`/usuarios/${usuario.id}/rutina`);
      setRutina(r);
      const p = await api.get(`/rutinas/${r.id}/progreso`).catch(() => null);
      setProgreso(p);
    } catch (err) {
      setError(err.message);
    } finally {
      if (!silencioso) setCargando(false);
    }
  }

  // Refetch tras guardar algo: no vuelve a mostrar la pantalla de carga
  // completa (eso desmontaría el formulario y perdería el cartel de "guardado").
  const recargarSilencioso = () => cargar({ silencioso: true });

  useEffect(() => { cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [usuario.id]);
  // Catalogo completo de musculos (no solo los del dia): permite agregar un
  // ejercicio de un musculo que el dia todavia no entrenaba, por si surge
  // durante el entrenamiento - se carga una sola vez acá y se pasa hacia
  // abajo, en vez de que cada AgregarEjercicioDia lo pida por su cuenta.
  useEffect(() => { api.get('/catalogo/musculos').then(setTodosMusculos).catch(() => {}); }, []);

  if (cargando) return <div className="p-6 text-sm text-text-muted">Cargando tu rutina…</div>;
  if (error) return <div className="p-6 text-sm text-danger">{error}</div>;
  if (!rutina) return null;

  const microcicloActual = rutina.microciclos.find((m) => m.estado === 'en_curso');

  if (!microcicloActual) {
    return <div className="p-6 text-sm text-text-muted">No hay un microciclo activo. Avisale a tu coach.</div>;
  }

  if (microcicloActual.tipo === 'testeo') {
    return <Semana0Form rutina={rutina} usuario={usuario} microciclo={microcicloActual} onListo={cargar} todosMusculos={todosMusculos} />;
  }

  return (
    <DiaEntrenamiento
      rutina={rutina}
      microciclo={microcicloActual}
      usuario={usuario}
      actorRol={sesion.rol}
      progreso={progreso}
      onGuardado={recargarSilencioso}
      onRutinaCambiada={recargarSilencioso}
      todosMusculos={todosMusculos}
    />
  );
}
