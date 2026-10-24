// Utilidades de fecha para fechas "YYYY-MM-DD" sin hora - se arman siempre en
// hora local para que un dia no corra por la zona horaria (new Date('YYYY-MM-DD')
// las interpreta como UTC y en America puede dar el dia anterior).

export function parseFechaLocal(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function aIso(fecha) {
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${fecha.getFullYear()}-${m}-${d}`;
}

export function fechaCorta(iso) {
  const [, m, d] = iso.split('-');
  return `${Number(d)}/${Number(m)}`;
}

// Lunes de la semana de `fecha` (la semana empieza el lunes, como en el resto de la app).
export function lunesDe(fecha) {
  const f = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  const delta = (f.getDay() + 6) % 7;
  f.setDate(f.getDate() - delta);
  return f;
}
