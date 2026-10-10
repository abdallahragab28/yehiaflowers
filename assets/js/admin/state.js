import { api } from "./db.js";
import { totals } from "../shared/i18n.js";
import { loadSettings } from "../shared/api.js";

/** In-memory admin data. Views read from here and call bus.render() after changes. */
export const A = {
  orders: [],
  orderLimit: 200,
  hasMore: false,
  ofilter: "all",
  oq: "",
  cats: [],
  flowers: [],
  hero: [],
  heroError: false, // true when the hero_slides table does not exist yet (schema not updated)
  catalogLoaded: false,
  settings: {},
  seen: new Set(), // order ids already known, to detect new arrivals
};
export const bus = { render() {}, refreshBadge() {} };

const ITEM_FIELDS = "order_items(id,color_id,flower_name_en,flower_name_ar,color_name_en,color_name_ar,color_hex,photo_path,stems_per_pack,stems_per_bunch,packs)";

export async function loadOrders() {
  const rows = await api(`orders?select=*,${ITEM_FIELDS}&order=created_at.desc&limit=${A.orderLimit}`);
  const fresh = A.seen.size ? rows.filter((o) => !A.seen.has(o.id)) : [];
  A.orders = rows;
  A.hasMore = rows.length >= A.orderLimit;
  rows.forEach((o) => A.seen.add(o.id));
  return fresh;
}

export async function loadCatalog() {
  const [cats, flowers] = await Promise.all([
    api("categories?select=*&order=sort.asc,name_en.asc"),
    api("flowers?select=*,colors(*,photos(*))&order=sort.asc,name_en.asc&colors.order=sort.asc,name_en.asc&colors.photos.order=sort.asc,created_at.asc"),
  ]);
  A.cats = cats;
  A.flowers = flowers;
  A.catalogLoaded = true;
}

export async function loadHero() {
  try {
    A.hero = await api("hero_slides?select=*&order=sort.asc,created_at.asc");
    A.heroError = false;
  } catch {
    A.hero = [];
    A.heroError = true;
  }
}

export async function loadAdminSettings() {
  A.settings = await loadSettings().catch(() => ({}));
}

export const orderLines = (o) => o.order_items.map((i) => ({ packs: i.packs, stemsPerPack: i.stems_per_pack, stemsPerBunch: i.stems_per_bunch }));
export const orderTotals = (o) => totals(orderLines(o));
export const newCount = () => A.orders.filter((o) => o.status === "new").length;
export const catById = (id) => A.cats.find((c) => c.id === id);
export const flowerById = (id) => A.flowers.find((f) => f.id === id);
export const colorCount = (f) => f.colors?.length || 0;
export const photoCount = (f) => (f.colors || []).reduce((s, c) => s + (c.photos?.length || 0), 0);
