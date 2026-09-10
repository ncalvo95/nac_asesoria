import { createContext, useContext, useEffect, useState } from 'react';

const InstallPromptContext = createContext(null);

function yaEstaInstalada() {
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
  // iOS Safari no tiene display-mode: standalone, pero expone este flag.
  if (window.navigator.standalone) return true;
  return false;
}

// Chrome/Edge/Android disparan "beforeinstallprompt" cuando la app cumple
// los requisitos de instalable (manifest + service worker) - hay que
// interceptarlo con preventDefault() y guardarlo para poder mostrarlo
// nosotros mismos con un boton propio ("Instalar app") en vez de esperar
// al mini-infobar del navegador. iOS Safari nunca dispara este evento, asi
// que ahi el boton simplemente no aparece (no hay forma programatica de
// instalar en iOS).
export function InstallPromptProvider({ children }) {
  const [promptEvent, setPromptEvent] = useState(null);
  const [instalada, setInstalada] = useState(yaEstaInstalada);

  useEffect(() => {
    function onBeforeInstallPrompt(e) {
      e.preventDefault();
      setPromptEvent(e);
    }
    function onAppInstalled() {
      setPromptEvent(null);
      setInstalada(true);
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  async function instalar() {
    if (!promptEvent) return;
    promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    if (outcome === 'accepted') setInstalada(true);
    setPromptEvent(null);
  }

  const puedeInstalar = Boolean(promptEvent) && !instalada;

  return (
    <InstallPromptContext.Provider value={{ puedeInstalar, instalada, instalar }}>
      {children}
    </InstallPromptContext.Provider>
  );
}

export function useInstallPrompt() {
  return useContext(InstallPromptContext);
}
