import { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext(null);
const STORAGE_KEY = 'nac_asesoria_tema';
const ORDEN = ['sistema', 'claro', 'oscuro'];
const LABEL = { sistema: 'Auto', claro: 'Claro', oscuro: 'Oscuro' };

function temaGuardado() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return ORDEN.includes(v) ? v : 'sistema';
  } catch {
    return 'sistema';
  }
}

// Por default el tema sigue prefers-color-scheme (ver index.css), pero el
// usuario puede fijarlo a mano - queda en localStorage y se aplica como
// data-theme en <html> (index.css tiene un bloque para cada valor que pisa
// la media query).
export function ThemeProvider({ children }) {
  const [tema, setTema] = useState(temaGuardado);

  useEffect(() => {
    if (tema === 'sistema') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', tema);
    }
    try {
      localStorage.setItem(STORAGE_KEY, tema);
    } catch {
      // localStorage puede no estar disponible (modo privado) - no es critico
    }
  }, [tema]);

  function ciclar() {
    setTema((actual) => ORDEN[(ORDEN.indexOf(actual) + 1) % ORDEN.length]);
  }

  return (
    <ThemeContext.Provider value={{ tema, setTema, ciclar, label: LABEL[tema] }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
