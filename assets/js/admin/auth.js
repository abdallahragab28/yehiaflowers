import { CFG } from "../shared/config.js";
import { store } from "../shared/util.js";

/** Email and password sign-in against Supabase Auth, using plain fetch (no library needed). */
const KEY = "yf.admin.session";
let session = store.get(KEY, null);
const baseHeaders = { apikey: CFG.key, "Content-Type": "application/json" };

async function authCall(path, body, token) {
  const res = await fetch(`${CFG.url}/auth/v1/${path}`, {
    method: "POST",
    headers: token ? { ...baseHeaders, Authorization: `Bearer ${token}` } : baseHeaders,
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.error_description || json.msg || json.message || res.statusText);
    err.status = res.status;
    throw err;
  }
  return json;
}

function keep(j) {
  session = {
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    expires_at: j.expires_at || Math.floor(Date.now() / 1000) + (j.expires_in || 3600),
    email: j.user?.email || session?.email || "",
  };
  store.set(KEY, session);
  return session;
}

export const getSession = () => session;

export async function login(email, password) {
  return keep(await authCall("token?grant_type=password", { email, password }));
}

let refreshing = null;
/** Returns a valid access token, refreshing it shortly before it expires. */
export async function getToken() {
  if (!session) throw new Error("signed out");
  if (session.expires_at - Date.now() / 1000 > 60) return session.access_token;
  refreshing ??= authCall("token?grant_type=refresh_token", { refresh_token: session.refresh_token })
    .then(keep)
    .catch((e) => { logout(false); throw e; })
    .finally(() => { refreshing = null; });
  return (await refreshing).access_token;
}

export function logout(remote = true) {
  const token = session?.access_token;
  session = null;
  store.del(KEY);
  if (remote && token) authCall("logout", {}, token).catch(() => {});
  window.dispatchEvent(new Event("yf:signedout"));
}
