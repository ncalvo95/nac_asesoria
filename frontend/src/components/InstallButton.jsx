import { useInstallPrompt } from '../context/InstallPromptContext.jsx';

// Boton chico "Instalar" que solo aparece cuando el navegador ya disparo
// beforeinstallprompt (Chrome/Edge/Android) - en iOS Safari, que nunca
// dispara ese evento, este boton simplemente no se renderiza.
export default function InstallButton() {
  const { puedeInstalar, instalar } = useInstallPrompt();
  if (!puedeInstalar) return null;
  return (
    <button
      type="button"
      onClick={instalar}
      title="Instalar la app en este dispositivo"
      className="text-xs font-semibold text-accent border border-accent rounded-md px-2 py-1"
    >
      Instalar
    </button>
  );
}
