import { rpc, photoUrl, loadSettings } from "../shared/api.js";
import { $, $$, esc, fmtDate, nf, refOf, waDigits, copyText } from "../shared/util.js";
import { prefs, toggleLang, toggleTheme, effTheme } from "../shared/prefs.js";
import { makeT, unit, nameOf, altOf, totals, statusLabel } from "../shared/i18n.js";
import { icon } from "../shared/icons.js";
import { toast, lightbox } from "../shared/ui.js";

const t = makeT({
  title: ["Your order", "طلبك"],
  ref: ["Order", "الطلب"],
  for: ["Prepared for", "باسم"],
  items: ["Items", "الأصناف"],
  packs: ["Packs", "كراتين"],
  stems: ["Stems", "الحبات"],
  bunches: ["Bunches", "الحزم"],
  total: ["Order total", "إجمالي الطلب"],
  note: ["Customer note", "ملاحظة العميل"],
  cancelled: ["This order was cancelled.", "تم إلغاء هذا الطلب."],
  contact: ["Contact us on WhatsApp", "تواصل معنا عبر واتساب"],
  copy: ["Copy link", "نسخ الرابط"],
  copied: ["Link copied", "تم نسخ الرابط"],
  print: ["Print", "طباعة"],
  storeLink: ["Back to store", "العودة للمتجر"],
  zoom: ["Enlarge photo of {name}", "تكبير صورة {name}"],
  hi: ["Hello, I have a question about order {ref}.", "مرحبًا، لدي سؤال بخصوص الطلب {ref}."],
  notFound: ["Order not found", "لم يتم العثور على الطلب"],
  notFoundSub: ["Check that the link is complete, or contact us on WhatsApp.", "تأكد من اكتمال الرابط، أو تواصل معنا عبر واتساب."],
  error: ["We could not load this order", "تعذر تحميل هذا الطلب"],
  errorSub: ["Check your connection and reload the page.", "تحقق من الاتصال بالإنترنت ثم أعد تحميل الصفحة."],
  langBtn: ["العربية", "English"],
  close: ["Close", "إغلاق"], prev: ["Previous", "السابق"], next: ["Next", "التالي"],
});

const token = new URLSearchParams(location.search).get("t") || location.pathname.split("/").filter(Boolean).pop() || "";
let order = null;
let waNumber = "";

const STEPS = ["new", "quoted", "confirmed", "delivered"];

function chrome() {
  $("#langBtn").textContent = t("langBtn");
  $("#themeBtn").innerHTML = icon(effTheme() === "dark" ? "sun" : "moon", 20);
}

function stateBlock(titleKey, subKey) {
  return `<div class="empty">${icon("alert", 36)}<h1 class="h2">${t(titleKey)}</h1><p>${t(subKey)}</p><a class="btn btn-primary" href="/" style="margin-top:16px">${icon("home", 18)} ${t("storeLink")}</a></div>`;
}

function render() {
  chrome();
  const app = $("#app");
  if (!order) return;
  const lang = prefs.lang;
  const lines = order.items.map((i) => ({ packs: i.packs, stemsPerPack: i.stems_per_pack, stemsPerBunch: i.stems_per_bunch }));
  const tt = totals(lines);
  const ref = refOf(token);
  const idx = STEPS.indexOf(order.status);
  const cancelled = order.status === "cancelled";

  const tracker = cancelled
    ? `<p class="o-cancel">${icon("alert", 18)} ${t("cancelled")}</p>`
    : `<ol class="track" aria-label="${esc(statusLabel(order.status))}">${STEPS.map((s, i) =>
      `<li class="${i < idx ? "done" : i === idx ? "now" : ""}" ${i === idx ? 'aria-current="step"' : ""}><span class="dot">${i < idx ? icon("check", 14) : i + 1}</span><span class="lbl">${esc(statusLabel(s))}</span></li>`
    ).join("")}</ol>`;

  const cards = order.items.map((i, n) => {
    const f = { name_en: i.flower_en, name_ar: i.flower_ar };
    const c = { name_en: i.color_en, name_ar: i.color_ar };
    const st = i.packs * i.stems_per_pack;
    const photo = i.photo_path
      ? `<button type="button" class="o-img" data-zoom="${n}" aria-label="${esc(t("zoom", { name: `${nameOf(f)} ${nameOf(c)}` }))}"><img src="${esc(photoUrl(i.photo_path, "thumb"))}" data-full="${esc(photoUrl(i.photo_path))}" alt="" loading="lazy" decoding="async"></button>`
      : `<div class="o-img ph" style="--c:${esc(i.hex)}">${icon("leaf", 28)}</div>`;
    return `<li class="o-item">${photo}<div class="o-info"><h3>${esc(nameOf(f))}</h3>
      <p class="o-col"><i class="sw" style="--c:${esc(i.hex)}"></i>${esc(nameOf(c))}<span class="alt"> · ${esc(altOf(f))} ${esc(altOf(c))}</span></p>
      <p class="o-qty"><b>${esc(unit(i.packs, "pack"))}</b><span>${esc(unit(st, "stem"))} · ${esc(unit(Math.round(st / i.stems_per_bunch), "bunch"))}</span></p></div></li>`;
  }).join("");

  app.innerHTML = `<article class="o-card">
      <header class="o-head"><div><p class="o-ref">${t("ref")} #${esc(ref)}</p><h1>${t("title")}</h1>
        <p class="muted">${esc(fmtDate(order.created_at, lang))}</p></div>
        <span class="badge st-${esc(order.status)}">${esc(statusLabel(order.status))}</span></header>
      ${tracker}
      <dl class="o-meta"><div><dt>${t("for")}</dt><dd>${esc(order.customer_name)}${order.customer_city ? ` · ${esc(order.customer_city)}` : ""}</dd></div>
        <div><dt>${t("items")}</dt><dd>${nf(order.items.length)}</dd></div></dl>
      <ul class="o-items">${cards}</ul>
      ${order.customer_note ? `<p class="o-note"><b>${t("note")}</b><br>${esc(order.customer_note)}</p>` : ""}
      <section class="o-total" aria-label="${esc(t("total"))}"><h2>${t("total")}</h2>
        <dl><div><dt>${t("packs")}</dt><dd>${nf(tt.packs)}</dd></div><div><dt>${t("stems")}</dt><dd>${nf(tt.stems)}</dd></div><div><dt>${t("bunches")}</dt><dd>${nf(tt.bunches)}</dd></div></dl></section>
      <div class="o-actions">
        <a class="btn btn-primary" href="/">${icon("home", 18)} ${t("storeLink")}</a>
        ${waNumber ? `<a class="btn btn-wa" href="https://wa.me/${waNumber}?text=${encodeURIComponent(t("hi", { ref }))}" target="_blank" rel="noopener">${icon("chat", 18)} ${t("contact")}</a>` : ""}
        <button type="button" class="btn btn-ghost" id="copyBtn">${icon("copy", 18)} ${t("copy")}</button>
        <button type="button" class="btn btn-ghost" id="printBtn">${icon("printer", 18)} ${t("print")}</button>
      </div></article>`;

  $$("[data-zoom]", app).forEach((b) => b.addEventListener("click", () => {
    const photos = order.items.map((i) => ({ i, p: i.photo_path })).filter((x) => x.p);
    const start = photos.findIndex((x) => x.i === order.items[Number(b.dataset.zoom)]);
    lightbox(photos.map(({ i, p }) => ({ src: photoUrl(p), alt: `${nameOf({ name_en: i.flower_en, name_ar: i.flower_ar })} ${nameOf({ name_en: i.color_en, name_ar: i.color_ar })}` })), Math.max(0, start),
      { close: t("close"), prev: t("prev"), next: t("next") });
  }));
  $("#copyBtn").addEventListener("click", async () => { if (await copyText(location.href)) toast(t("copied")); });
  $("#printBtn").addEventListener("click", () => window.print());
  document.title = `${t("ref")} #${ref} | YehiaFlowers`;
}

$("#langBtn").addEventListener("click", () => { toggleLang(); render(); if (!order) showState(); });
$("#themeBtn").addEventListener("click", () => { toggleTheme(); chrome(); });

let stateKeys = null;
function showState() {
  if (stateKeys) $("#app").innerHTML = stateBlock(...stateKeys);
  chrome();
}

(async function init() {
  chrome();
  try {
    const [o, s] = await Promise.all([rpc("get_order_by_token", { p_token: token }), loadSettings().catch(() => ({}))]);
    waNumber = waDigits(s.whatsapp_number);
    if (!o) { stateKeys = ["notFound", "notFoundSub"]; return showState(); }
    order = o;
    render();
  } catch (err) {
    console.error(err);
    stateKeys = ["error", "errorSub"];
    showState();
  }
})();
