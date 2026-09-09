import { Link, NavLink, Outlet, useParams } from 'react-router-dom';
import ThemeToggle from './ThemeToggle.jsx';

export default function CoachClientLayout() {
  const { usuarioId } = useParams();

  return (
    <div className="min-h-dvh flex flex-col bg-bg">
      <header className="flex-none bg-surface border-b border-border px-5 py-3 flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <Link to="/coach" className="text-[12px] font-semibold text-text-muted">← Volver a mis clientes</Link>
          <ThemeToggle />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <NavLink
            to={`/coach/clientes/${usuarioId}/entrenamiento`}
            className={({ isActive }) =>
              `px-3 h-8 rounded-full border text-[12.5px] font-semibold flex items-center ${isActive ? 'bg-accent text-accent-fg border-accent' : 'bg-bg border-border text-text-muted'}`
            }
          >
            Entrenamiento
          </NavLink>
          <NavLink
            to={`/coach/clientes/${usuarioId}/rutinas`}
            className={({ isActive }) =>
              `px-3 h-8 rounded-full border text-[12.5px] font-semibold flex items-center ${isActive ? 'bg-accent text-accent-fg border-accent' : 'bg-bg border-border text-text-muted'}`
            }
          >
            Rutinas
          </NavLink>
          <NavLink
            to={`/coach/clientes/${usuarioId}/progreso`}
            className={({ isActive }) =>
              `px-3 h-8 rounded-full border text-[12.5px] font-semibold flex items-center ${isActive ? 'bg-accent text-accent-fg border-accent' : 'bg-bg border-border text-text-muted'}`
            }
          >
            Progreso
          </NavLink>
          <NavLink
            to={`/coach/clientes/${usuarioId}/reportes`}
            className={({ isActive }) =>
              `px-3 h-8 rounded-full border text-[12.5px] font-semibold flex items-center ${isActive ? 'bg-accent text-accent-fg border-accent' : 'bg-bg border-border text-text-muted'}`
            }
          >
            Reportes
          </NavLink>
          <NavLink
            to={`/coach/clientes/${usuarioId}/preferencias`}
            className={({ isActive }) =>
              `px-3 h-8 rounded-full border text-[12.5px] font-semibold flex items-center ${isActive ? 'bg-accent text-accent-fg border-accent' : 'bg-bg border-border text-text-muted'}`
            }
          >
            Preferencias
          </NavLink>
        </div>
      </header>
      <main className="flex-1 overflow-y-auto pb-8">
        <Outlet />
      </main>
    </div>
  );
}
