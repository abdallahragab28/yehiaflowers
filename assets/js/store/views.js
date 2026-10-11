import { esc, fmtDate, nf, refOf } from "../shared/util.js";
import { photoUrl, orderLink, siteUrl, photoSrcset } from "../shared/api.js";
import { prefs } from "../shared/prefs.js";
import { isAr, unit, nameOf, altOf, totals } from "../shared/i18n.js";
import { icon } from "../shared/icons.js";
import { t } from "./strings.js";
import {
  S, coverColor, flowersOf, hasStock, qty, cartLines, cartTotals, flowerQty, searchFlowers,
  buildMessage, categoryCover, heroSlides,
} from "./state.js";

/* ---------- Small building blocks ---------- */

/** A photo (small copy first, full size as fallback) cropped around its focus point, or a tinted placeholder. */
export function media(photo, hex, { size = "thumb", cls = "", alt = "", eager = false } = {}) {
  if (!photo) {
    return `<div class="media ph ${cls}" style="--c:${esc(hex || "#9DB0A5")}" role="img" aria-label="${esc(t("noPhoto"))}">${icon("leaf", 30)}</div>`;
  }
  return `<div class="media ${cls}"><img src="${esc(photoUrl(photo.path, size))}" data-full="${esc(photoUrl(photo.path))}" alt="${esc(alt)}" style="object-position:${photo.x}% ${photo.y}%" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async"></div>`;
}

const swatch = (hex) => `<i class="sw" style="--c:${esc(hex)}"></i>`;
const lineOf = (l) => ({ packs: l.packs, stemsPerPack: l.stemsPerPack, stemsPerBunch: l.stemsPerBunch });

/** Pack size line: "160 stems · 16 bunches of 10 stems". */
export function specText(f) {
  const bunches = Math.round(f.stems_per_pack / f.stems_per_bunch);
  return `${unit(f.stems_per_pack, "stem")} · ${unit(bunches, "bunch")} ${t("of")} ${unit(f.stems_per_bunch, "stem")}`;
}

export function stepper(color) {
  const n = qty(color.id);
  const name = nameOf(color.flower) + " " + nameOf(color);
  return `<div class="stepper" role="group" aria-label="${esc(t("packs"))}: ${esc(name)}">
    <button type="button" class="step" data-act="dec" data-c="${color.id}" data-fid="dec:${color.id}" aria-label="${esc(t("removePack", { name }))}" ${n ? "" : "disabled"}>${icon("minus", 18)}</button>
    <output data-out="${color.id}" aria-live="polite">${n}</output>
    <button type="button" class="step step-add" data-act="inc" data-c="${color.id}" data-fid="inc:${color.id}" aria-label="${esc(t("addPack", { name }))}" ${n >= 99 ? "disabled" : ""}>${icon("plus", 18)}</button>
  </div>`;
}

const emptyState = ({ iconName = "search", title, sub, action = "" }) =>
  `<div class="empty">${icon(iconName, 36)}<h2>${esc(title)}</h2>${sub ? `<p class="muted">${esc(sub)}</p>` : ""}${action}</div>`;

export const notFoundView = () => ({
  title: t("notFound"),
  html: `<div class="page">${emptyState({ iconName: "alert", title: t("notFound"), action: `<a class="btn btn-primary" href="#/shop">${t("browse")}</a>` })}</div>`,
});

const backLink = (href, label) =>
  `<a class="back" href="${href}">${icon("arrowLeft", 18, "flip")}<span>${esc(label)}</span></a>`;

/* ---------- Flower cards (grid and list) ---------- */
export function flowerCards(list, mode = S.mode) {
  const card = (f) => {
    const cover = coverColor(f);
    const inCart = flowerQty(f);
    const out = !hasStock(f);
    const dots = f.colors.slice(0, 6).map((c) => swatch(c.hex)).join("");
    const more = f.colors.length > 6 ? `<span class="more">+${f.colors.length - 6}</span>` : "";
    return `<a class="f-card ${out ? "is-out" : ""}" href="#/f/${esc(f.slug)}" data-reveal>
      <div class="f-media">${media(cover.photos[0], cover.hex, { alt: nameOf(f) })}
        ${inCart ? `<span class="tag tag-accent">${icon("check", 14)} ${esc(unit(inCart, "pack"))}</span>` : ""}
        ${out ? `<span class="tag tag-muted">${esc(t("soldOut"))}</span>` : ""}</div>
      <div class="f-body"><h3>${esc(nameOf(f))}</h3><p class="alt">${esc(altOf(f))}</p>
        <div class="f-meta"><span class="dots">${dots}${more}</span><span>${esc(unit(f.colors.length, "color"))}</span></div></div></a>`;
  };
  return `<div class="${mode === "list" ? "f-list" : "f-grid"}">${list.map(card).join("")}</div>`;
}

const viewToggle = () => `<div class="seg" role="group" aria-label="${esc(t("view"))}">
  <button type="button" data-act="mode" data-m="grid" aria-pressed="${S.mode === "grid"}" aria-label="${esc(t("grid"))}">${icon("grid", 18)}</button>
  <button type="button" data-act="mode" data-m="list" aria-pressed="${S.mode === "list"}" aria-label="${esc(t("list"))}">${icon("list", 18)}</button></div>`;

/* ---------- Hero slider ---------- */
function heroHtml() {
  const slides = heroSlides();
  const many = slides.length > 1;
  return `<section class="hero" aria-roledescription="carousel" aria-label="${esc(t("heroLabel"))}">
    <div class="hero-slides">${slides.map((p, i) => `<div class="hero-slide ${i === 0 ? "on" : ""}" ${many ? `role="group" aria-roledescription="slide" aria-label="${i + 1} / ${slides.length}"` : ""}>
      <img src="${esc(photoUrl(p.path))}" alt="" style="object-position:${p.x}% ${p.y}%" ${i === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async"></div>`).join("")}</div>
    <div class="hero-in">
      <div class="hero-card">
        <span class="eyebrow">${icon("leaf", 16)} ${t("w_kicker")}</span>
        <h1>${t("w_title")}</h1>
        <p class="lead">${t("w_sub")}</p>
        <div class="hero-cta">
          <button type="button" class="btn btn-light btn-lg" data-act="scrollto" data-to="cats">${t("heroCta")} ${icon("arrowDown", 18)}</button>
          ${S.orders.length ? `<button type="button" class="btn btn-glass btn-lg" data-act="scrollto" data-to="recent">${icon("refresh", 18)} ${t("w_recent")}</button>` : ""}
        </div>
      </div>
    </div>
    ${many ? `<div class="hero-ctrl"><div class="hero-dots" role="group">${slides.map((_, i) => `<button type="button" class="hero-dot ${i === 0 ? "on" : ""}" data-hero="${i}" aria-label="${esc(t("slideN", { n: i + 1 }))}" aria-current="${i === 0}"></button>`).join("")}<button type="button" class="hero-pause" data-hero="togglePlay" aria-label="${esc(t("pauseSlide"))}" aria-pressed="false">${icon("pause", 14)}</button></div>
      <div class="hero-arrows"><button type="button" class="hero-arrow" data-hero="prev" aria-label="${esc(t("slidePrev"))}">${icon("chevronLeft", 22, "flip")}</button>
      <button type="button" class="hero-arrow" data-hero="next" aria-label="${esc(t("slideNext"))}">${icon("chevronRight", 22, "flip")}</button></div></div>` : ""}
  </section>`;
}

const feats = () => {
  const items = [["truck", "w_f1"], ["package", "w_f2"], ["chat", "w_f3"]];
  return `<ul class="feats" data-reveal>${items.map(([ic, k]) => `<li>${icon(ic, 22)}<div><b>${t(k)}</b><span>${t(k + "d")}</span></div></li>`).join("")}</ul>`;
};

/* ---------- Recent orders (carousel on phones, grid on larger screens) ---------- */
function recentOrders() {
  if (!S.orders.length) return "";
  const lang = prefs.lang;
  const orders = S.orders.slice(0, 5);
  const summary = (o) => {
    const names = o.lines.map(([fen, far, cen, car, n]) => `${isAr() ? far : fen} ${isAr() ? car : cen} × ${n}`);
    return names.slice(0, 3).join(" · ") + (names.length > 3 ? ` +${names.length - 3}` : "");
  };
  return `<section class="block" id="recent" aria-labelledby="recent-h" data-reveal>
    <div class="block-head"><h2 id="recent-h">${t("recent")}</h2><p class="muted">${t("recentSub")}</p></div>
    <div class="carousel" data-carousel><div class="car-track">${orders.map((o, i) => `<article class="card ro">
      <div class="ro-top"><b>${esc(fmtDate(o.t, lang, { dateStyle: "medium" }))}</b><span class="badge">${esc(unit(o.packs, "pack"))}</span></div>
      <p class="ro-lines">${esc(summary(o))}</p>
      <div class="ro-actions"><button class="btn btn-primary btn-sm" data-act="reorder" data-i="${i}">${icon("refresh", 16)} ${t("reorder")}</button>
      ${o.token ? `<a class="btn btn-ghost btn-sm" href="${esc(orderLink(o.token))}" target="_blank" rel="noopener">${t("viewOrder")}</a>` : ""}</div></article>`).join("")}</div>
      ${orders.length > 1 ? `<div class="car-dots" role="group">${orders.map((_, i) => `<button type="button" class="car-dot ${i === 0 ? "on" : ""}" data-dot="${i}" aria-label="${esc(t("ordN", { n: i + 1 }))}"></button>`).join("")}</div>` : ""}
    </div></section>`;
}

/* ---------- Shop: hero, categories and all flowers ---------- */
function categoriesBlock() {
  const cats = S.cats.map((c) => {
    const { photo, hex } = categoryCover(c);
    const n = flowersOf(c).length;
    return `<a class="cat-card" href="#/c/${esc(c.slug)}" data-reveal>
      ${media(photo, hex, { alt: nameOf(c), cls: "cat-media" })}
      <div class="cat-body"><div><h3>${esc(nameOf(c))}</h3><p class="alt">${esc(altOf(c))}</p></div>
      <span class="cat-count">${esc(unit(n, "type"))}</span></div></a>`;
  }).join("");
  return `<section class="block" id="cats" aria-labelledby="cats-h"><div class="block-head" data-reveal><h2 id="cats-h">${t("shopTitle")}</h2><p class="muted">${t("shopSub")}</p></div>
    <div class="cat-grid">${cats}</div></section>`;
}

/** Inner HTML of the "All flowers" section, so filtering can update it without redrawing the page. */
export function allFlowersInner() {
  const list = S.shopCat === "all" ? S.flowers : S.flowers.filter((f) => f.category_id === S.shopCat);
  const chip = (id, label, n) => `<button type="button" class="chip" data-act="shopcat" data-id="${id}" aria-pressed="${S.shopCat === id}">${esc(label)}<span class="chip-n">${n}</span></button>`;
  return `<div class="block-head row"><div><h2 id="all-h">${t("allFlowers")}</h2><p class="muted">${esc(unit(list.length, "type"))}</p></div>${viewToggle()}</div>
    <div class="chips" role="group" aria-label="${esc(t("filterLabel"))}">${chip("all", t("filterAll"), S.flowers.length)}${S.cats.map((c) => chip(c.id, nameOf(c), flowersOf(c).length)).join("")}</div>
    ${list.length ? flowerCards(list) : emptyState({ title: t("emptyCat") })}`;
}

export function shopView() {
  const q = S.q.trim();
  if (q) {
    const res = searchFlowers(q);
    return {
      title: `${q} · ${t("brand")}`,
      html: `<div class="page"><div class="page-head"><h1 class="h-sm">${t("results", { n: res.length, q: esc(q) })}</h1></div>
        ${res.length ? flowerCards(res) : emptyState({ title: t("noResults"), sub: t("noResultsSub"), action: `<button class="btn btn-ghost" data-act="clearq">${t("clear")}</button>` })}</div>`,
    };
  }
  return {
    title: t("brand"),
    hero: true,
    html: `${heroHtml()}<div class="page">${feats()}${recentOrders()}${categoriesBlock()}
      <section class="block" id="all" aria-labelledby="all-h"><div id="allBlock">${allFlowersInner()}</div></section></div>`,
  };
}

/* ---------- Category ---------- */
export function categoryView(slug) {
  const cat = S.cats.find((c) => c.slug === slug);
  if (!cat) return notFoundView();
  let list = flowersOf(cat);
  if (S.stockOnly) list = list.filter(hasStock);
  return {
    title: `${nameOf(cat)} · ${t("brand")}`,
    html: `<div class="page">${backLink("#/shop", t("allCats"))}
      <div class="page-head"><h1>${esc(nameOf(cat))}</h1><p class="muted">${esc(altOf(cat))} · ${esc(unit(flowersOf(cat).length, "type"))}</p></div>
      <div class="toolbar">
        <label class="switch"><input type="checkbox" data-act="stock" ${S.stockOnly ? "checked" : ""}><span class="track" aria-hidden="true"></span><span>${t("stockOnly")}</span></label>
        ${viewToggle()}</div>
      ${list.length ? flowerCards(list) : emptyState({ title: t("emptyCat") })}</div>`,
  };
}

/* ---------- Flower ---------- */
export function selectedColor(f) {
  return f.colors.find((c) => c.id === S.sel[f.id]) || f.colors.find((c) => c.in_stock) || f.colors[0];
}

export function flowerView(slug) {
  const f = S.flowers.find((x) => x.slug === slug);
  if (!f) return notFoundView();
  const color = selectedColor(f);
  const photos = color.photos;
  const idx = Math.min(S.photo, Math.max(0, photos.length - 1));
  const alt = `${nameOf(f)} ${nameOf(color)}`;
  const rows = f.colors.map((c) => `<li class="crow ${c.id === color.id ? "sel" : ""} ${c.in_stock ? "" : "oos"}">
      <button type="button" class="crow-main" data-act="color" data-c="${c.id}" data-fid="color:${c.id}" aria-pressed="${c.id === color.id}">
        ${swatch(c.hex)}<span class="crow-t"><b>${esc(nameOf(c))}</b><small>${esc(altOf(c))} · ${esc(c.in_stock ? t("inStock") : t("soldOut"))}</small></span></button>
      ${c.in_stock ? stepper(c) : `<span class="badge badge-muted">${esc(t("soldOut"))}</span>`}</li>`).join("");
  const thumbs = photos.length > 1
    ? `<div class="g-thumbs">${photos.map((p, i) => `<button type="button" class="g-th ${i === idx ? "on" : ""}" data-act="photo" data-i="${i}" data-fid="photo:${i}" aria-label="${esc(t("photoN", { n: i + 1 }))}" aria-pressed="${i === idx}">${media(p, color.hex, { cls: "g-thimg" })}</button>`).join("")}</div>`
    : "";
  return {
    title: `${nameOf(f)} · ${t("brand")}`,
    html: `<div class="page">${backLink(`#/c/${esc(f.cat.slug)}`, nameOf(f.cat))}
      <div class="f-layout">
        <div class="gallery">
          ${photos.length
            ? `<button type="button" class="g-main" data-act="zoom" data-i="${idx}" aria-label="${esc(t("enlarge"))}">${media(photos[idx], color.hex, { size: "full", alt, cls: "g-img", eager: true })}<span class="g-zoom">${icon("search", 16)}</span></button>`
            : `<div class="g-main">${media(null, color.hex, { cls: "g-img" })}</div>`}
          ${thumbs}
        </div>
        <div class="f-info">
          <div class="page-head"><h1>${esc(nameOf(f))}</h1><p class="muted">${esc(altOf(f))}</p></div>
          <div class="spec">${icon("package", 22)}<div><b>${t("spec")}</b><span>${esc(specText(f))}</span></div></div>
          <h2 class="h-sm">${t("colorsTitle")}</h2>
          <p class="muted hint">${t("colorsHint")}</p>
          <ul class="crows">${rows}</ul>
        </div>
      </div></div>`,
  };
}

/* ---------- Cart ---------- */
function field(id, label, { value = "", type = "text", auto = "", mode = "", hint = "", err = "", dir = "" } = {}) {
  return `<div class="field"><label for="f-${id}">${label}</label>
    <input id="f-${id}" class="input ${err ? "is-bad" : ""}" data-f="${id}" type="${type}" ${auto ? `autocomplete="${auto}"` : ""} ${mode ? `inputmode="${mode}"` : ""} ${dir ? `dir="${dir}"` : ""}
      value="${esc(value)}" ${err ? `aria-invalid="true" aria-describedby="e-${id}"` : hint ? `aria-describedby="h-${id}"` : ""}>
    ${err ? `<p class="err" id="e-${id}">${esc(t(err))}</p>` : hint ? `<p class="hint" id="h-${id}">${esc(hint)}</p>` : ""}</div>`;
}

export function cartView() {
  const lines = cartLines();
  if (!lines.length) {
    return {
      title: `${t("cartTitle")} · ${t("brand")}`,
      html: `<div class="page">${emptyState({ iconName: "cart", title: t("cartEmpty"), sub: t("cartEmptySub"), action: `<a class="btn btn-primary" href="#/shop">${t("browse")}</a>` })}</div>`,
    };
  }
  const tt = cartTotals();
  const groups = new Map();
  lines.forEach((l) => groups.set(l.flower.id, [...(groups.get(l.flower.id) || []), l]));
  const items = [...groups.values()].map((ls) => {
    const f = ls[0].flower;
    return `<section class="card grp"><header class="grp-h"><h3>${esc(nameOf(f))}</h3><span class="muted">${esc(specText(f))}</span></header>
      <ul class="lines">${ls.map((l) => {
        const lt = totals([lineOf(l)]);
        const label = `${nameOf(f)} ${nameOf(l.color)}`;
        return `<li class="line" data-line="${l.color.id}">
          <button type="button" class="line-img" data-act="zoomc" data-c="${l.color.id}" aria-label="${esc(t("checkPhotos", { name: label }))}">${media(l.color.photos[0], l.color.hex, { alt: label })}</button>
          <div class="line-t"><b class="line-n">${swatch(l.color.hex)}${esc(nameOf(l.color))}</b><small>${esc(unit(lt.stems, "stem"))} · ${esc(unit(lt.bunches, "bunch"))}</small></div>
          <div class="line-a">${stepper(l.color)}<button type="button" class="icon-btn" data-act="del" data-c="${l.color.id}" aria-label="${esc(t("remove"))}: ${esc(label)}">${icon("trash", 18)}</button></div></li>`;
      }).join("")}</ul></section>`;
  }).join("");
  const e = S.errors;
  return {
    title: `${t("cartTitle")} · ${t("brand")}`,
    html: `<div class="page">${backLink("#/shop", t("addMore"))}
      <div class="page-head"><h1>${t("cartTitle")}</h1></div>
      <div class="cart-grid"><div class="cart-items">${items}</div>
        <aside class="card summary" aria-labelledby="sum-h"><h2 id="sum-h" class="h-sm">${t("summary")}</h2>
          <dl class="totals"><div><dt>${t("packs")}</dt><dd>${nf(tt.packs)}</dd></div>
            <div><dt>${t("stems")}</dt><dd>${nf(tt.stems)}</dd></div>
            <div><dt>${t("bunches")}</dt><dd>${nf(tt.bunches)}</dd></div></dl>
          <h2 class="h-sm">${t("details")}</h2>
          <form id="orderForm" novalidate>
            ${field("name", t("fName"), { value: S.form.name, auto: "name", err: e.name })}
            <div class="field"><label for="f-note">${t("fNote")}</label><textarea id="f-note" class="input" data-f="note" rows="2" maxlength="300" placeholder="${esc(t("fNotePh"))}">${esc(S.form.note)}</textarea></div>
            <details class="preview"><summary>${t("preview")}</summary><pre id="msgPreview"></pre></details>
            <button type="submit" class="btn btn-wa btn-lg btn-block" id="sendBtn" ${S.sending ? "disabled" : ""}>${icon("chat", 20)} <span>${S.sending ? t("sending") : t("send")}</span></button>
            <p class="muted center small">${t("noPay")}</p>
          </form></aside></div></div>`,
  };
}

export const previewText = () => `${buildMessage(cartLines(), "", S.form)}\n\nOrder with photos:\n${siteUrl()}/order/?t=[order_Reference]`;

/* ---------- Sent ---------- */
export function sentView() {
  const o = S.orders[0];
  if (!o) return notFoundView();
  return {
    title: `${t("sentTitle")} · ${t("brand")}`,
    html: `<div class="page narrow"><div class="done">
      <span class="done-ic">${icon("check", 34)}</span>
      <h1>${t("sentTitle")}</h1><p class="muted">${t("sentSub")}</p>
      <dl class="done-meta"><div><dt>${t("ref")}</dt><dd>${esc(o.token ? refOf(o.token) : "-")}</dd></div>
        <div><dt>${t("packs")}</dt><dd>${nf(o.packs)}</dd></div></dl>
      <div class="done-actions">
        <a class="btn btn-wa btn-lg" href="${esc(S.lastWa || "#")}" target="_blank" rel="noopener">${icon("chat", 20)} ${t("openWa")}</a>
        ${o.token ? `<a class="btn btn-ghost" href="${esc(orderLink(o.token))}" target="_blank" rel="noopener">${icon("link", 18)} ${t("orderPage")}</a>
        <button class="btn btn-ghost" data-act="copy" data-link="${esc(orderLink(o.token))}">${icon("copy", 18)} ${t("copyLink")}</button>` : ""}
        <a class="btn btn-primary" href="#/shop">${t("continue")}</a></div></div></div>`,
  };
}

export function errorView() {
  return `<div class="page">${emptyState({ iconName: "alert", title: t("eLoad"), sub: t("eLoadSub"), action: `<button class="btn btn-primary" data-act="retry">${icon("refresh", 18)} ${t("retry")}</button>` })}</div>`;
}
