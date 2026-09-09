// Etiqueta legible tipo "Chrome en Windows" a partir del user-agent crudo -
// solo cubre los casos comunes, es cosmetico para "Mis sesiones" (no hace
// falta que sea exhaustivo).
export function etiquetaDispositivo(userAgent) {
  if (!userAgent) return 'Dispositivo desconocido';
  const ua = userAgent;

  let navegador = 'Navegador';
  if (/Edg\//.test(ua)) navegador = 'Edge';
  else if (/OPR\//.test(ua)) navegador = 'Opera';
  else if (/CriOS/.test(ua)) navegador = 'Chrome';
  else if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) navegador = 'Chrome';
  else if (/FxiOS/.test(ua)) navegador = 'Firefox';
  else if (/Firefox\//.test(ua)) navegador = 'Firefox';
  else if (/Safari\//.test(ua) && /Version\//.test(ua)) navegador = 'Safari';

  let so = 'un dispositivo';
  if (/Windows/.test(ua)) so = 'Windows';
  else if (/Android/.test(ua)) so = 'Android';
  else if (/iPhone|iPad|iPod/.test(ua)) so = 'iOS';
  else if (/Mac OS X/.test(ua)) so = 'Mac';
  else if (/Linux/.test(ua)) so = 'Linux';

  return `${navegador} en ${so}`;
}
