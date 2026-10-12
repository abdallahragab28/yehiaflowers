import { prefs } from "./prefs.js";

export const isAr = () => prefs.lang === "ar";

/** Builds a translator from a dictionary of key -> [english, arabic]. Supports {name} placeholders. */
export const makeT = (dict) => (key, vars) => {
  const entry = dict[key];
  if (!entry) return key;
  const text = entry[isAr() ? 1 : 0];
  return vars ? text.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "") : text;
};

// Unit words: [english singular, english plural] and [arabic one, two, few (3-10), many (11+)].
const UNITS = {
  pack: [["pack", "packs"], ["كرتونة", "كرتونتان", "كراتين", "كرتونة"]],
  stem: [["stem", "stems"], ["حبة", "حبتان", "حبات", "حبة"]],
  bunch: [["bunch", "bunches"], ["حزمة", "حزمتان", "حزم", "حزمة"]],
  color: [["color", "colors"], ["لون", "لونان", "ألوان", "لون"]],
  type: [["variety", "varieties"], ["صنف", "صنفان", "أصناف", "صنف"]],
  item: [["item", "items"], ["صنف", "صنفان", "أصناف", "صنف"]],
};

/** "3 packs", "كرتونتان", "12 كرتون" - correct plural for the chosen language. */
export function unit(n, name, lang = prefs.lang) {
  const [en, ar] = UNITS[name];
  if (lang === "ar") {
    const word = n === 1 ? ar[0] : n === 2 ? ar[1] : n >= 3 && n <= 10 ? ar[2] : ar[3];
    return n === 2 ? word : `${n.toLocaleString("en-US")} ${word}`;
  }
  return `${n.toLocaleString("en-US")} ${n === 1 ? en[0] : en[1]}`;
}

export const nameOf = (o, lang = prefs.lang) => (lang === "ar" ? o.name_ar : o.name_en);
export const altOf = (o, lang = prefs.lang) => (lang === "ar" ? o.name_en : o.name_ar);

/** Totals for a list of { packs, stemsPerPack, stemsPerBunch } lines. */
export function totals(lines) {
  let packs = 0, stems = 0, bunches = 0;
  for (const l of lines) {
    const s = l.packs * l.stemsPerPack;
    packs += l.packs;
    stems += s;
    bunches += Math.round(s / (l.stemsPerBunch || 1));
  }
  return { packs, stems, bunches };
}

export const STATUSES = ["new", "quoted", "confirmed", "delivered", "cancelled"];
export const STATUS_LABEL = {
  new: ["New", "جديد"],
  quoted: ["Quoted", "تم التسعير"],
  confirmed: ["Confirmed", "مؤكد"],
  delivered: ["Delivered", "تم التسليم"],
  cancelled: ["Cancelled", "ملغي"],
};
export const statusLabel = (s, lang = prefs.lang) => (STATUS_LABEL[s] || [s, s])[lang === "ar" ? 1 : 0];
