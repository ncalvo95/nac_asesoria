import { api } from '../api/client.js';
import { aIso } from '../utils/fechas.js';

// Deja guardado lo que hace falta para entrenar sin internet: la rutina y todo
// lo que sus pantallas piden al abrirse. Se corre al abrir Entrenamiento con
// conexión y cuando vuelve internet, como mucho cada 10 minutos por persona.
// (api.get ya guarda cada respuesta; acá solo se piden las que todavía no se
// habrían pedido, por ejemplo los récords de cada día de la rutina.)

const CADA_MS = 10 * 60 * 1000;
const clave = (usuarioId) => `nac_precarga_${usuarioId}`;

export async function precargarParaSinConexion(usuarioId, { forzar = false } = {}) {
  try {
    const ultima = Number(localStorage.getItem(clave(usuarioId)) || 0);
    if (!forzar && Date.now() - ultima < CADA_MS) return;
  } catch { /* sin storage: se precarga igual */ }

  try {
    const rutina = await api.get(`/usuarios/${usuarioId}/rutina`);
    const pedidos = [
      api.get('/catalogo/musculos'),
      api.get(`/usuarios/${usuarioId}/perfil`),
      api.get(`/usuarios/${usuarioId}/actividad?semanas=13`),
      api.get(`/usuarios/${usuarioId}/mapa-muscular?hoy=${aIso(new Date())}`),
      api.get(`/rutinas/${rutina.id}/progreso`),
      api.get(`/rutinas/${rutina.id}/retesteos`),
      api.get(`/rutinas/${rutina.id}/deload/actual`),
      api.get(`/rutinas/${rutina.id}/testeos`),
      // Récords: el pedido de cada día lleva el id de su sesión de esta semana.
      ...rutina.dias.map((d) => api.get(`/usuarios/${usuarioId}/records${d.sesion_actual?.id ? `?excluir_sesion_id=${d.sesion_actual.id}` : ''}`)),
    ];
    await Promise.allSettled(pedidos);
    try { localStorage.setItem(clave(usuarioId), String(Date.now())); } catch { /* sin storage */ }
  } catch { /* sin conexión o sin rutina: nada que guardar */ }
}
