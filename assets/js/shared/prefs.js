import { store } from "./util.js";

/** Language and theme, shared by the store, the order page and the admin panel. */
export const prefs = {
  lang: store.get("yf.lang", "ar") === "en" ? "en" : "ar",
  theme: store.get("yf.theme", ""),
};

export const effTheme = () =>
  prefs.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

export function applyPrefs() {
  const root = document.documentElement;
  root.lang = prefs.lang;
  root.dir = prefs.lang === "ar" ? "rtl" : "ltr";
  if (prefs.theme) root.dataset.theme = prefs.theme;
  else root.removeAttribute("data-theme");
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = effTheme() === "dark" ? "#0E1712" : "#14452F";
}

export function setLang(lang) {
  prefs.lang = lang === "en" ? "en" : "ar";
  store.set("yf.lang", prefs.lang);
  applyPrefs();
}

export function toggleLang() {
  setLang(prefs.lang === "ar" ? "en" : "ar");
}

export function toggleTheme() {
  prefs.theme = effTheme() === "dark" ? "light" : "dark";
  store.set("yf.theme", prefs.theme);
  applyPrefs();
}

applyPrefs();
