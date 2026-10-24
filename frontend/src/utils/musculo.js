// Los nombres de la tabla `musculo` no llevan tildes y los compuestos usan
// guion bajo ("deltoides_lateral"); esto los deja legibles para mostrar
// ("deltoides lateral", "glúteos"). Solo para mostrar: las claves y
// comparaciones siguen usando el nombre de la base.
const CON_TILDE = {
  gluteos: 'glúteos',
  biceps: 'bíceps',
  triceps: 'tríceps',
  cuadriceps: 'cuádriceps',
};

export function formatearMusculo(nombre) {
  const limpio = (nombre || '').replace(/_/g, ' ');
  return limpio.split(' ').map((p) => CON_TILDE[p] ?? p).join(' ');
}
