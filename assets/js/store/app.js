import { rpc, photoUrl } from "../shared/api.js";
import { $, $$, debounce, store, copyText, esc } from "../shared/util.js";
import { prefs, toggleLang, toggleTheme, effTheme } from "../shared/prefs.js";
import { unit, nameOf } from "../shared/i18n.js";
import { icon } from "../shared/icons.js";
import { toast, lightbox } from "../shared/ui.js";
import { t } from "./strings.js";
import {
  S, loadCatalog, qty, setQty, pruneCart, clearCart, cartLines, cartTotals, saveForm, validateForm,
  recordOrder, addFromOrder, buildMessage, waUrl, waNumberSet, flowerQty,
} from "./state.js";
import {
  shopView, categoryView, flowerView, cartView, sentView, notFoundView, errorView,
  selectedColor, previewText, allFlowersInner, colorActiveCardHtml,
} from "./views.js";

const viewEl = $("#view");
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
let heroStop = () => { };
let navFwd = true; // true when the user moved forward; false for browser back/forward
let prevHash = location.hash;
let pop = ""; // color id whose counter should animate after the next render
let loadedAt = Date.now();
const scrollMem = new Map();
const routeKey = (h) => (!h || h === "#" || h === "#/" || h === "#/shop" ? "#/shop" : h);

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
  heroStop = () => { };
  viewEl.className = "view" + (animate ? " enter" : "");
  viewEl.innerHTML = v.html;
  document.title = v.title;
  chrome(r.name);

  if (v.hero) heroStop = initHero(viewEl);
  initCarousels(viewEl);
  initGallery(viewEl);
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

/* ---------- Hero slider: fade, dots, swipeable (touch & desktop drag), autoplay ---------- */
function initHero(root) {
  const hero = $(".hero", root);
  const slides = $$(".hero-slide", hero);
  if (!hero || slides.length < 2) return () => { };
  const dots = $$(".hero-dot", hero);
  let i = 0, timer = 0, hovering = false, touching = false;

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
    if (reduceMotion) return;
    timer = setInterval(() => {
      if (!hovering && !touching && !document.hidden) show(i + 1);
    }, 6000);
  };

  hero.addEventListener("click", (e) => {
    const b = e.target.closest("[data-hero]");
    if (!b) return;
    const d = b.dataset.hero;
    show(d === "next" ? i + 1 : d === "prev" ? i - 1 : Number(d));
    play();
  });

  hero.addEventListener("mouseenter", () => (hovering = true));
  hero.addEventListener("mouseleave", () => (hovering = false));

  // Left & right swipe tracking (touch & desktop mouse drag)
  let startX = 0, startY = 0, lastX = 0, lastY = 0;
  let active = false;

  const onStart = (x, y, target) => {
    if (target && target.closest("button, a")) return;
    startX = lastX = x;
    startY = lastY = y;
    active = true;
    touching = true;
  };

  const onMove = (x, y) => {
    if (!active) return;
    lastX = x;
    lastY = y;
  };

  const onEnd = () => {
    if (!active) return;
    active = false;
    touching = false;
    const dx = lastX - startX;
    const dy = lastY - startY;
    if (Math.abs(dx) >= 30 && Math.abs(dx) > Math.abs(dy)) {
      show(dx > 0 ? i + 1 : i - 1);
      play();
    }
  };

  const onCancel = () => {
    active = false;
    touching = false;
  };

  // Prevent default image drag
  hero.addEventListener("dragstart", (e) => e.preventDefault());

  // Touch devices: passive touch listeners
  hero.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    onStart(t.clientX, t.clientY, e.target);
  }, { passive: true });

  hero.addEventListener("touchmove", (e) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    onMove(t.clientX, t.clientY);
  }, { passive: true });

  hero.addEventListener("touchend", onEnd, { passive: true });
  hero.addEventListener("touchcancel", onCancel, { passive: true });

  // Desktop mouse dragging (only when e.pointerType === "mouse")
  const onMouseDown = (e) => {
    if (e.pointerType && e.pointerType !== "mouse") return;
    if (e.button !== 0) return;
    onStart(e.clientX, e.clientY, e.target);
  };
  const onMouseMove = (e) => {
    if (e.pointerType && e.pointerType !== "mouse") return;
    onMove(e.clientX, e.clientY);
  };
  const onMouseUp = (e) => {
    if (e.pointerType && e.pointerType !== "mouse") return;
    onEnd();
  };

  hero.addEventListener("pointerdown", onMouseDown);
  window.addEventListener("pointermove", onMouseMove);
  window.addEventListener("pointerup", onMouseUp);

  play();
  return () => {
    clearInterval(timer);
    window.removeEventListener("pointermove", onMouseMove);
    window.removeEventListener("pointerup", onMouseUp);
  };
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

export function updateActiveColorUI(colorId, root = document) {
  const f = currentFlower();
  if (!f) return;
  const color = f.colors.find((c) => c.id === colorId);
  if (!color) return;
  S.sel[f.id] = colorId;

  // Update swatches
  $$(".csw", root).forEach((btn) => {
    const on = btn.dataset.c === colorId;
    btn.classList.toggle("on", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  });

  // Update active card
  const card = $("#colorActiveCard", root);
  if (card) {
    const q = qty(color.id);
    card.classList.toggle("has-qty", q > 0);
    card.innerHTML = colorActiveCardHtml(color, f);
  }
}

function updateFlowerStepperUI(colorId) {
  const f = currentFlower();
  if (!f) return;
  const n = qty(colorId);
  const color = f.colors.find((c) => c.id === colorId);

  // 1. Update stepper output and buttons in place
  const out = $(`output[data-out="${colorId}"]`, viewEl);
  if (out) {
    out.textContent = n;
    out.classList.remove("bump");
    void out.offsetWidth;
    out.classList.add("bump");
  }
  const decBtn = $(`button[data-act="dec"][data-c="${colorId}"]`, viewEl);
  if (decBtn) decBtn.disabled = n <= 0;
  const incBtn = $(`button[data-act="inc"][data-c="${colorId}"]`, viewEl);
  if (incBtn) incBtn.disabled = n >= 99;

  // 2. Update active color card highlight and yield calculation
  const activeCard = $("#colorActiveCard", viewEl);
  if (activeCard && color && S.sel[f.id] === colorId) {
    activeCard.classList.toggle("has-qty", n > 0);
    const statusEl = $(".cac-status", activeCard);
    if (statusEl) {
      let yieldEl = $(".cac-yield", statusEl);
      if (n > 0) {
        const totalStems = n * (f.stems_per_pack || 0);
        if (!yieldEl) {
          yieldEl = document.createElement("span");
          yieldEl.className = "cac-yield";
          statusEl.appendChild(yieldEl);
        }
        yieldEl.textContent = unit(totalStems, "stem");
      } else if (yieldEl) {
        yieldEl.remove();
      }
    }
  }

  // 3. Update the cart count badge on the color swatch button
  const swatchBtn = $(`button.csw[data-c="${colorId}"]`, viewEl);
  if (swatchBtn) {
    let badge = $(".csw-badge", swatchBtn);
    if (n > 0) {
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "csw-badge";
        swatchBtn.appendChild(badge);
      }
      badge.textContent = n;
    } else if (badge) {
      badge.remove();
    }
  }

  // 4. Update the aggregate order badge beside the flower title
  const titleRow = $(".page-head-title-row", viewEl);
  if (titleRow) {
    const totalPacks = flowerQty(f);
    let totalBadge = $(".badge-order-total", titleRow);
    if (totalPacks > 0) {
      const totalStems = totalPacks * (f.stems_per_pack || 0);
      const labelText = t("flowerOrderTotal", { packs: unit(totalPacks, "pack"), stems: unit(totalStems, "stem") });
      if (!totalBadge) {
        totalBadge = document.createElement("a");
        totalBadge.className = "badge badge-order-total";
        totalBadge.href = "#/cart";
        totalBadge.title = t("cart");
        totalBadge.innerHTML = `${icon("cart", 14)}<span></span>`;
        titleRow.appendChild(totalBadge);
      }
      totalBadge.setAttribute("aria-label", labelText);
      const span = totalBadge.querySelector("span");
      if (span) span.textContent = labelText;
    } else if (totalBadge) {
      totalBadge.remove();
    }
  }

  // 5. Update global chrome (header count badge & sticky bottom cart bar)
  chrome("flower");
}

function getCurrentSlideIndex(track, slides) {
  const trackRect = track.getBoundingClientRect();
  const trackCenter = trackRect.left + trackRect.width / 2;
  let closestIdx = 0;
  let minDiff = Infinity;
  slides.forEach((s, idx) => {
    const r = s.getBoundingClientRect();
    const slideCenter = r.left + r.width / 2;
    const diff = Math.abs(slideCenter - trackCenter);
    if (diff < minDiff) {
      minDiff = diff;
      closestIdx = idx;
    }
  });
  return closestIdx;
}

/* ---------- Flower gallery: swipe track, hero-style dots, drag ---------- */
function initGallery(root) {
  const gMain = $("#galleryMain", root);
  if (!gMain) return;
  const track = $("#galleryTrack", gMain);
  if (!track) return;
  prefetchColorPhotos();
  const slides = $$(".g-slide", track);
  const f = currentFlower();

  // Scroll to selected color's first slide initially
  if (f && S.sel[f.id]) {
    const initSlide = track.querySelector(`.g-slide[data-c="${S.sel[f.id]}"]`);
    if (initSlide) {
      initSlide.scrollIntoView({ behavior: "auto", inline: "start", block: "nearest" });
    }
  }

  // Sync slide counter and active color when swiping/scrolling slides
  if (slides.length > 1 && "IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        const slide = e.target;
        const i = Number(slide.dataset.i);
        const cId = slide.dataset.c;
        if (Number.isNaN(i)) return;
        S.photo = Number(slide.dataset.pidx) || 0;
        const curSlideEl = $("#gCurSlide", gMain);
        if (curSlideEl) curSlideEl.textContent = i + 1;
        if (f && cId && cId !== S.sel[f.id]) {
          updateActiveColorUI(cId, root);
          const target = $(`[data-fid="color:${cId}"]`, root);
          target?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", inline: "center", block: "nearest" });
        }
      });
    }, { root: track, threshold: 0.55 });

    slides.forEach((slide) => observer.observe(slide));
  }

  // Pointer drag support (distinguish tap/zoom from swipe/drag)
  let isDown = false, startX = 0, scrollLeft = 0, moved = false;
  track.addEventListener("pointerdown", (e) => {
    isDown = true;
    moved = false;
    startX = e.pageX;
    scrollLeft = track.scrollLeft;
    if (e.pointerType === "mouse" && e.button === 0) {
      track.setPointerCapture(e.pointerId);
    }
  });
  track.addEventListener("pointermove", (e) => {
    if (!isDown) return;
    const dx = e.pageX - startX;
    if (Math.abs(dx) > 6) moved = true;
    if (e.pointerType === "mouse") {
      track.scrollLeft = scrollLeft - dx;
    }
  });
  const endDrag = (e) => {
    if (!isDown) return;
    isDown = false;
    try { track.releasePointerCapture(e.pointerId); } catch { }
  };
  track.addEventListener("pointerup", endDrag);
  track.addEventListener("pointercancel", endDrag);
  track.addEventListener("click", (e) => {
    if (moved) {
      e.stopPropagation();
      e.preventDefault();
      moved = false;
    }
  }, true);
}

/* ---------- Pre-cache primary photos for the first 4 colors during browser idle time ---------- */
const prefetchedPhotos = new Set();
function prefetchColorPhotos() {
  const f = currentFlower();
  if (!f || !f.colors || f.colors.length <= 1) return;
  const curColor = selectedColor(f);
  const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 120));
  idle(() => {
    const targets = f.colors
      .filter((c) => c.id !== curColor.id && c.photos && c.photos.length)
      .slice(0, 4);
    targets.forEach((c) => {
      const url = photoUrl(c.photos[0].path, "full");
      if (!prefetchedPhotos.has(url)) {
        prefetchedPhotos.add(url);
        const img = new Image();
        img.src = url;
      }
    });
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
  const backTopIc = $("#backTopIc");
  if (backTopIc) backTopIc.innerHTML = icon("arrowUp", 20);
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
  document.body.classList.toggle("has-cartbar", show);
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
      await loadCatalog().catch(() => { });
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
function currentFlower() { return S.flowers.find((f) => f.slug === parse().arg); }

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
  top() {
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  },
  inc(el) {
    const id = el.dataset.c;
    setQty(id, qty(id) + 1);
    pop = id;
    if (parse().name === "flower") {
      updateFlowerStepperUI(id);
    } else {
      render();
    }
  },
  dec(el) {
    const id = el.dataset.c;
    setQty(id, qty(id) - 1);
    pop = id;
    if (parse().name === "flower") {
      updateFlowerStepperUI(id);
    } else {
      render();
    }
  },
  del(el) {
    const id = el.dataset.c, n = qty(id), c = S.colorBy.get(id);
    setQty(id, 0);
    render();
    toast(t("removed", { name: `${nameOf(c.flower)} ${nameOf(c)}` }), {
      action: { label: t("undo"), onClick: () => { setQty(id, n); render(); } },
    });
  },
  color(el) {
    const f = currentFlower();
    if (!f) return;
    const cId = el.dataset.c;
    updateActiveColorUI(cId);

    const track = $("#galleryTrack");
    if (track) {
      const slides = Array.from(track.children);
      const targetSlide = track.querySelector(`.g-slide[data-c="${cId}"]`);
      if (targetSlide) {
        const curIdx = getCurrentSlideIndex(track, slides);
        const targetIdx = Number(targetSlide.dataset.i);
        const isAdjacent = Math.abs(targetIdx - curIdx) <= 1;
        const curSlideEl = $("#gCurSlide", track.parentElement);
        if (curSlideEl) curSlideEl.textContent = targetIdx + 1;
        // Use "auto" (instant) for non-adjacent jumps so the scroll doesn't
        // visually crawl through every intermediate slide.
        targetSlide.scrollIntoView({ behavior: (reduceMotion || !isAdjacent) ? "auto" : "smooth", inline: "start", block: "nearest" });
      }
    }

    const target = $(`[data-fid="color:${cId}"]`);
    target?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", inline: "center", block: "nearest" });
  },
  gprev() {
    const track = $("#galleryTrack");
    if (!track) return;
    const slides = Array.from(track.children);
    if (!slides.length) return;
    const curIdx = getCurrentSlideIndex(track, slides);
    // Wrap around: going left from slide 0 jumps to the last slide
    const targetIdx = (curIdx - 1 + slides.length) % slides.length;
    const curSlideEl = $("#gCurSlide", track.parentElement);
    if (curSlideEl) curSlideEl.textContent = targetIdx + 1;
    slides[targetIdx]?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", inline: "start", block: "nearest" });
  },
  gnext() {
    const track = $("#galleryTrack");
    if (!track) return;
    const slides = Array.from(track.children);
    if (!slides.length) return;
    const curIdx = getCurrentSlideIndex(track, slides);
    // Wrap around: going right from the last slide jumps back to slide 0
    const targetIdx = (curIdx + 1) % slides.length;
    const curSlideEl = $("#gCurSlide", track.parentElement);
    if (curSlideEl) curSlideEl.textContent = targetIdx + 1;
    slides[targetIdx]?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", inline: "start", block: "nearest" });
  },
  zoom(el) {
    const f = currentFlower();
    if (!f) return;
    const cId = el?.dataset?.c || S.sel[f.id];
    const color = (cId ? f.colors.find((c) => c.id === cId) : null) || selectedColor(f);
    const pIdx = el && el.dataset.i !== undefined ? Number(el.dataset.i) : (S.photo || 0);
    lightbox(lbItems(color), pIdx, photoLabels());
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
  if (!isDesktop.matches && searchOverlay?.classList.contains("open")) closeSearch(false);
  if (location.hash === hash) render({ animate: true });
  else location.hash = hash;
}

/* ---------- Events ---------- */
document.querySelector(".skip-link")?.addEventListener("click", (e) => {
  e.currentTarget.blur();
});

document.addEventListener("click", (e) => {
  const navLink = e.target.closest('a[href^="#/"]');
  if (navLink) {
    navFwd = !navLink.classList.contains("back");
    if (!isDesktop.matches && searchOverlay?.classList.contains("open")) {
      closeSearch(false);
    }
  }
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
  scrollMem.set(routeKey(prevHash), window.scrollY);
  const fwd = navFwd;
  navFwd = false;
  prevHash = location.hash;
  if (!isDesktop.matches && searchOverlay?.classList.contains("open")) {
    closeSearch(false);
  }
  render({ animate: true });
  window.scrollTo(0, fwd ? 0 : scrollMem.get(routeKey(location.hash)) || 0);
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

// Header gets a soft shadow once the page scrolls, and back-to-top floating button appears.
const backTopBtn = $("#backTop");
let ticking = false;
window.addEventListener("scroll", () => {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    const sy = window.scrollY;
    $("#top").classList.toggle("scrolled", sy > 6);
    if (backTopBtn) {
      const show = sy > 380;
      const was = backTopBtn.classList.contains("show");
      if (show !== was) {
        backTopBtn.classList.toggle("show", show);
        backTopBtn.tabIndex = show ? 0 : -1;
      }
    }
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
function closeSearch(focusBtn = true) {
  searchOverlay.classList.remove("open");
  if (!isDesktop.matches) {
    searchOverlay.setAttribute("aria-hidden", "true");
  }
  searchBtnEl.setAttribute("aria-expanded", "false");
  if (focusBtn) searchBtnEl.focus();
  else qInputEl.blur();
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
    await loadCatalog();
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
