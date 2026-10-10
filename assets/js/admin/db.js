import { CFG } from "../shared/config.js";
import { getToken } from "./auth.js";
import { timeout } from "../shared/api.js";

const enc = (p) => p.split("/").map(encodeURIComponent).join("/");

/** Authenticated PostgREST call. `prefer` can be "return=representation" to get saved rows back. */
export async function api(path, { method = "GET", body, prefer, signal } = {}) {
  const token = await getToken();
  const res = await fetch(`${CFG.url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: CFG.key,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: signal || timeout(15000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let msg = text;
    try { msg = JSON.parse(text).message || text; } catch { /* plain text */ }
    const err = new Error(msg || res.statusText);
    err.status = res.status;
    throw err;
  }
  return res.status === 204 ? null : res.json().catch(() => null);
}

export const rpcA = (fn, args = {}) => api(`rpc/${fn}`, { method: "POST", body: args });

export async function uploadFile(path, blob) {
  const token = await getToken();
  const res = await fetch(`${CFG.url}/storage/v1/object/${CFG.bucket}/${enc(path)}`, {
    method: "POST",
    headers: { apikey: CFG.key, Authorization: `Bearer ${token}`, "Content-Type": blob.type, "cache-control": "max-age=31536000" },
    body: blob,
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.message || j.error || res.statusText);
  }
}

export async function removeFiles(paths) {
  if (!paths.length) return;
  const token = await getToken();
  await fetch(`${CFG.url}/storage/v1/object/${CFG.bucket}`, {
    method: "DELETE",
    headers: { apikey: CFG.key, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prefixes: paths }),
  });
}
