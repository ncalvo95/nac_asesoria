// import.meta.env.BASE_URL viene del `base` configurado en vite.config.js
// (siempre termina en "/"), asi que esto arma bien tanto en la raiz ("/")
// como servido bajo un subpath (ej. "/nac_asesoria/") sin tocar nada mas.
export const API_BASE = `${import.meta.env.BASE_URL}api`;

async function request(method, path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return null;

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    const message = (isJson && data?.error) || `Error ${res.status}`;
    throw new ApiError(message, res.status, isJson ? data : null);
  }
  return data;
}

export class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body ?? {}),
  put: (path, body) => request('PUT', path, body ?? {}),
  patch: (path, body) => request('PATCH', path, body ?? {}),
  del: (path, body) => request('DELETE', path, body),
};
