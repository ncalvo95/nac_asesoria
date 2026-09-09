import { useTheme } from '../context/ThemeContext.jsx';

// Boton chico que va al lado de "Salir" en los headers - cicla
// sistema -> claro -> oscuro -> sistema.
export default function ThemeToggle() {
  const { ciclar, label } = useTheme();
  return (
    <button
      type="button"
      onClick={ciclar}
      title="Cambiar tema (claro / oscuro / automático)"
      className="text-xs font-semibold text-text-muted border border-border rounded-md px-2 py-1"
    >
      {label}
    </button>
  );
}
