import { api } from "./db.js";
import { A } from "./state.js";
import { getSession } from "./auth.js";
import { t } from "./strings.js";
import { $, esc, waDigits } from "../shared/util.js";
import { prefs, effTheme } from "../shared/prefs.js";
import { icon } from "../shared/icons.js";
import { toast } from "../shared/ui.js";

export function settingsHtml() {
  const num = A.settings.whatsapp_number || "";
  return `<div class="a-page narrow"><div class="a-head"><div><h1>${t("settings")}</h1><p class="muted">${t("settingsSub")}</p></div></div>
    <section class="a-card pad stack"><h2>${icon("chat", 20)} ${t("waTitle")}</h2><p class="muted">${t("waHelp")}</p>
      <form id="waForm" class="stack" novalidate><div class="field"><label for="wa">${t("waNumber")}</label>
        <input id="wa" class="input" type="tel" inputmode="tel" dir="ltr" value="${esc(num)}" placeholder="201012345678" autocomplete="off">
        <p class="hint" id="waHint">${esc(waHint(num))}</p></div>
        <button class="btn btn-primary" type="submit">${t("save")}</button></form></section>
    <section class="a-card pad stack"><h2>${icon("sliders", 20)} ${t("preferences")}</h2>
      <div class="row-between"><span>${t("language")}</span><button class="btn btn-ghost btn-sm" data-act="lang" lang="${prefs.lang === "ar" ? "en" : "ar"}">${prefs.lang === "ar" ? "English" : "العربية"}</button></div>
      <div class="row-between"><span>${t("theme")}</span><button class="btn btn-ghost btn-sm" data-act="theme">${icon(effTheme() === "dark" ? "sun" : "moon", 16)} ${t(effTheme() === "dark" ? "light" : "dark")}</button></div></section>
    <section class="a-card pad stack"><h2>${icon("user", 20)} ${t("account")}</h2><p class="muted" dir="ltr">${esc(getSession()?.email || "")}</p>
      <div class="d-links"><a class="btn btn-ghost btn-sm" href="/" target="_blank" rel="noopener">${icon("link", 16)} ${t("openStore")}</a>
      <button class="btn btn-ghost btn-sm danger-text" data-act="logout">${icon("logout", 16)} ${t("signOut")}</button></div></section></div>`;
}

const waHint = (v) => {
  const d = waDigits(v);
  return d ? t("waPreview", { n: `+${d}` }) : t("waEmpty");
};

export function bindSettings(root) {
  const input = $("#wa", root);
  input?.addEventListener("input", () => { $("#waHint", root).textContent = waHint(input.value); });
  $("#waForm", root)?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const d = waDigits(input.value);
    if (d && (d.length < 10 || d.length > 15)) return toast(t("waInvalid"), { type: "error" });
    try {
      await api("settings?on_conflict=key", { method: "POST", prefer: "resolution=merge-duplicates", body: { key: "whatsapp_number", value: d } });
      A.settings.whatsapp_number = d;
      input.value = d;
      toast(t("saved"));
    } catch (err) { toast(err.message, { type: "error" }); }
  });
}
