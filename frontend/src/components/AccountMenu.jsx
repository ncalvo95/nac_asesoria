import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import { useInstallPrompt } from '../context/InstallPromptContext.jsx';
import ChangePasswordModal from './ChangePasswordModal.jsx';
import SessionsModal from './SessionsModal.jsx';

const TEMAS = [
  { id: 'sistema', label: 'Auto' },
  { id: 'claro', label: 'Claro' },
  { id: 'oscuro', label: 'Oscuro' },
];

// Reemplaza el viejo boton combinado "{nombre} · Salir" (clickear el
// nombre desloguea, no hay forma de llegar a nada mas) por un dropdown
// donde el nombre solo abre un menu, y "Salir" es una opcion mas ahi
// adentro junto con tema, cambiar contraseña y mis sesiones.
export default function AccountMenu() {
  const { usuario, logout } = useAuth();
  const { tema, setTema } = useTheme();
  const { puedeInstalar, instalar } = useInstallPrompt();
  const [abierto, setAbierto] = useState(false);
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [mostrarSesiones, setMostrarSesiones] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onMouseDown(e) {
      if (ref.current && !ref.current.contains(e.target)) setAbierto(false);
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  if (!usuario) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="text-xs font-semibold text-text-muted flex items-center gap-1"
      >
        {usuario.nombre}
        <span className="text-text-faint text-[10px]">▾</span>
      </button>

      {abierto && (
        <div className="absolute right-0 top-full mt-2 w-56 bg-surface border border-border rounded-xl shadow-lg p-2 flex flex-col gap-1 z-40">
          <div className="px-2 py-1.5 border-b border-border mb-1">
            <div className="text-[13px] font-semibold truncate">{usuario.nombre}</div>
            <div className="text-[11px] text-text-faint truncate">@{usuario.usuario}</div>
          </div>

          <div className="flex gap-1 px-1 pb-1">
            {TEMAS.map((t) => (
              <button
                type="button"
                key={t.id}
                onClick={() => setTema(t.id)}
                className={`flex-1 h-7 rounded-md border text-[11px] font-semibold ${
                  tema === t.id ? 'bg-accent text-accent-fg border-accent' : 'bg-bg border-border text-text-muted'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {puedeInstalar && (
            <button
              type="button"
              onClick={() => { setAbierto(false); instalar(); }}
              className="text-left h-9 rounded-lg px-2 text-[12.5px] font-medium text-accent hover:bg-bg"
            >
              Instalar app
            </button>
          )}
          <button
            type="button"
            onClick={() => { setAbierto(false); setMostrarPassword(true); }}
            className="text-left h-9 rounded-lg px-2 text-[12.5px] font-medium text-text hover:bg-bg"
          >
            Cambiar contraseña
          </button>
          <button
            type="button"
            onClick={() => { setAbierto(false); setMostrarSesiones(true); }}
            className="text-left h-9 rounded-lg px-2 text-[12.5px] font-medium text-text hover:bg-bg"
          >
            Mis sesiones
          </button>

          <div className="border-t border-border my-1" />

          <button
            type="button"
            onClick={() => { setAbierto(false); logout(); }}
            className="text-left h-9 rounded-lg px-2 text-[12.5px] font-semibold text-danger hover:bg-danger-bg"
          >
            Salir
          </button>
        </div>
      )}

      {mostrarPassword && <ChangePasswordModal onClose={() => setMostrarPassword(false)} />}
      {mostrarSesiones && <SessionsModal onClose={() => setMostrarSesiones(false)} />}
    </div>
  );
}
