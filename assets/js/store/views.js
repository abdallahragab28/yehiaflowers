import { esc, fmtDate, nf, refOf } from "../shared/util.js";
import { photoUrl, orderLink, siteUrl } from "../shared/api.js";
import { prefs } from "../shared/prefs.js";
import { isAr, unit, nameOf, altOf, totals } from "../shared/i18n.js";
import { icon } from "../shared/icons.js";
import { t } from "./strings.js";
import {
  S, coverColor, flowersOf, hasStock, byStock, qty, cartLines, cartTotals, flowerQty, searchFlowers,
  buildMessage, categoryCover, heroSlides,
} from "./state.js";

/* ---------- Small building blocks ---------- */

/** A photo (small copy first, full size as fallback) cropped around its focus point, or a tinted placeholder. */
export function media(photo, hex, { size = "thumb", cls = "", alt = "", eager = false, w, h } = {}) {
  if (!photo) {
    return `<div class="media ph ${cls}" style="--c:${esc(hex || "#9DB0A5")}" role="img" aria-label="${esc(t("noPhoto"))}">${icon("leaf", 30)}</div>`;
  }
  const imgW = w || (size === "full" ? 800 : 400);
  const imgH = h || (size === "full" ? 600 : 300);
  return `<div class="media ${cls}"><img src="${esc(photoUrl(photo.path, size))}" data-full="${esc(photoUrl(photo.path))}" alt="${esc(alt)}" width="${imgW}" height="${imgH}" style="object-position:${photo.x}% ${photo.y}%" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async"></div>`;
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

export const notFoundView = () => {
  const catChips = S.cats?.length
    ? `<div class="not-found-cats">
        <p class="not-found-cats-title">${esc(t("browseCats"))}</p>
        <div class="not-found-cat-chips">
          ${S.cats.map((c) => `<a class="chip" href="#/c/${esc(c.slug)}">${esc(nameOf(c))}</a>`).join("")}
        </div>
      </div>`
    : "";

  return {
    title: `${t("notFound")} · ${t("brand")}`,
    html: `<div class="page narrow not-found-page">
      <div class="not-found-card">
        <div class="not-found-badge" aria-hidden="true">
          <div class="not-found-halo"></div>
          <span class="not-found-code">404</span>
          <div class="not-found-icon-wrap">${icon("leaf", 32)}</div>
        </div>
        <div class="not-found-body">
          <h1 class="not-found-title">${esc(t("notFound"))}</h1>
          <p class="not-found-sub">${esc(t("notFoundSub"))}</p>
          <div class="not-found-actions">
            <a class="btn btn-primary btn-lg" href="#/shop">${icon("home", 18)} <span>${esc(t("backToHome"))}</span></a>
            <a class="btn btn-ghost btn-lg" href="#/shop">${icon("grid", 18)} <span>${esc(t("browseCats"))}</span></a>
          </div>
          ${catChips}
        </div>
      </div>
    </div>`,
  };
};

const backLink = (href, label) =>
  `<a class="back" href="${href}">${icon("arrowLeft", 18, "flip")}<span>${esc(label)}</span></a>`;

/* ---------- Flower cards (grid and list) ---------- */
export function flowerCards(list, mode = S.mode) {
  const card = (f) => {
    const cover = coverColor(f);
    const inCart = flowerQty(f);
    const out = !hasStock(f);
    const maxDots = 5;
    const dots = f.colors.slice(0, maxDots).map((c) => swatch(c.hex)).join("");
    const more = f.colors.length > maxDots ? `<span class="more">+${f.colors.length - maxDots}</span>` : "";
    const altText = esc(altOf(f)).replace(/_/g, " ");
    return `<a class="f-card ${out ? "is-out" : ""}" href="#/f/${esc(f.slug)}" data-reveal>
      <div class="f-media">${media(cover.photos[0], cover.hex, { alt: nameOf(f) })}
        ${inCart ? `<span class="tag tag-accent">${icon("check", 14)} ${esc(unit(inCart, "pack"))}</span>` : ""}
        ${out ? `<span class="tag tag-muted">${esc(t("soldOut"))}</span>` : ""}
      </div>
      <div class="f-body"><h3 title="${esc(nameOf(f))}">${esc(nameOf(f))}</h3><p class="alt" title="${altText}">${altText}</p>
        <div class="f-meta"><span class="dots" aria-hidden="true">${dots}${more}</span><span class="f-count badge badge-soft">${esc(unit(f.colors.length, "color"))}</span></div></div></a>`;
  };
  return `<div class="${mode === "list" ? "f-list" : "f-grid"}">${list.map(card).join("")}</div>`;
}

const viewToggle = () => `<div class="seg" role="group" aria-label="${esc(t("view"))}">
  <button type="button" data-act="mode" data-m="grid" aria-pressed="${S.mode === "grid"}" aria-label="${esc(t("grid"))}">${icon("grid", 18)}</button>
  <button type="button" data-act="mode" data-m="list" aria-pressed="${S.mode === "list"}" aria-label="${esc(t("list"))}">${icon("list", 18)}</button></div>`;

/* ---------- Hero: centralized clean typography with stacked card deck ---------- */
function heroHtml() {
  const slides = heroSlides();
  return `<section class="hero" aria-label="${esc(t("heroLabel"))}">
    <div class="hero-in">
      <div class="hero-copy">
        <h1>${esc(t("w_title"))}</h1>
        <p class="lead">${esc(t("w_sub"))}</p>
        <div class="hero-cta">
          <button type="button" class="btn btn-primary btn-lg" data-act="scrollto" data-to="cats">${esc(t("heroCta"))} ${icon("arrowDown", 18)}</button>
          ${/* Order again section commented out for now: S.orders.length ? `<button type="button" class="btn btn-ghost btn-lg" data-act="scrollto" data-to="recent">${icon("refresh", 18)} ${esc(t("w_recent"))}</button>` : */ ""}
        </div>
      </div>
      <div class="hero-deck-wrap">
        <div class="hero-deck" role="region" aria-label="${esc(t("heroLabel"))}">
          ${slides.map((p, i) => `
            <div class="deck-card ${i === 0 ? "card-0" : i === 1 ? "card-1" : i === 2 ? "card-2" : "card-back"}" data-card="${i}">
              <img src="${esc(photoUrl(p.path))}" alt="" style="object-position:${p.x}% ${p.y}%" ${i === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">
              ${p.flower ? `<span class="deck-tag">${esc(nameOf(p.flower))}</span>` : ""}
            </div>
          `).join("")}
        </div>
      </div>
    </div>
  </section>`;
}

/* ---------- Live Market Proof Bar: infinite one-line continuous scrolling marquee ---------- */
const tickerItemSet = () => `
  <span class="datum-item">
    <span class="datum-dot live" aria-hidden="true"></span>
    <span class="datum-text"><b>${esc(unit(S.flowers.length, "type"))}</b> ${esc(t("strip_stock"))}</span>
  </span>
  <span class="datum-sep" aria-hidden="true">·</span>
  <span class="datum-item">
    <span class="datum-ic">${icon("package", 15)}</span>
    <span class="datum-text">${esc(t("strip_pack"))}</span>
  </span>
  <span class="datum-sep" aria-hidden="true">·</span>
  <span class="datum-item">
    <span class="datum-ic">${icon("leaf", 15)}</span>
    <span class="datum-text">${esc(t("strip_farm"))}</span>
  </span>
  <span class="datum-sep" aria-hidden="true">·</span>
  <span class="datum-item">
    <span class="datum-ic">${icon("chat", 15)}</span>
    <span class="datum-text">${esc(t("strip_wa"))}</span>
  </span>
  <span class="datum-sep" aria-hidden="true">·</span>
`;

const marketStrip = () => {
  const items = tickerItemSet().repeat(3);
  return `<aside class="market-ticker" aria-label="${esc(t("strip_label"))}">
    <div class="ticker-track">
      <div class="ticker-group">${items}</div>
      <div class="ticker-group" aria-hidden="true">${items}</div>
    </div>
  </aside>`;
};

/* ---------- Recent orders (carousel on phones, grid on larger screens) ---------- */
/* Order again section commented out for now */
function recentOrders() {
  return "";
  /*
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
  */
}

/* ---------- Shop: hero, categories and all flowers ---------- */
function categoriesBlock() {
  const cats = S.cats.map((c) => {
    const { photo, hex } = categoryCover(c);
    const n = flowersOf(c).length;
    const cleanName = esc(nameOf(c)).replace(/_/g, " ");
    const cleanAlt = esc(altOf(c)).replace(/_/g, " ");
    return `<a class="cat-card" href="#/c/${esc(c.slug)}" data-reveal>
      ${media(photo, hex, { alt: cleanName, cls: "cat-media" })}
      <div class="cat-body">
        <h3 title="${cleanName}">${cleanName}</h3>
        <p class="alt" title="${cleanAlt}">${cleanAlt}</p>
        <div class="cat-meta"><span class="cat-count badge badge-soft">${esc(unit(n, "type"))}</span></div>
      </div></a>`;
  }).join("");
  return `<section class="block" id="cats" aria-labelledby="cats-h"><div class="block-head" data-reveal><h2 id="cats-h">${t("shopTitle")}</h2><p class="muted">${t("shopSub")}</p></div>
    <div class="cat-grid">${cats}</div></section>`;
}

/** Inner HTML of the "All flowers" section, so filtering can update it without redrawing the page. */
export function allFlowersInner() {
  const list = S.shopCat === "all" ? S.flowers : S.flowers.filter((f) => f.category_id === S.shopCat);
  const displayList = byStock(list);
  const chip = (id, label, n) => `<button type="button" class="chip" data-act="shopcat" data-id="${id}" aria-pressed="${S.shopCat === id}">${esc(label)}<span class="chip-n">${n}</span></button>`;
  return `<div class="block-head row"><div><h2 id="all-h">${t("allFlowers")}</h2><p class="muted">${esc(unit(list.length, "type"))}</p></div>${viewToggle()}</div>
    <div class="chips" role="group" aria-label="${esc(t("filterLabel"))}">${chip("all", t("filterAll"), S.flowers.length)}${S.cats.map((c) => chip(c.id, nameOf(c), flowersOf(c).length)).join("")}</div>
    ${displayList.length ? flowerCards(displayList) : emptyState({ title: t("emptyCat") })}`;
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
    html: `${ heroHtml() }${ marketStrip() } <div class="page">${/* recentOrders() */ ""}${categoriesBlock()}
    <section class="block" id="all" aria-labelledby="all-h"><div id="allBlock">${allFlowersInner()}</div></section></div>`,
  };
}

/* ---------- Category ---------- */
export function categoryView(slug) {
  const cat = S.cats.find((c) => c.slug === slug);
  if (!cat) return notFoundView();
  let list = flowersOf(cat);
  if (S.stockOnly) list = list.filter(hasStock);
  else list = byStock(list);
  return {
    title: `${ nameOf(cat) } · ${ t("brand") } `,
    html: `< div class="page" > ${ backLink("#/shop", t("allCats")) }
      <div class="page-head"><h1>${esc(nameOf(cat))}</h1><p class="muted">${esc(altOf(cat))} · ${esc(unit(flowersOf(cat).length, "type"))}</p></div>
      <div class="toolbar">
        <label class="switch"><input type="checkbox" data-act="stock" ${S.stockOnly ? "checked" : ""}><span class="track" aria-hidden="true"></span><span>${t("stockOnly")}</span></label>
        ${viewToggle()}</div>
      ${ list.length ? flowerCards(list) : emptyState({ title: t("emptyCat") }) }</div > `,
  };
}

/* ---------- Flower ---------- */
export function selectedColor(f) {
  return f.colors.find((c) => c.id === S.sel[f.id]) || f.colors.find((c) => c.in_stock) || f.colors[0];
}

export function colorActiveCardHtml(color, f) {
  const activeQty = qty(color.id);
  const cleanColorAlt = esc(altOf(color)).replace(/_/g, " ");
  const activeColorStems = activeQty * f.stems_per_pack;
  return `< div class="cac-main" >
    <div class="cac-title-row">
      <b class="cac-name">${esc(nameOf(color))}</b>
      <span class="cac-alt">${cleanColorAlt}</span>
    </div>
    <div class="cac-status">
      ${color.in_stock ? `<span class="cac-stock in">${icon("check", 12)} ${t("inStock")}</span>` : `<span class="cac-stock out">${t("soldOut")}</span>`}
      ${activeQty ? `<span class="cac-yield">${unit(activeColorStems, "stem")}</span>` : ""}
    </div>
  </div >
    <div class="cac-action">
      ${color.in_stock ? stepper(color) : `<span class="badge badge-muted">${esc(t("soldOut"))}</span>`}
    </div>`;
}

export function flowerView(slug) {
  const f = S.flowers.find((x) => x.slug === slug);
  if (!f) return notFoundView();
  const color = selectedColor(f);
  const hasMultiple = f.colors.length > 1;
  const activeQty = qty(color.id);
  const totalPacks = flowerQty(f);
  const totalStems = totalPacks * (f.stems_per_pack || 0);
  const stemText = unit(totalStems, "stem");
  const totalOrderBadge = totalPacks > 0
    ? `< a href = "#/cart" class="badge badge-order-total" aria - label="${esc(t("flowerOrderTotal", { packs: unit(totalPacks, "pack"), stems: stemText }))}" title = "${esc(t("cart"))}" > ${ icon("cart", 14) } <span>${esc(t("flowerOrderTotal", { packs: unit(totalPacks, "pack"), stems: stemText }))}</span></a > `
    : "";
  const cleanFlowerAlt = esc(altOf(f)).replace(/_/g, " ");
  const bunches = Math.round(f.stems_per_pack / (f.stems_per_bunch || 1));
  const bunchSummary = f.stems_per_bunch > 1
    ? (isAr() ? `حزمة(${ unit(f.stems_per_bunch, "stem")
} /حزمة)` : `Bunches (${unit(f.stems_per_bunch, "stem")}/ea)`)
    : (isAr() ? "حبات مفردة" : "Single stems");

  // Collect all slides across all colors of this flower so swipe gestures work seamlessly
  const allSlides = [];
  f.colors.forEach((c) => {
    const cPhotos = c.photos && c.photos.length ? c.photos : [null];
    cPhotos.forEach((p, pIdx) => {
      allSlides.push({
        photo: p,
        color: c,
        pIdx,
        alt: `${ nameOf(f) } ${ nameOf(c) }${ c.photos && c.photos.length > 1 ? ` ${pIdx + 1}` : "" } `,
      });
    });
  });

  const initSlideIdx = Math.max(0, allSlides.findIndex((s) => s.color.id === color.id));
  const hasMultipleSlides = allSlides.length > 1;

  const slidesHtml = allSlides.map((s, i) => {
    const isEager = i === initSlideIdx;
    return `< div class="g-slide" data - i="${i}" data - c="${s.color.id}" data - pidx="${s.pIdx}" >
  <button type="button" class="g-slide-btn" data-act="zoom" data-c="${s.color.id}" data-i="${s.pIdx}" aria-label="${esc(t(" enlarge"))}: ${esc(s.alt)}" >
    ${ media(s.photo, s.color.hex, { size: "full", alt: s.alt, cls: "g-img", eager: isEager, w: 800, h: 800 }) }
      </button >
    </div > `;
  }).join("");

  const dotsHtml = hasMultipleSlides
    ? `< div class="g-counter-wrap" > <button type="button" class="g-counter" data-act="zoom" aria-label="${esc(t(" enlarge"))}: ${initSlideIdx + 1} / ${allSlides.length}" ><span id="gCurSlide">${initSlideIdx + 1}</span><span class="g-counter-sep">/</span><span>${allSlides.length}</span></button ></div > `
    : "";

  const arrowsHtml = hasMultipleSlides
    ? `< button type = "button" class="g-arrow prev" data - act="gprev" aria - label="${esc(t("prev"))}" > ${ icon("chevronLeft", 18, "flip") }</button > <button type="button" class="g-arrow next" data-act="gnext" aria-label="${esc(t(" next"))}" > ${ icon("chevronRight", 18, "flip") }</button > `
    : "";

  const zoomBtn = allSlides.some((s) => s.photo)
    ? `< button type = "button" class="g-zoom" data - act="zoom" aria - label="${esc(t("enlarge"))}" > ${ icon("maximize", 16) }</button > `
    : "";

  const fromCat = S.lastBrowse?.type === "category" && S.lastBrowse?.slug === f.cat.slug;
  const backHref = fromCat ? `# / c / ${ esc(f.cat.slug) } ` : "#/shop";
  const backLabel = fromCat ? nameOf(f.cat) : t("allFlowers");

  return {
    title: `${ nameOf(f) } · ${ t("brand") } `,
    html: `< div class="page flower-page" > ${ backLink(backHref, backLabel) }
<div class="f-layout">
  <div class="gallery">
    <div class="g-main" id="galleryMain">
      <div class="g-track" id="galleryTrack" tabindex="0" role="region" aria-label="${esc(nameOf(f))}">
        ${slidesHtml}
      </div>
      ${zoomBtn}
      ${arrowsHtml}
      ${dotsHtml}
    </div>
  </div>
  <div class="f-info">
    <div class="page-head">
      <div class="page-head-title-row">
        <h1>${esc(nameOf(f))}</h1>
        ${totalOrderBadge}
      </div>
      <div class="page-head-sub">
        <span class="muted">${cleanFlowerAlt}</span>
        ${hasMultiple ? `<span class="page-head-sep">·</span><span class="muted">${esc(unit(f.colors.length, "color"))}</span>` : ""}
      </div>
    </div>

    <div class="color-section">
      <div class="color-head">
        <h2 class="h-sm">${t("colorsTitle")}</h2>
      </div>

      ${hasMultiple ? `
            <div class="color-swatches-wrap">
              <div class="color-swatches" role="radiogroup" aria-label="${esc(t("colorsTitle"))}">
                ${f.colors.map((c) => {
        const isSel = c.id === color.id;
        const countInCart = qty(c.id);
        return `<button type="button" class="csw ${isSel ? "on" : ""} ${c.in_stock ? "" : "oos"}" data-act="color" data-c="${c.id}" data-fid="color:${c.id}" style="--c:${esc(c.hex)}" aria-label="${esc(nameOf(c))}${c.in_stock ? "" : " (" + t("soldOut") + ")"}" aria-pressed="${isSel}" title="${esc(nameOf(c))} (${esc(altOf(c))})">
                    <span class="csw-dot"></span>
                    ${countInCart ? `<span class="csw-badge">${countInCart}</span>` : ""}
                  </button>`;
      }).join("")}
              </div>
            </div>` : ""}

      <div class="color-active-card ${activeQty ? " has-qty" : ""}" id="colorActiveCard">
      ${colorActiveCardHtml(color, f)}
    </div>
  </div>

  <div class="pack-card">
    <div class="pack-card-head">
      ${icon("package", 15)}
      <span>${t("spec")}</span>
    </div>
    <div class="pack-card-grid">
      <div class="pack-stat">
        <span class="pack-stat-val">${esc(f.stems_per_pack)}</span>
        <span class="pack-stat-lbl">${isAr() ? "حبة في الكرتونة" : "Stems / pack"}</span>
      </div>
      <div class="pack-stat-sep" aria-hidden="true"></div>
      <div class="pack-stat">
        <span class="pack-stat-val">${bunches}</span>
        <span class="pack-stat-lbl">${esc(bunchSummary)}</span>
      </div>
    </div>
  </div>
</div>
      </div ></div > `,
  };
}

/* ---------- Cart ---------- */
function field(id, label, { value = "", type = "text", auto = "", mode = "", hint = "", err = "", dir = "", ph = "" } = {}) {
  return `< div class="field" ><label for="f-${id}">${label}</label>
    <input id="f-${id}" class="input ${err ? "is-bad" : ""}" data - f="${id}" type = "${type}" ${ auto ? `autocomplete="${auto}"` : "" } ${ mode ? `inputmode="${mode}"` : "" } ${ dir ? `dir="${dir}"` : "" } ${ ph ? `placeholder="${esc(ph)}"` : "" }
value = "${esc(value)}" ${ err ? `aria-invalid="true" aria-describedby="e-${id}"` : hint ? `aria-describedby="h-${id}"` : "" }>
  ${ err ? `<p class="err" id="e-${id}">${esc(t(err))}</p>` : hint ? `<p class="hint" id="h-${id}">${esc(hint)}</p>` : "" }</div > `;
}

export function cartView() {
  const lines = cartLines();
  if (!lines.length) {
    return {
      title: `${ t("cartTitle") } · ${ t("brand") } `,
      html: `< div class="page" > ${ emptyState({ iconName: "cart", title: t("cartEmpty"), sub: t("cartEmptySub"), action: `<a class="btn btn-primary" href="#/shop">${t("browse")}</a>` }) }</div > `,
    };
  }
  const tt = cartTotals();
  const groups = new Map();
  lines.forEach((l) => groups.set(l.flower.id, [...(groups.get(l.flower.id) || []), l]));
  const items = [...groups.values()].map((ls) => {
    const f = ls[0].flower;
    return `< section class="card grp" ><header class="grp-h"><h3>${esc(nameOf(f))}</h3><span class="muted">${esc(specText(f))}</span></header>
      <ul class="lines">${ls.map((l) => {
      const lt = totals([lineOf(l)]);
      const label = `${nameOf(f)} ${nameOf(l.color)}`;
      return `<li class="line" data-line="${l.color.id}">
          <button type="button" class="line-img" data-act="zoomc" data-c="${l.color.id}" aria-label="${esc(t("checkPhotos", { name: label }))}">${media(l.color.photos[0], l.color.hex, { alt: label })}</button>
          <div class="line-t"><b class="line-n">${swatch(l.color.hex)}${esc(nameOf(l.color))}</b><small>${esc(unit(lt.stems, "stem"))} · ${esc(unit(lt.bunches, "bunch"))}</small></div>
          <div class="line-a">${stepper(l.color)}<button type="button" class="icon-btn" data-act="del" data-c="${l.color.id}" aria-label="${esc(t("remove"))}: ${esc(label)}">${icon("trash", 18)}</button></div></li>`;
    }).join("")}</ul></section > `;
  }).join("");
  const e = S.errors;
  return {
    title: `${ t("cartTitle") } · ${ t("brand") } `,
    html: `< div class="page" > ${ backLink("#/shop", t("addMore")) }
      <div class="page-head"><h1>${t("cartTitle")}</h1></div>
      <div class="cart-grid"><div class="cart-items">${items}</div>
        <aside class="card summary" aria-labelledby="sum-h"><h2 id="sum-h" class="h-sm">${t("summary")}</h2>
          <dl class="totals"><div><dt>${t("packs")}</dt><dd>${nf(tt.packs)}</dd></div>
            <div><dt>${t("stems")}</dt><dd>${nf(tt.stems)}</dd></div>
            <div><dt>${t("bunches")}</dt><dd>${nf(tt.bunches)}</dd></div></dl>
          <h2 class="h-sm">${t("details")}</h2>
          <form id="orderForm" novalidate>
            ${field("name", t("fName"), { value: S.form.name, auto: "name", ph: t("fNamePh"), err: e.name })}
            <div class="field"><label for="f-note">${t("fNote")}</label><textarea id="f-note" class="input" data-f="note" rows="2" maxlength="300" placeholder="${esc(t("fNotePh"))}">${esc(S.form.note)}</textarea></div>
            <details class="preview"><summary>${t("preview")}</summary><pre id="msgPreview"></pre></details>
            <button type="submit" class="btn btn-wa btn-lg btn-block" id="sendBtn" ${S.sending ? "disabled" : ""}>${icon("chat", 20)} <span>${S.sending ? t("sending") : t("send")}</span></button>
            <p class="muted center small">${t("noPay")}</p>
          </form></aside></div ></div > `,
  };
}

export const previewText = () => `${ buildMessage(cartLines(), "", S.form) } \n\nOrder with photos: \n${ siteUrl() } /order/ ? t = [order_Reference]`;

/* ---------- Sent ---------- */
export function sentView() {
  const o = S.orders[0];
  if (!o) return notFoundView();
  return {
    title: `${ t("sentTitle") } · ${ t("brand") } `,
    html: `< div class="page narrow" > <div class="done">
  <span class="done-ic">${icon("check", 34)}</span>
  <h1>${t("sentTitle")}</h1><p class="muted">${t("sentSub")}</p>
  <dl class="done-meta"><div><dt>${t("ref")}</dt><dd>${esc(o.token ? refOf(o.token) : "-")}</dd></div>
    <div><dt>${t("packs")}</dt><dd>${nf(o.packs)}</dd></div></dl>
  <div class="done-actions">
    <a class="btn btn-wa btn-lg" href="${esc(S.lastWa || "#")}" target="_blank" rel="noopener">${icon("chat", 20)} ${t("openWa")}</a>
  ${o.token ? `<a class="btn btn-ghost" href="${esc(orderLink(o.token))}" target="_blank" rel="noopener">${icon("link", 18)} ${t("orderPage")}</a>
        <button class="btn btn-ghost" data-act="copy" data-link="${esc(orderLink(o.token))}">${icon("copy", 18)} ${t("copyLink")}</button>` : ""}
  <a class="btn btn-primary" href="#/shop">${t("continue")}</a></div></div ></div > `,
  };
}

export function errorView() {
  return `< div class="page" > ${ emptyState({ iconName: "alert", title: t("eLoad"), sub: t("eLoadSub"), action: `<button class="btn btn-primary" data-act="retry">${icon("refresh", 18)} ${t("retry")}</button>` }) }</div > `;
}
