import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

const tabs = [
  { to: '/entrenamiento', label: 'Entrenamiento' },
  { to: '/progreso', label: 'Progreso' },
];

export default function Layout() {
  const { usuario, logout } = useAuth();

  return (
    <div className="min-h-dvh flex flex-col bg-bg">
      <header className="flex-none bg-surface border-b border-border px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6.5 7v10M17.5 7v10M2 10v4M22 10v4M6.5 12h11" />
          </svg>
          <span className="text-[15px] font-bold">Bitácora</span>
        </div>
        <button onClick={logout} className="text-xs font-semibold text-text-muted">
          {usuario?.nombre} · Salir
        </button>
      </header>

      <main className="flex-1 overflow-y-auto pb-20">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-surface border-t border-border flex">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) =>
              `flex-1 text-center py-3 text-[13px] font-semibold ${isActive ? 'text-accent' : 'text-text-faint'}`
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
