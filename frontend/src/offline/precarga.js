import { api } from '../api/client.js';
import { aIso } from '../utils/fechas.js';
import { leerConexion } from './conexion.js';

// Deja guardado lo que hace falta para entrenar sin internet: la rutina y todo
// lo que sus pantallas piden al abrirse. Se corre al abrir Entrenamiento con
// conexión y cuando vuelve internet, como mucho cada 10 minutos por persona.
// (api.get ya guarda cada respuesta; acá solo se piden las que todavía no se
// habrían pedido, por ejemplo los récords de cada día de la rutina.)

const CADA_MS = 10 * 60 * 1000;
const clave = (usuarioId) => `nac_precarga_${usuarioId}`;

export async function precargarParaSinConexion(usuarioId, rutina, { forzar = false } = {}) {
  try {
    const ultima = Number(localStorage.getItem(clave(usuarioId)) || 0);
    if (!forzar && Date.now() - ultima < CADA_MS) return;
  } catch { /* sin storage: se precarga igual */ }

  // Un pedido por vez y con pausa: en una Raspberry, 10 pedidos juntos la dejan
  // lenta justo cuando se está abriendo la pantalla.
  const rutas = [
    '/catalogo/musculos',
    `/usuarios/${usuarioId}/perfil`,
    `/usuarios/${usuarioId}/actividad?semanas=13`,
    `/usuarios/${usuarioId}/mapa-muscular?hoy=${aIso(new Date())}`,
    `/rutinas/${rutina.id}/progreso`,
    `/rutinas/${rutina.id}/retesteos`,
    `/rutinas/${rutina.id}/deload/actual`,
    `/rutinas/${rutina.id}/testeos`,
    // Récords: el pedido de cada día lleva el id de su sesión de esta semana.
    ...rutina.dias.map((d) => `/usuarios/${usuarioId}/records${d.sesion_actual?.id ? `?excluir_sesion_id=${d.sesion_actual.id}` : ''}`),
  ];
  let completo = true;
  for (const ruta of rutas) {
    if (leerConexion().sinConexion) { completo = false; break; }
    try { await api.get(ruta); } catch { /* una ruta sin copia no frena las demás */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  if (completo) {
    try { localStorage.setItem(clave(usuarioId), String(Date.now())); } catch { /* sin storage */ }
  }
}
