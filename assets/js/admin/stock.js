import { api } from "./db.js";
import { A, bus, flowerById } from "./state.js";
import { t } from "./strings.js";
import { $, esc, normSearch } from "../shared/util.js";
import { nameOf, altOf } from "../shared/i18n.js";
import { icon } from "../shared/icons.js";
import { toast } from "../shared/ui.js";

let q = "";
let onlyOut = false;

function groups() {
  const words = normSearch(q).split(/\s+/).filter(Boolean);
  return A.flowers
    .filter((f) => words.every((w) => normSearch(`${f.name_en} ${f.name_ar} ${f.colors.map((c) => `${c.name_en} ${c.name_ar}`).join(" ")}`).includes(w)))
    .map((f) => [f, onlyOut ? f.colors.filter((c) => !c.in_stock) : f.colors])
    .filter(([, cs]) => cs.length);
}

export function stockListHtml() {
  const g = groups();
  if (!g.length) return `<div class="empty">${icon("layers", 36)}<h2>${t(A.flowers.length ? "noMatch" : "noFlowers")}</h2></div>`;
  return g.map(([f, cs]) => {
    const all = f.colors.length, inn = f.colors.filter((c) => c.in_stock).length;
    return `<section class="a-card stock-g"><div class="a-card-h"><div><h2>${esc(nameOf(f))}</h2><span class="muted">${esc(altOf(f))} · ${t("inStockN", { a: inn, b: all })}</span></div>
      <div class="bulk"><button class="btn btn-ghost btn-sm" data-act="bulkStock" data-id="${f.id}" data-v="1" ${inn === all ? "disabled" : ""}>${t("allIn")}</button>
      <button class="btn btn-ghost btn-sm" data-act="bulkStock" data-id="${f.id}" data-v="0" ${inn === 0 ? "disabled" : ""}>${t("allOut")}</button></div></div>
      <ul class="plain">${cs.map((c) => `<li class="line-static"><span class="s-name"><i class="sw" style="--c:${esc(c.hex)}"></i>${esc(nameOf(c))}<span class="muted"> · ${esc(altOf(c))}</span></span>
        <label class="switch"><input type="checkbox" data-act="stockToggle" data-f="${f.id}" data-id="${c.id}" ${c.in_stock ? "checked" : ""} aria-label="${esc(`${nameOf(f)} ${nameOf(c)}`)}"><span class="track"></span><span class="s-state">${t(c.in_stock ? "inStock" : "soldOut")}</span></label></li>`).join("")}</ul></section>`;
  }).join("");
}

export function stockHtml() {
  return `<div class="a-page"><div class="a-head"><div><h1>${t("stock")}</h1><p class="muted">${t("stockSub")}</p></div></div>
    <div class="a-tools"><div class="search-box">${icon("search", 18)}<input id="sq" class="input" type="search" placeholder="${esc(t("searchFlowers"))}" value="${esc(q)}" aria-label="${esc(t("searchFlowers"))}"></div>
      <label class="switch"><input type="checkbox" id="onlyOut" ${onlyOut ? "checked" : ""}><span class="track"></span><span>${t("onlyOut")}</span></label></div>
    <div id="stockList" class="stack">${stockListHtml()}</div></div>`;
}

export function bindStock(root) {
  $("#sq", root)?.addEventListener("input", (e) => { q = e.target.value; $("#stockList", root).innerHTML = stockListHtml(); });
  $("#onlyOut", root)?.addEventListener("change", (e) => { onlyOut = e.target.checked; $("#stockList", root).innerHTML = stockListHtml(); });
}

async function setStock(ids, value, flowerId) {
  const f = flowerById(flowerId);
  const prev = f.colors.map((c) => [c, c.in_stock]);
  f.colors.filter((c) => ids.includes(c.id)).forEach((c) => (c.in_stock = value));
  try {
    await api(`colors?id=in.(${ids.join(",")})`, { method: "PATCH", body: { in_stock: value } });
    toast(t("saved"), { ms: 1200 });
  } catch (err) {
    prev.forEach(([c, v]) => (c.in_stock = v));
    toast(err.message, { type: "error" });
  }
  bus.render();
}

export const stockActions = {
  stockToggle: (el) => setStock([el.dataset.id], el.checked, el.dataset.f),
  bulkStock: (el) => {
    const f = flowerById(el.dataset.id);
    setStock(f.colors.map((c) => c.id), el.dataset.v === "1", f.id);
  },
};
