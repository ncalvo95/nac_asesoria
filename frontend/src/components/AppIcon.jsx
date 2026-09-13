import iconNac from '../assets/icon-nac.png';

// Version chica del logo (sin el texto "N.A.C · ASESORÍA", que a este
// tamaño quedaria ilegible) para los headers - el logo completo con texto
// se usa aparte en Login, donde hay lugar para que se vea grande.
export default function AppIcon({ size = 18, className = '' }) {
  return (
    <img
      src={iconNac}
      width={size}
      height={size}
      alt=""
      className={`rounded-full ${className}`}
    />
  );
}
