import { api } from "./db.js";
import { A, bus, loadOrders, orderTotals, newCount } from "./state.js";
import { t } from "./strings.js";
import { $, esc, fmtDate, timeAgo, nf, refOf, waDigits, normSearch, copyText } from "../shared/util.js";
import { prefs } from "../shared/prefs.js";
import { unit, nameOf, altOf, statusLabel, STATUSES } from "../shared/i18n.js";
import { photoUrl, orderLink } from "../shared/api.js";
import { icon } from "../shared/icons.js";
import { toast, openDialog, confirmDialog, lightbox } from "../shared/ui.js";

const FLOW = ["new", "quoted", "confirmed", "delivered"];
const NEXT_LABEL = { new: "markQuoted", quoted: "markConfirmed", confirmed: "markDelivered" };
let dlg = null;
let openId = null;

const badge = (s) => `<span class="badge st st-${s}">${esc(statusLabel(s))}</span>`;
const thumb = (path, hex) => path
  ? `<img src="${esc(photoUrl(path, "thumb"))}" data-full="${esc(photoUrl(path))}" alt="" loading="lazy" decoding="async">`
  : `<span class="ph" style="--c:${esc(hex)}"></span>`;

function matches(o, q) {
  if (!q) return true;
  const hay = normSearch([o.customer_name, o.customer_phone, o.customer_city, refOf(o.public_token),
    ...o.order_items.flatMap((i) => [i.flower_name_en, i.flower_name_ar, i.color_name_en, i.color_name_ar])].join(" "));
  return normSearch(q).split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}

export const visibleOrders = () =>
  A.orders.filter((o) => (A.ofilter === "all" || o.status === A.ofilter) && matches(o, A.oq));

function rowHtml(o) {
  const tt = orderTotals(o);
  const shown = o.order_items.slice(0, 4);
  const extra = o.order_items.length - shown.length;
  return `<button type="button" class="o-row ${o.status === "new" ? "is-new" : ""}" data-act="openOrder" data-id="${o.id}">
    <span class="o-row-main"><b>${esc(o.customer_name)}</b><span class="muted">${esc([o.customer_city, timeAgo(o.created_at, prefs.lang)].filter(Boolean).join(" · "))}</span></span>
    <span class="o-thumbs" aria-hidden="true">${shown.map((i) => `<span class="o-th">${thumb(i.photo_path, i.color_hex)}</span>`).join("")}${extra > 0 ? `<span class="o-th more">+${extra}</span>` : ""}</span>
    <span class="o-row-end">${badge(o.status)}<span class="muted">${esc(unit(tt.packs, "pack"))}</span></span></button>`;
}

export function listHtml() {
  const list = visibleOrders();
  if (!list.length) {
    return `<div class="empty">${icon("inbox", 36)}<h2>${t(A.orders.length ? "noMatch" : "noOrders")}</h2><p>${t(A.orders.length ? "noMatchSub" : "noOrdersSub")}</p></div>`;
  }
  return `<div class="o-list">${list.map(rowHtml).join("")}</div>${A.hasMore && A.ofilter === "all" && !A.oq
    ? `<div class="center"><button class="btn btn-ghost" data-act="moreOrders">${t("loadMore")}</button></div>` : ""}`;
}

export function ordersHtml() {
  const counts = Object.fromEntries(STATUSES.map((s) => [s, A.orders.filter((o) => o.status === s).length]));
  const chip = (key, label, n) => `<button type="button" class="chip" data-act="ofilter" data-s="${key}" aria-pressed="${A.ofilter === key}">${esc(label)}<span class="chip-n">${n}</span></button>`;
  return `<div class="a-page"><div class="a-head"><div><h1>${t("orders")}</h1><p class="muted">${t("ordersSub")}</p></div>
      <button class="btn btn-ghost btn-sm" data-act="refresh">${icon("refresh", 16)} ${t("refresh")}</button></div>
    <div class="a-tools"><div class="search-box">${icon("search", 18)}<input id="oq" class="input" type="search" placeholder="${esc(t("searchOrders"))}" value="${esc(A.oq)}" aria-label="${esc(t("searchOrders"))}"></div></div>
    <div class="chips" role="group" aria-label="${esc(t("status"))}">${chip("all", t("all"), A.orders.length)}${STATUSES.map((s) => chip(s, statusLabel(s), counts[s])).join("")}</div>
    <div id="ordersList">${listHtml()}</div></div>`;
}

/* ---------- Detail drawer ---------- */
function replyLink(o) {
  const ref = refOf(o.public_token);
  const msg = o.lang === "ar"
    ? `مرحبًا ${o.customer_name}، بخصوص طلبك رقم ${ref}.\n${orderLink(o.public_token)}`
    : `Hello ${o.customer_name}, regarding your order ${ref}.\n${orderLink(o.public_token)}`;
  return `https://wa.me/${waDigits(o.customer_phone)}?text=${encodeURIComponent(msg)}`;
}

function detailHtml(o) {
  const tt = orderTotals(o);
  const idx = FLOW.indexOf(o.status);
  const next = NEXT_LABEL[o.status];
  const items = o.order_items.map((i, n) => {
    const st = i.packs * i.stems_per_pack;
    const f = { name_en: i.flower_name_en, name_ar: i.flower_name_ar }, c = { name_en: i.color_name_en, name_ar: i.color_name_ar };
    return `<li class="d-item"><button type="button" class="d-img" data-act="zoomItem" data-i="${n}" ${i.photo_path ? "" : "disabled"} aria-label="${esc(t("enlarge"))}">${thumb(i.photo_path, i.color_hex)}</button>
      <div class="d-info"><b>${esc(nameOf(f))}</b><span class="d-col"><i class="sw" style="--c:${esc(i.color_hex)}"></i>${esc(nameOf(c))}<span class="muted"> · ${esc(altOf(f))} ${esc(altOf(c))}</span></span>
      <span class="muted">${esc(unit(st, "stem"))} · ${esc(unit(Math.round(st / i.stems_per_bunch), "bunch"))}</span></div>
      <b class="d-packs">${esc(unit(i.packs, "pack"))}</b></li>`;
  }).join("");
  return `<div class="drawer">
    <header class="drawer-h"><div><p class="muted">${t("order")} #${esc(refOf(o.public_token))}</p><h2>${esc(o.customer_name)}</h2></div>
      <button class="icon-btn" data-act="closeDrawer" aria-label="${esc(t("close"))}">${icon("x", 22)}</button></header>
    <div class="drawer-b">
      <div class="d-status">${badge(o.status)}<span class="muted">${esc(fmtDate(o.created_at, prefs.lang))}</span></div>
      ${o.status === "cancelled" ? "" : `<ol class="steps">${FLOW.map((s, i) => `<li class="${i < idx ? "done" : i === idx ? "now" : ""}"><span class="dot">${i < idx ? icon("check", 12) : i + 1}</span>${esc(statusLabel(s))}</li>`).join("")}</ol>`}
      <div class="d-actions">${next ? `<button class="btn btn-primary" data-act="setStatus" data-s="${FLOW[idx + 1]}">${t(next)}</button>` : ""}
        <label class="sel"><span class="sr-only">${t("changeStatus")}</span><select class="input" data-act-change="status" aria-label="${esc(t("changeStatus"))}">${STATUSES.map((s) => `<option value="${s}" ${s === o.status ? "selected" : ""}>${esc(statusLabel(s))}</option>`).join("")}</select></label></div>
      <section class="d-card"><h3>${t("customer")}</h3>
        <p>${icon("phone", 16)} <a href="tel:${esc(o.customer_phone)}" dir="ltr">${esc(o.customer_phone)}</a></p>
        ${o.customer_city ? `<p>${icon("pin", 16)} ${esc(o.customer_city)}</p>` : ""}
        <p class="muted">${icon("globe", 16)} ${o.lang === "ar" ? "العربية" : "English"}</p>
        ${o.customer_note ? `<p class="d-note">${esc(o.customer_note)}</p>` : ""}
        <a class="btn btn-wa btn-block" href="${esc(replyLink(o))}" target="_blank" rel="noopener">${icon("chat", 18)} ${t("reply")}</a></section>
      <section><h3>${t("items")} <span class="muted">(${o.order_items.length})</span></h3><ul class="d-items">${items}</ul>
        <dl class="d-total"><div><dt>${t("packs")}</dt><dd>${nf(tt.packs)}</dd></div><div><dt>${t("stems")}</dt><dd>${nf(tt.stems)}</dd></div><div><dt>${t("bunches")}</dt><dd>${nf(tt.bunches)}</dd></div></dl></section>
      <section class="d-card"><label for="priv"><h3>${t("privateNote")}</h3></label>
        <textarea id="priv" class="input" rows="3" maxlength="1000" placeholder="${esc(t("privateNotePh"))}">${esc(o.note || "")}</textarea>
        <button class="btn btn-ghost btn-sm" data-act="saveNote">${t("saveNote")}</button></section>
      <div class="d-links"><button class="btn btn-ghost btn-sm" data-act="copyOrder">${icon("copy", 16)} ${t("copyLink")}</button>
        <a class="btn btn-ghost btn-sm" href="${esc(orderLink(o.public_token))}" target="_blank" rel="noopener">${icon("link", 16)} ${t("openPage")}</a>
        <button class="btn btn-ghost btn-sm danger-text" data-act="deleteOrder">${icon("trash", 16)} ${t("deleteOrder")}</button></div>
    </div></div>`;
}

const current = () => A.orders.find((o) => o.id === openId);

export function openOrder(id) {
  openId = id;
  const o = current();
  if (!o) return;
  if (dlg?.open) dlg.close();
  dlg = openDialog({ className: "dlg-drawer", label: o.customer_name, html: detailHtml(o), onClose: () => { openId = null; dlg = null; } });
  dlg.addEventListener("change", (e) => {
    if (e.target.dataset.actChange === "status") changeStatus(e.target.value);
  });
}

function refreshDetail() {
  const o = current();
  if (dlg && o) {
    const scroll = dlg.querySelector(".drawer-b")?.scrollTop || 0;
    dlg.innerHTML = detailHtml(o);
    dlg.querySelector(".drawer-b").scrollTop = scroll;
  }
  bus.render();
  bus.refreshBadge();
}

async function changeStatus(status) {
  const o = current();
  if (!o || o.status === status) return;
  const prev = o.status;
  o.status = status;
  refreshDetail();
  try {
    await api(`orders?id=eq.${o.id}`, { method: "PATCH", body: { status } });
    toast(t("statusSaved", { s: statusLabel(status) }));
  } catch (err) {
    o.status = prev;
    refreshDetail();
    toast(err.message, { type: "error" });
  }
}

export const orderActions = {
  openOrder: (el) => openOrder(el.dataset.id),
  ofilter: (el) => { A.ofilter = el.dataset.s; bus.render(); },
  refresh: async () => {
    try { await loadOrders(); bus.render(); bus.refreshBadge(); toast(t("refreshed")); } catch (e) { toast(e.message, { type: "error" }); }
  },
  moreOrders: async () => { A.orderLimit += 200; await loadOrders(); bus.render(); },
  setStatus: (el) => changeStatus(el.dataset.s),
  saveNote: async () => {
    const o = current();
    if (!o) return;
    const note = $("#priv", dlg).value.trim();
    try {
      await api(`orders?id=eq.${o.id}`, { method: "PATCH", body: { note: note || null } });
      o.note = note || null;
      toast(t("noteSaved"));
    } catch (e) { toast(e.message, { type: "error" }); }
  },
  copyOrder: async () => { const o = current(); if (o && await copyText(orderLink(o.public_token))) toast(t("copied")); },
  zoomItem: (el) => {
    const o = current();
    const photos = o.order_items.map((i) => i.photo_path && { src: photoUrl(i.photo_path), alt: `${nameOf({ name_en: i.flower_name_en, name_ar: i.flower_name_ar })} ${nameOf({ name_en: i.color_name_en, name_ar: i.color_name_ar })}`, n: i }).filter(Boolean);
    const start = photos.findIndex((p) => p.n === o.order_items[Number(el.dataset.i)]);
    lightbox(photos, Math.max(0, start), { close: t("close"), prev: t("prev"), next: t("next") });
  },
  deleteOrder: async () => {
    const o = current();
    if (!o) return;
    const ok = await confirmDialog({ title: t("deleteOrder"), message: t("deleteSure"), confirmLabel: t("delete"), cancelLabel: t("cancel"), danger: true });
    if (!ok) return;
    try {
      await api(`orders?id=eq.${o.id}`, { method: "DELETE" });
      A.orders = A.orders.filter((x) => x.id !== o.id);
      dlg?.close();
      bus.render();
      bus.refreshBadge();
      toast(t("deleted"));
    } catch (e) { toast(e.message, { type: "error" }); }
  },
};

export function bindOrders(root) {
  const q = $("#oq", root);
  q?.addEventListener("input", () => { A.oq = q.value; $("#ordersList", root).innerHTML = listHtml(); });
}
export { newCount };
