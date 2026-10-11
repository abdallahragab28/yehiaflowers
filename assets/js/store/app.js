import { rpc, photoUrl } from "../shared/api.js";
import { $, $$, debounce, store, normPhone, copyText, esc } from "../shared/util.js";
import { prefs, toggleLang, toggleTheme, effTheme } from "../shared/prefs.js";
import { unit, nameOf } from "../shared/i18n.js";
import { icon } from "../shared/icons.js";
import { toast, lightbox } from "../shared/ui.js";
import { t } from "./strings.js";
import {
  S, loadCatalog, qty, setQty, pruneCart, clearCart, cartLines, cartTotals, saveForm, validateForm,
  recordOrder, addFromOrder, buildMessage, waUrl, waNumberSet,
} from "./state.js";
import {
  shopView, categoryView, flowerView, cartView, sentView, notFoundView, errorView,
  selectedColor, previewText, allFlowersInner,
} from "./views.js";

const viewEl = $("#view");
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
let heroStop = () => {};
let navFwd = true; // true when the user moved forward; false for browser back/forward
let prevHash = location.hash;
let pop = ""; // color id whose counter should animate after the next render
let loadedAt = Date.now();
const scrollMem = new Map();

/* ---------- Routing (hash based: no server setup needed) ---------- */
function parse() {
  const [path] = (location.hash.slice(1) || "/").split("?");
  const [a, b] = path.split("/").filter(Boolean);
  const names = { c: "category", f: "flower", cart: "cart", sent: "sent" };
  return { name: names[a] || "shop", arg: b ? decodeURIComponent(b) : "" };
}

function build(r) {
  switch (r.name) {
    case "category": return categoryView(r.arg);
    case "flower": return flowerView(r.arg);
    case "cart": return cartView();
    case "sent": return sentView();
    case "shop": return shopView();
    default: return notFoundView();
  }
}

export function render({ animate = false } = {}) {
  if (S.status !== "ready") return;
  const r = parse();
  const v = build(r);
  const focusId = document.activeElement?.dataset?.fid;
  heroStop();
  heroStop = () => {};
  viewEl.className = "view" + (animate ? " enter" : "");
  viewEl.innerHTML = v.html;
  document.title = v.title;
  chrome(r.name);

  if (v.hero) heroStop = initHero(viewEl);
  initCarousels(viewEl);
  if (r.name === "cart") updatePreview();
  if (animate) { revealIn(viewEl); if (document.activeElement?.id !== "q") viewEl.focus({ preventScroll: true }); }
  else if (focusId) $(`[data-fid="${focusId}"]`, viewEl)?.focus({ preventScroll: true });
  if (pop) {
    $$(`[data-out="${pop}"]`, viewEl).forEach((el) => el.classList.add("bump"));
    pop = "";
  }
}

/* ---------- Scroll reveal: elements fade up once as they enter the screen ---------- */
const io = !reduceMotion && "IntersectionObserver" in window
  ? new IntersectionObserver((entries) => {
      let k = 0;
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.style.setProperty("--d", `${Math.min(k++, 8) * 70}ms`);
        const el = e.target;
        el.classList.add("in");
        io.unobserve(el);
        // Once the entrance has finished, drop the helper classes so hover effects stay snappy.
        setTimeout(() => { el.classList.remove("rv", "in"); el.style.removeProperty("--d"); }, 1000 + k * 70);
      });
    }, { rootMargin: "0px 0px -6% 0px", threshold: 0.06 })
  : null;

function revealIn(root) {
  if (!io) return;
  $$("[data-reveal]", root).forEach((el) => { el.classList.add("rv"); io.observe(el); });
}

/* ---------- Hero slider: fade, dots, arrows, swipe, autoplay with pause button (WCAG 2.2.2) ---------- */
function initHero(root) {
  const hero = $(".hero", root);
  const slides = $$(".hero-slide", hero);
  if (!hero || slides.length < 2) return () => {};
  const dots = $$(".hero-dot", hero);
  const pauseBtn = $("[data-hero='togglePlay']", hero);
  let i = 0, timer = 0, hovering = false, touching = false, paused = reduceMotion;

  const updatePauseBtn = () => {
    if (!pauseBtn) return;
    pauseBtn.innerHTML = icon(paused ? "play" : "pause", 14);
    pauseBtn.setAttribute("aria-label", t(paused ? "playSlide" : "pauseSlide"));
    pauseBtn.setAttribute("aria-pressed", paused ? "true" : "false");
  };

  const show = (n) => {
    slides[i].classList.remove("on");
    dots[i]?.classList.remove("on");
    dots[i]?.setAttribute("aria-current", "false");
    i = (n + slides.length) % slides.length;
    slides[i].classList.add("on");
    dots[i]?.classList.add("on");
    dots[i]?.setAttribute("aria-current", "true");
  };
  const play = () => {
    clearInterval(timer);
    if (reduceMotion || paused) return;
    timer = setInterval(() => { if (!hovering && !touching && !document.hidden && !paused) show(i + 1); }, 6000);
  };

  hero.addEventListener("click", (e) => {
    const b = e.target.closest("[data-hero]");
    if (!b) return;
    const d = b.dataset.hero;
    if (d === "togglePlay") {
      paused = !paused;
      updatePauseBtn();
      if (paused) clearInterval(timer);
      else play();
      return;
    }
    show(d === "next" ? i + 1 : d === "prev" ? i - 1 : Number(d));
    play();
  });
  hero.addEventListener("mouseenter", () => (hovering = true));
  hero.addEventListener("mouseleave", () => (hovering = false));
  let x0 = null;
  hero.addEventListener("pointerdown", (e) => { if (!e.target.closest("button, a")) { x0 = e.clientX; touching = true; } });
  hero.addEventListener("pointerup", (e) => {
    touching = false;
    if (x0 === null) return;
    const dx = e.clientX - x0;
    x0 = null;
    if (Math.abs(dx) > 50) {
      const rtl = document.documentElement.dir === "rtl";
      show((dx < 0) !== rtl ? i + 1 : i - 1);
      play();
    }
  });
  hero.addEventListener("pointercancel", () => { touching = false; x0 = null; });
  updatePauseBtn();
  play();
  return () => clearInterval(timer);
}

/* ---------- Swipeable carousel with dots (recent orders on phones) ---------- */
function initCarousels(root) {
  $$("[data-carousel]", root).forEach((car) => {
    const track = $(".car-track", car);
    const dots = $$(".car-dot", car);
    if (!dots.length) return;
    dots.forEach((d, n) => d.addEventListener("click", () =>
      track.children[n]?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", inline: "start", block: "nearest" })));
    if (!("IntersectionObserver" in window)) return;
    const seen = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        const n = [...track.children].indexOf(e.target);
        dots.forEach((d, k) => d.classList.toggle("on", k === n));
      });
    }, { root: track, threshold: 0.6 });
    [...track.children].forEach((c) => seen.observe(c));
  });
}

/* ---------- Persistent chrome (header, cart bar) ---------- */
function translateStatic() {
  $$("[data-t]").forEach((el) => (el.textContent = t(el.dataset.t)));
  $$("[data-t-ph]").forEach((el) => (el.placeholder = t(el.dataset.tPh)));
  $$("[data-t-label]").forEach((el) => el.setAttribute("aria-label", t(el.dataset.tLabel)));
  $("#langBtn").textContent = t("langBtn");
  $("#themeBtn").innerHTML = icon(effTheme() === "dark" ? "sun" : "moon", 20);
  $("#searchBtn").innerHTML = icon("search", 20);
  $("#cartIc").innerHTML = icon("cart", 22);
  $("#qIc").innerHTML = icon("search", 18);
  $("#qClear").innerHTML = icon("x", 16);
  $("#searchClose").innerHTML = icon("chevronDown", 18);
  const footWa = $("#footWa");
  if (footWa) footWa.innerHTML = `${icon("chat", 16)} <span>${t("footWa")}</span>`;
  const footIg = $("#footIg");
  if (footIg) footIg.innerHTML = `${icon("instagram", 16)} <span>${t("footIg")}</span>`;
}

function chrome(name) {
  document.body.dataset.route = name;
  const tt = cartTotals();
  const badge = $("#cartCount");
  badge.textContent = tt.packs;
  badge.hidden = !tt.packs;

  const bar = $("#cartbar");
  const show = tt.packs > 0 && ["shop", "category", "flower"].includes(name);
  bar.hidden = !show;
  if (show) {
    bar.innerHTML = `<span class="cb-l">${icon("cart", 20)}<b>${esc(unit(tt.packs, "pack"))}</b><span class="cb-s">${esc(unit(tt.stems, "stem"))}</span></span>
      <span class="cb-r">${t("review")} ${icon("arrowRight", 18, "flip")}</span>`;
  }

  const q = $("#q");
  if (q.value !== S.q) q.value = S.q;
  $("#qClear").hidden = !S.q;

  const wa = $("#footWa");
  wa.hidden = !waNumberSet();
  if (!wa.hidden) wa.href = waUrl("");
}

/* ---------- Cart helpers ---------- */
function updatePreview() {
  const pre = $("#msgPreview");
  if (pre) pre.textContent = previewText();
}

function setSendState() {
  const btn = $("#sendBtn");
  if (!btn) return;
  btn.disabled = S.sending;
  btn.querySelector("span").textContent = S.sending ? t("sending") : t("send");
}

async function send() {
  if (S.sending) return;
  const lines = cartLines();
  if (!lines.length) return;
  if (!validateForm()) {
    render();
    $(".input.is-bad", viewEl)?.focus();
    toast(t("fixForm"), { type: "error" });
    return;
  }
  S.sending = true;
  setSendState();
  // Opened inside the click so popup blockers allow it; its address is set once the order is saved.
  const win = window.open("about:blank", "_blank");
  let token = "";
  let saved = true;
  try {
    token = await rpc("create_order", {
      p_name: S.form.name.trim(),
      p_phone: "",
      p_city: "",
      p_lang: prefs.lang,
      p_note: S.form.note.trim() || null,
      p_items: lines.map((l) => ({ color_id: l.color.id, packs: l.packs })),
    });
  } catch (err) {
    const msg = String(err.message || "");
    if (/unavailable/i.test(msg)) {
      win?.close();
      S.sending = false;
      await loadCatalog().catch(() => {});
      pruneCart();
      render();
      toast(t("eUnavailable"), { type: "error", ms: 7000 });
      return;
    }
    if (/too many/i.test(msg)) {
      win?.close();
      S.sending = false;
      setSendState();
      toast(t("eRate"), { type: "error", ms: 7000 });
      return;
    }
    saved = false; // network problem: still let the customer send the WhatsApp message
    console.error(err);
  }
  const url = waUrl(buildMessage(lines, token, S.form));
  S.lastWa = url;
  recordOrder(lines, token);
  clearCart();
  S.form.note = "";
  S.sending = false;
  if (win) win.location.href = url;
  else location.href = url;
  if (!saved) toast(t("eNotSaved"), { type: "error", ms: 8000 });
  go("#/sent");
}

/* ---------- Actions ---------- */
const photoLabels = () => ({ close: t("close"), prev: t("prev"), next: t("next") });
const lbItems = (color) => {
  const label = `${nameOf(color.flower)} · ${nameOf(color)}`;
  return color.photos.map((p, n) => ({ src: photoUrl(p.path), thumb: photoUrl(p.path, "thumb"), alt: `${label} ${n + 1}`, caption: label }));
};
const currentFlower = () => S.flowers.find((f) => f.slug === parse().arg);

function setQuery(value) {
  S.q = value;
  $("#q").value = value;
  $("#qClear").hidden = !value;
  if (parse().name === "shop") render({ animate: true });
  else if (value) go("#/shop");
}

/** Redraws only the "All flowers" section (filter chips, view toggle) so the hero does not restart. */
function paintAll() {
  const box = $("#allBlock");
  if (!box) return render();
  box.innerHTML = allFlowersInner();
  revealIn(box);
}

const ACT = {
  lang() { toggleLang(); translateStatic(); render(); },
  theme() { toggleTheme(); translateStatic(); },
  home() {
    if (S.q) setQuery("");
    else if (location.hash === "#/shop" || !location.hash) { window.scrollTo({ top: 0, behavior: "smooth" }); }
  },
  inc(el) { const id = el.dataset.c; setQty(id, qty(id) + 1); pop = id; render(); },
  dec(el) { const id = el.dataset.c; setQty(id, qty(id) - 1); pop = id; render(); },
  del(el) {
    const id = el.dataset.c, n = qty(id), c = S.colorBy.get(id);
    setQty(id, 0);
    render();
    toast(t("removed", { name: `${nameOf(c.flower)} ${nameOf(c)}` }), {
      action: { label: t("undo"), onClick: () => { setQty(id, n); render(); } },
    });
  },
  color(el) { const f = currentFlower(); if (!f) return; S.sel[f.id] = el.dataset.c; S.photo = 0; render(); },
  photo(el) { S.photo = Number(el.dataset.i); render(); },
  zoom() {
    const f = currentFlower();
    if (!f) return;
    lightbox(lbItems(selectedColor(f)), S.photo, photoLabels());
  },
  zoomc(el) {
    const c = S.colorBy.get(el.dataset.c);
    if (!c?.photos.length) return toast(t("noPhoto"));
    lightbox(lbItems(c), 0, photoLabels());
  },
  mode(el) {
    S.mode = el.dataset.m;
    store.set("yf.mode", S.mode);
    if (parse().name === "shop" && !S.q.trim()) paintAll(); else render();
  },
  shopcat(el) { S.shopCat = el.dataset.id; paintAll(); },
  scrollto(el) {
    document.getElementById(el.dataset.to)?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  },
  stock(el) { S.stockOnly = el.checked; render(); },
  clearq() { setQuery(""); $("#q").focus(); },
  reorder(el) {
    const rec = S.orders[Number(el.dataset.i)];
    if (!rec) return;
    const { added, skipped } = addFromOrder(rec);
    if (skipped) toast(t("skippedItems", { n: skipped }), { type: "error", ms: 6000 });
    else toast(t("reordered"));
    if (added) go("#/cart");
    else render();
  },
  async copy(el) { if (await copyText(el.dataset.link)) toast(t("copied")); },
  retry() { boot(); },
};

function go(hash) {
  navFwd = true;
  if (location.hash === hash) render({ animate: true });
  else location.hash = hash;
}

/* ---------- Events ---------- */
document.addEventListener("click", (e) => {
  if (e.target.closest('a[href^="#/"]')) navFwd = true;
  const el = e.target.closest("[data-act]");
  if (el && ACT[el.dataset.act]) ACT[el.dataset.act](el, e);
});

document.addEventListener("submit", (e) => {
  if (e.target.id === "orderForm") { e.preventDefault(); send(); }
});

const saveFormSoon = debounce(saveForm, 300);
document.addEventListener("input", (e) => {
  const key = e.target.dataset?.f;
  if (!key) return;
  S.form[key] = e.target.value;
  saveFormSoon();
  if (S.errors[key]) {
    delete S.errors[key];
    e.target.classList.remove("is-bad");
    e.target.removeAttribute("aria-invalid");
    $(`#e-${key}`)?.remove();
  }
  updatePreview();
});

window.addEventListener("hashchange", () => {
  scrollMem.set(prevHash, window.scrollY);
  const fwd = navFwd;
  navFwd = false;
  prevHash = location.hash;
  render({ animate: true });
  window.scrollTo(0, fwd ? 0 : scrollMem.get(prevHash) || 0);
});

// Search box in the header.
const qInput = $("#q");
const onQuery = debounce(() => {
  S.q = qInput.value;
  $("#qClear").hidden = !S.q;
  if (parse().name === "shop") render({ animate: true });
  else if (S.q.trim()) go("#/shop");
}, 160);
qInput.addEventListener("input", onQuery);
$("#searchForm").addEventListener("submit", (e) => { e.preventDefault(); qInput.blur(); });

// Header gets a soft shadow once the page scrolls. (Only a class changes, so nothing jumps.)
let ticking = false;
window.addEventListener("scroll", () => {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    $("#top").classList.toggle("scrolled", window.scrollY > 6);
    ticking = false;
  });
}, { passive: true });

/* ---------- Search overlay toggle & accessibility ---------- */
const searchOverlay = $("#searchOverlay");
const searchBtnEl = $("#searchBtn");
const searchCloseEl = $("#searchClose");
const qInputEl = $("#q");
const isDesktop = matchMedia("(min-width: 860px)");

function syncSearchAria() {
  if (isDesktop.matches) {
    searchOverlay.removeAttribute("aria-hidden");
    searchBtnEl.setAttribute("aria-expanded", "false");
  } else {
    const open = searchOverlay.classList.contains("open");
    searchOverlay.setAttribute("aria-hidden", open ? "false" : "true");
    searchBtnEl.setAttribute("aria-expanded", open ? "true" : "false");
  }
}
isDesktop.addEventListener("change", syncSearchAria);
syncSearchAria();

function openSearch() {
  searchOverlay.classList.add("open");
  searchOverlay.setAttribute("aria-hidden", "false");
  searchBtnEl.setAttribute("aria-expanded", "true");
  setTimeout(() => qInputEl.focus(), 50);
}
function closeSearch() {
  searchOverlay.classList.remove("open");
  if (!isDesktop.matches) {
    searchOverlay.setAttribute("aria-hidden", "true");
  }
  searchBtnEl.setAttribute("aria-expanded", "false");
  searchBtnEl.focus();
}

searchBtnEl.addEventListener("click", () => {
  if (searchOverlay.classList.contains("open")) closeSearch();
  else openSearch();
});
if (searchCloseEl) searchCloseEl.addEventListener("click", closeSearch);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && searchOverlay.classList.contains("open")) {
    closeSearch();
  }
});

// Refresh stock when the customer comes back to the tab after a while.
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState !== "visible" || S.status !== "ready" || Date.now() - loadedAt < 5 * 60 * 1000) return;
  try { await loadCatalog(); loadedAt = Date.now(); render(); } catch { /* keep showing the old catalog */ }
});

/* ---------- Boot ---------- */
async function boot() {
  S.status = "loading";
  $("#boot").classList.remove("hide");
  try {
    await Promise.all([loadCatalog(), new Promise((r) => setTimeout(r, 300))]);
    loadedAt = Date.now();
  } catch (err) {
    console.error(err);
    S.status = "error";
    document.body.dataset.route = "error";
    viewEl.innerHTML = errorView();
    $("#boot").classList.add("hide");
    return;
  }
  $("#boot").classList.add("hide");
  render({ animate: true });
}

history.scrollRestoration = "manual";
translateStatic();
boot();
