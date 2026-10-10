import { CFG } from "../shared/config.js";
import { rest, loadSettings, orderLink } from "../shared/api.js";
import { store, clamp, normSearch, waDigits } from "../shared/util.js";
import { unit, nameOf, totals } from "../shared/i18n.js";

/** Everything the store needs to remember. Persisted keys are prefixed "yf.". */
export const S = {
  status: "loading", // loading | ready | error
  cats: [],
  flowers: [],
  hero: [], // photos chosen for the hero slider
  shopCat: "all", // category filter on the shop page
  colorBy: new Map(),
  flowerBy: new Map(),
  settings: {},
  cart: store.get("yf.cart", {}), // colorId -> number of packs
  orders: store.get("yf.orders", []), // last orders, newest first
  form: { name: "", ...store.get("yf.form", {}), note: "" },
  mode: store.get("yf.mode", "grid"),
  q: "",
  stockOnly: false,
  sel: {}, // flowerId -> selected colorId
  photo: 0, // selected photo index on the flower page
  errors: {},
  sending: false,
  lastWa: "", // WhatsApp link of the most recent order
};

/* ---------- Catalog ---------- */
const flowersQuery = (photoFields) =>
  "flowers?select=id,category_id,slug,name_en,name_ar,stems_per_pack,stems_per_bunch," +
  `colors(id,name_en,name_ar,hex,in_stock,sort,photos(${photoFields}))` +
  "&order=sort.asc,name_en.asc&colors.order=sort.asc,name_en.asc&colors.photos.order=sort.asc";
const CATS_NEW = "categories?select=id,slug,name_en,name_ar,cover_path,cover_focus_x,cover_focus_y&order=sort.asc,name_en.asc";
const CATS_OLD = "categories?select=id,slug,name_en,name_ar&order=sort.asc,name_en.asc";

async function fetchAll() {
  const settings = loadSettings().catch(() => ({}));
  try {
    return await Promise.all([
      rest(CATS_NEW), rest(flowersQuery("path,sort,focus_x,focus_y")),
      rest("hero_slides?select=path,focus_x,focus_y&order=sort.asc,created_at.asc").catch(() => []), settings,
    ]);
  } catch (err) {
    if (err.status !== 400) throw err;
    // The database has not been updated with the newest schema.sql yet: use the older, simpler shape.
    return Promise.all([rest(CATS_OLD), rest(flowersQuery("path,sort")), [], settings]);
  }
}

const focus = (x, y) => ({ x: Number.isFinite(x) ? x : 50, y: Number.isFinite(y) ? y : 50 });

export async function loadCatalog() {
  const [cats, flowers, hero, settings] = await fetchAll();

  const catById = new Map(cats.map((c) => [c.id, c]));
  S.flowers = flowers
    .filter((f) => f.colors?.length && catById.has(f.category_id))
    .map((f, i) => {
      const cat = catById.get(f.category_id);
      const flower = {
        ...f,
        i,
        cat,
        colors: f.colors.map((c, j) => ({
          ...c,
          j,
          photos: (c.photos || []).map((p) => ({ path: p.path, ...focus(p.focus_x, p.focus_y) })),
        })),
      };
      flower.colors.forEach((c) => (c.flower = flower));
      flower.search = normSearch(
        [f.name_en, f.name_ar, cat.name_en, cat.name_ar, ...flower.colors.flatMap((c) => [c.name_en, c.name_ar])].join(" ")
      );
      return flower;
    });
  S.cats = cats
    .filter((c) => S.flowers.some((f) => f.category_id === c.id))
    .map((c) => ({ ...c, cover: c.cover_path ? { path: c.cover_path, ...focus(c.cover_focus_x, c.cover_focus_y) } : null }));
  S.hero = hero.map((h) => ({ path: h.path, ...focus(h.focus_x, h.focus_y) }));
  S.flowerBy = new Map(S.flowers.map((f) => [f.id, f]));
  S.colorBy = new Map(S.flowers.flatMap((f) => f.colors.map((c) => [c.id, c])));
  S.settings = settings;
  if (S.shopCat !== "all" && !S.cats.some((c) => c.id === S.shopCat)) S.shopCat = "all";
  pruneCart();
  S.status = "ready";
}

export const flowersOf = (cat) => S.flowers.filter((f) => f.category_id === cat.id);
export const hasStock = (f) => f.colors.some((c) => c.in_stock);

/** Color whose photo represents the flower in lists. */
export function coverColor(f) {
  return f.colors.find((c) => c.in_stock && c.photos.length) || f.colors.find((c) => c.photos.length) || f.colors[0];
}

/** Photo shown on a category tile: the custom cover if one was uploaded, otherwise a flower photo. */
export function categoryCover(cat) {
  if (cat.cover) return { photo: cat.cover, hex: "#9DB0A5" };
  const list = flowersOf(cat);
  const f = list.find((x) => coverColor(x).photos.length) || list[0];
  const c = coverColor(f);
  return { photo: c.photos[0], hex: c.hex };
}

/** Photos for the hero slider: the owner's choice, or flower photos as a fallback. */
export function heroSlides() {
  if (S.hero.length) return S.hero;
  return S.flowers.map((f) => coverColor(f).photos[0]).filter(Boolean).slice(0, 5);
}

export function searchFlowers(q) {
  const words = normSearch(q).split(/\s+/).filter(Boolean);
  return words.length ? S.flowers.filter((f) => words.every((w) => f.search.includes(w))) : [];
}

/* ---------- Cart ---------- */
const persistCart = () => store.set("yf.cart", S.cart);

export const qty = (colorId) => S.cart[colorId] || 0;

export function setQty(colorId, n) {
  n = clamp(n, 0, 99);
  if (n) S.cart[colorId] = n;
  else delete S.cart[colorId];
  persistCart();
}

export function pruneCart() {
  let changed = false;
  for (const id of Object.keys(S.cart)) {
    const c = S.colorBy.get(id);
    if (!c || !c.in_stock) { delete S.cart[id]; changed = true; }
  }
  if (changed) persistCart();
  return changed;
}

export const clearCart = () => { S.cart = {}; persistCart(); };

export function cartLines() {
  return Object.entries(S.cart)
    .map(([id, packs]) => ({ color: S.colorBy.get(id), packs }))
    .filter((l) => l.color)
    .map((l) => ({
      ...l,
      flower: l.color.flower,
      stemsPerPack: l.color.flower.stems_per_pack,
      stemsPerBunch: l.color.flower.stems_per_bunch,
    }))
    .sort((a, b) => a.flower.i - b.flower.i || a.color.j - b.color.j);
}

export const cartTotals = () => totals(cartLines());
export const flowerQty = (f) => f.colors.reduce((s, c) => s + qty(c.id), 0);

/* ---------- Order history (for "Order again") ---------- */
export function recordOrder(lines, token) {
  const tt = totals(lines);
  S.orders = [
    {
      t: Date.now(),
      token: token || "",
      packs: tt.packs,
      items: Object.fromEntries(lines.map((l) => [l.color.id, l.packs])),
      lines: lines.map((l) => [l.flower.name_en, l.flower.name_ar, l.color.name_en, l.color.name_ar, l.packs]),
    },
    ...S.orders,
  ].slice(0, 5);
  store.set("yf.orders", S.orders);
}

/** Adds an old order's items to the cart. Returns how many were added and skipped. */
export function addFromOrder(rec) {
  let added = 0, skipped = 0;
  for (const [id, n] of Object.entries(rec.items || {})) {
    const c = S.colorBy.get(id);
    if (c && c.in_stock) { setQty(id, qty(id) + n); added++; }
    else skipped++;
  }
  return { added, skipped };
}

/* ---------- Customer form ---------- */
export function saveForm() {
  const { name } = S.form;
  store.set("yf.form", { name });
}

export function validateForm() {
  const errors = {};
  if (S.form.name.trim().length < 2) errors.name = "eName";
  S.errors = errors;
  return !Object.keys(errors).length;
}

/* ---------- WhatsApp message ---------- */
/** English header, then the order in Arabic and in English, then a link to the order page. */
export function buildMessage(lines, token, form = S.form) {
  const row = (l, lang) => `• ${nameOf(l.flower, lang)} – ${nameOf(l.color, lang)} × ${unit(l.packs, "pack", lang)}`;
  const tt = totals(lines);
  const sum = (lang) => `${unit(tt.packs, "pack", lang)} = ${unit(tt.stems, "stem", lang)} = ${unit(tt.bunches, "bunch", lang)}`;
  const out = ["New order", `Name: ${form.name.trim()}`];
  if (form.note?.trim()) out.push(`Note: ${form.note.trim()}`);
  out.push("", "— العربية —", ...lines.map((l) => row(l, "ar")), `الإجمالي: ${sum("ar")}`);
  out.push("", "— English —", ...lines.map((l) => row(l, "en")), `Total: ${sum("en")}`);
  if (token) out.push("", "Order with photos:", orderLink(token));
  return out.join("\n");
}

export function waUrl(message) {
  const num = waDigits(S.settings.whatsapp_number || CFG.whatsapp);
  return `https://wa.me/${num}?text=${encodeURIComponent(message)}`;
}

export const waNumberSet = () => !!waDigits(S.settings.whatsapp_number || CFG.whatsapp);
