
export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/$/, '');

const TOKEN_KEY = 'brl_chat_token';
const USER_KEY = 'brl_chat_user';
 
export function getToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}
export function getStoredUser() {
  const raw = sessionStorage.getItem(USER_KEY);
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
export function storeSession(token, user) {
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
}
export function clearSession() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
}
 
export async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw { status: 0, message: 'Cannot reach the server. Is the backend running?' };
  }

  let data = {};
  try {
    data = await res.json();
  } catch {
    
  }

  if (!res.ok) {
    
    if (res.status === 401 && auth && token) clearSession();
    throw { status: res.status, message: data.message || 'Request failed' };
  }
  return data;
}
