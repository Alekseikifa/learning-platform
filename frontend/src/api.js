// Автоматически выбираем адрес бэкенда:
// - локально (при npm run dev) — Vite-прокси
// - на проде (Render) — жёстко указываем URL
const BASE = import.meta.env.DEV
  ? ""
  : "https://learning-platform-backend-42b6.onrender.com";

export function getToken() {
  return localStorage.getItem("token");
}
export function setToken(t) {
  if (t) localStorage.setItem("token", t);
  else localStorage.removeItem("token");
}
export function getUser() {
  try { return JSON.parse(localStorage.getItem("user") || "null"); }
  catch { return null; }
}
export function setUser(u) {
  if (u) localStorage.setItem("user", JSON.stringify(u));
  else localStorage.removeItem("user");
}

export async function api(path, opts = {}) {
  const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, { ...opts, headers });

  if (res.status === 401) {
    setToken(null); setUser(null);
    if (location.pathname !== "/login") location.href = "/login";
    throw new Error("unauthorized");
  }
  if (!res.ok) {
    let detail = "Ошибка запроса";
    try { detail = (await res.json()).detail || detail; } catch {}
    throw new Error(detail);
  }
  if (res.status === 204) return null;
  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json") ? res.json() : res.text();
}

export async function uploadFile(file, url = "/api/admin/uploads") {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${getToken()}` },
    body: fd,
  });
  if (!res.ok) {
    let detail = "Ошибка загрузки";
    try { detail = (await res.json()).detail || detail; } catch {}
    throw new Error(detail);
  }
  return res.json();
}

export function logout() {
  setToken(null); setUser(null);
  location.href = "/login";
}
