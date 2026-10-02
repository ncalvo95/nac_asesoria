import { useAuth } from '../context/AuthContext.jsx';
import PanelAdminNutricion from '../components/PanelAdminNutricion.jsx';

// Etapa 2 de 5 del modulo de nutricion: por ahora esta pestaña solo tiene
// contenido real para el admin (configurar el motor de calculo). Coach y
// cliente ven un aviso hasta la Etapa 3 (armar/ver el propio plan).
export default function NutricionPage() {
  const { usuario } = useAuth();

  if (usuario?.rol === 'admin') return <PanelAdminNutricion />;

  return (
    <div className="p-4 flex flex-col gap-3 max-w-xl w-full mx-auto">
      <h1 className="text-[16px] font-bold">Nutrición</h1>
      <div className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-1.5">
        <p className="text-[13px] text-text-muted">
          Muy pronto vas a poder armar acá tu plan de calorías y macros (mantenimiento, volumen o definición, con seguimiento semana a semana).
        </p>
        <p className="text-[12.5px] text-text-faint">
          Por ahora el administrador está terminando de configurar los valores que lo van a calcular.
        </p>
      </div>
    </div>
  );
}
