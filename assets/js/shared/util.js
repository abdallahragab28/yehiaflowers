export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

export const sum = (arr) => arr.reduce((s, x) => s + x, 0);
export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(16).slice(2));
export const nf = (n) => Number(n || 0).toLocaleString("en-US");
export const refOf = (token) => String(token || "").slice(0, 6).toUpperCase();

export function debounce(fn, ms = 150) {
  let id;
  return (...args) => {
    clearTimeout(id);
    id = setTimeout(() => fn(...args), ms);
  };
}

/** Safe wrapper around localStorage with JSON values. */
export const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
  },
  del(key) {
    try { localStorage.removeItem(key); } catch { /* storage unavailable */ }
  },
};

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
export const normDigits = (s) =>
  String(s ?? "").replace(/[٠-٩]/g, (d) => AR_DIGITS.indexOf(d)).replace(/[۰-۹]/g, (d) => FA_DIGITS.indexOf(d));

/** Keeps digits, plus and spaces; converts Arabic-Indic digits. */
export const normPhone = (s) => normDigits(s).replace(/[^\d+ ]/g, "").replace(/\s+/g, " ").trim();
export const PHONE_RE = /^\+?[0-9 ]{8,16}$/;

/** International digits for wa.me. A leading 0 is treated as an Egyptian number. */
export function waDigits(phone) {
  let d = normDigits(phone).replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("00")) d = d.slice(2);
  else if (d.startsWith("0")) d = "20" + d.slice(1);
  return d;
}

/** Lowercases and removes Arabic marks so "ورد", "وَرد" and "ورده" match. */
export const normSearch = (s) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه");

export function fmtDate(iso, lang, opts = { dateStyle: "medium", timeStyle: "short" }) {
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-EG-u-nu-latn" : "en-GB", opts).format(new Date(iso));
}

export function timeAgo(iso, lang) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(lang === "ar" ? "ar-EG-u-nu-latn" : "en", { numeric: "auto" });
  if (s < 60) return rtf.format(0, "second");
  if (s < 3600) return rtf.format(-Math.floor(s / 60), "minute");
  if (s < 86400) return rtf.format(-Math.floor(s / 3600), "hour");
  if (s < 86400 * 30) return rtf.format(-Math.floor(s / 86400), "day");
  return fmtDate(iso, lang, { dateStyle: "medium" });
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { /* ignore */ }
    ta.remove();
    return ok;
  }
}

export const slugify = (s) =>
  String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || uid().slice(0, 8);
