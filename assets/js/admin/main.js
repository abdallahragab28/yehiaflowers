import { login, logout, getSession } from "./auth.js";
import { rpcA } from "./db.js";
import { A, bus, loadOrders, loadCatalog, loadAdminSettings, loadHero, newCount } from "./state.js";
import { t } from "./strings.js";
import { ordersHtml, bindOrders, orderActions, openOrder } from "./orders.js";
import { dashboardHtml } from "./dashboard.js";
import { catalogHtml, bindCatalog, catalogActions } from "./catalog.js";
import { stockHtml, bindStock, stockActions } from "./stock.js";
import { settingsHtml, bindSettings } from "./settings.js";
import { storefrontHtml, storefrontActions } from "./storefront.js";
import { $, $$, esc } from "../shared/util.js";
import { prefs, toggleLang, toggleTheme, effTheme } from "../shared/prefs.js";
import { icon } from "../shared/icons.js";
import { toast } from "../shared/ui.js";

const NAV = [
  ["dashboard", "dashboard", "navDashboard"],
  ["orders", "inbox", "navOrders"],
  ["catalog", "layers", "navCatalog"],
  ["storefront", "image", "navStorefront"],
  ["stock", "package", "navStock"],
  ["settings", "sliders", "navSettings"],
];
const PAGES = {
  dashboard: { html: dashboardHtml },
  orders: { html: ordersHtml, bind: bindOrders },
  catalog: { html: catalogHtml, bind: bindCatalog },
  storefront: { html: storefrontHtml },
  stock: { html: stockHtml, bind: bindStock },
  settings: { html: settingsHtml, bind: bindSettings },
};
const route = () => (location.hash.slice(2).split("/")[0] in PAGES ? location.hash.slice(2).split("/")[0] : "dashboard");
let timer = 0;

/* ---------- Chrome ---------- */
function paintNav() {
  const r = route();
  const n = newCount();
  const item = (cls, [key, ic, label]) => `<a class="${cls}${key === r ? " on" : ""}" href="#/${key}" ${key === r ? 'aria-current="page"' : ""}>${icon(ic, 22)}<span>${t(label)}</span>${key === "orders" && n ? `<em class="nbadge" aria-label="${esc(t("newOrders", { n }))}">${n}</em>` : ""}</a>`;
  $("#sideNav").innerHTML = NAV.map((x) => item("nav-i", x)).join("");
  $("#tabs").innerHTML = NAV.map((x) => item("tab-i", x)).join("");
  document.title = `${n ? `(${n}) ` : ""}${t("adminTitle")}`;
}

function paintChrome() {
  $$("[data-t]").forEach((el) => (el.textContent = t(el.dataset.t)));
  $$("[data-t-ph]").forEach((el) => (el.placeholder = t(el.dataset.tPh)));
  $("#themeBtn").innerHTML = icon(effTheme() === "dark" ? "sun" : "moon", 20);
  $("#langBtn").textContent = prefs.lang === "ar" ? "English" : "العربية";
  $("#langBtn").lang = prefs.lang === "ar" ? "en" : "ar";
  $("#loginLang").textContent = prefs.lang === "ar" ? "English" : "العربية";
  $("#loginLang").lang = prefs.lang === "ar" ? "en" : "ar";
  paintNav();
}

function render() {
  const r = route();
  const y = window.scrollY;
  const root = $("#content");
  root.innerHTML = PAGES[r].html();
  PAGES[r].bind?.(root);
  paintNav();
  window.scrollTo(0, y);
}
bus.render = render;
bus.refreshBadge = paintNav;

/* ---------- Auth screens ---------- */
function showLogin(msg = "") {
  clearInterval(timer);
  $("#shell").hidden = true;
  $("#login").hidden = false;
  $("#loginErr").textContent = msg;
  $("#loginErr").hidden = !msg;
  paintChrome();
  $("#email").focus();
}

async function enter() {
  try {
    if ((await rpcA("is_admin")) !== true) { logout(false); return showLogin(t("noAccess")); }
  } catch (err) {
    if (err.status === 401 || err.status === 403) { logout(false); return showLogin(t("sessionExpired")); }
    return showLogin(t("connError"));
  }
  $("#login").hidden = true;
  $("#shell").hidden = false;
  paintChrome();
  $("#content").innerHTML = `<div class="a-page"><div class="skeleton" style="height:180px"></div></div>`;
  try {
    await Promise.all([loadOrders(), loadCatalog(), loadAdminSettings(), loadHero()]);
  } catch (err) { toast(err.message, { type: "error" }); }
  if (!location.hash) location.hash = "#/dashboard";
  render();
  timer = setInterval(poll, 25000);
}

async function poll() {
  if (document.hidden || $("dialog[open]")) return;
  try {
    const fresh = await loadOrders();
    if (fresh.length) {
      fresh.slice(0, 3).forEach((o) => toast(t("newOrderFrom", { name: o.customer_name }), { ms: 9000, action: { label: t("open"), onClick: () => openOrder(o.id) } }));
    }
    if (["orders", "dashboard"].includes(route())) render(); else paintNav();
  } catch { /* offline: try again on the next tick */ }
}

/* ---------- Events ---------- */
const ACT = {
  ...orderActions, ...catalogActions, ...stockActions, ...storefrontActions,
  closeDrawer(el) { el.closest("dialog")?.close(); },
  lang() { toggleLang(); paintChrome(); render(); },
  theme() { toggleTheme(); paintChrome(); if (route() === "settings") render(); },
  logout() { logout(); },
};
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-act]");
  if (el && ACT[el.dataset.act] && el.tagName !== "INPUT") ACT[el.dataset.act](el, e);
});
document.addEventListener("change", (e) => {
  const el = e.target;
  if (el.tagName === "INPUT" && el.dataset.act && ACT[el.dataset.act]) ACT[el.dataset.act](el, e);
});
window.addEventListener("hashchange", () => { if (!$("#shell").hidden) { render(); window.scrollTo(0, 0); } });
window.addEventListener("yf:signedout", () => { A.seen.clear(); showLogin(); });
document.addEventListener("visibilitychange", () => { if (!document.hidden && !$("#shell").hidden) poll(); });
$("#loginLang").addEventListener("click", () => { toggleLang(); paintChrome(); });
$("#langBtn").addEventListener("click", ACT.lang);
$("#themeBtn").addEventListener("click", ACT.theme);
$("#outBtn").addEventListener("click", ACT.logout);

$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("button[type=submit]", e.target);
  btn.disabled = true;
  $("#loginErr").hidden = true;
  try {
    await login($("#email").value.trim(), $("#password").value);
    $("#password").value = "";
    await enter();
  } catch (err) {
    showLogin(err.status === 400 || err.status === 401 ? t("badLogin") : t("connError"));
  }
  btn.disabled = false;
});

paintChrome();
if (getSession()) enter();
else showLogin();
