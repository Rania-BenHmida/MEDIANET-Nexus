export const API_BASE = import.meta.env.VITE_DJANGO_API_URL ?? "http://localhost:8000/api";
const BASE = API_BASE;

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, options);
  if (!res.ok) {
    let message = `API error ${res.status}: ${path}`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch { /* non-JSON body — keep default message */ }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export const get  = <T>(path: string) => request<T>(path);
export const post = <T>(path: string, body: unknown) =>
  request<T>(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
export const patch = <T>(path: string, body: unknown) =>
  request<T>(path, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
export const del  = <T>(path: string) => request<T>(path, { method: "DELETE" });