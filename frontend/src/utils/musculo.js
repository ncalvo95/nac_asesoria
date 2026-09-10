// Nombres como "deltoides_lateral" usan guion bajo en la base (son el
// nombre tal cual vive en la tabla musculo) pero se ven mal con la clase
// "capitalize" tal cual ("DELTOIDES_LATERAL") - esto los deja legibles
// ("deltoides lateral" -> capitalize los deja "Deltoides lateral").
export function formatearMusculo(nombre) {
  return (nombre || '').replace(/_/g, ' ');
}
