import { useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import PanelAdminNutricion from '../components/PanelAdminNutricion.jsx';
import PlanNutricion from '../components/PlanNutricion.jsx';

// /nutricion (propia) para un admin muestra el panel de configuracion del
// motor; para cualquier otro usuario, o para /coach/clientes/:usuarioId/nutricion
// (coach/admin viendo la nutricion de un cliente puntual), muestra el plan
// de ESA persona - la ruta decide, no el rol del que mira, igual que
// EntrenamientoPage con usuarioIdParam.
export default function NutricionPage() {
  const { usuario: sesion } = useAuth();
  const { usuarioId: usuarioIdParam } = useParams();

  if (!usuarioIdParam && sesion.rol === 'admin') return <PanelAdminNutricion />;

  const usuarioId = usuarioIdParam ? Number(usuarioIdParam) : sesion.id;
  return <PlanNutricion usuarioId={usuarioId} />;
}
