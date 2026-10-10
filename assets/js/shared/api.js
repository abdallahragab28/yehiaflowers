import { CFG } from "./config.js";

const BASE = `${CFG.url}/rest/v1/`;
const publicHeaders = { apikey: CFG.key, "Content-Type": "application/json" };

export const timeout = (ms = 10000) => (AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined);

/** Minimal PostgREST client for anonymous (public) requests. */
export async function rest(path, { method = "GET", body, headers, signal } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...publicHeaders, ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: signal || timeout(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(extractMessage(text) || res.statusText);
    err.status = res.status;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

export const rpc = (fn, args, signal) => rest(`rpc/${fn}`, { method: "POST", body: args, signal });

function extractMessage(text) {
  try {
    const j = JSON.parse(text);
    return j.message || j.error_description || j.msg || text;
  } catch {
    return text;
  }
}

const encodePath = (p) => p.split("/").map(encodeURIComponent).join("/");

/** Public URL for a stored photo. `thumb` uses the small copy created by the admin panel. */
export function photoUrl(path, size = "full") {
  if (!path) return "";
  const p = size === "thumb" ? thumbPath(path) : path;
  return `${CFG.url}/storage/v1/object/public/${CFG.bucket}/${encodePath(p)}`;
}
export const thumbPath = (path) => path.replace(/\.(webp|jpg)$/i, "_t.$1");

export async function loadSettings() {
  const rows = await rest("settings?select=key,value");
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export const siteUrl = () => (CFG.siteUrl || location.origin).replace(/\/$/, "");
/** Works on any static server (no rewrite needed). On Vercel, /o/<code> also works. */
export const orderLink = (token) => `${siteUrl()}/order/?t=${encodeURIComponent(token)}`;
