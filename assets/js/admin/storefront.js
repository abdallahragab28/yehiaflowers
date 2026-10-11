import { api, uploadFile, removeFiles } from "./db.js";
import { A, bus, loadCatalog, loadHero } from "./state.js";
import { prepare } from "./images.js";
import { pickFocus } from "./focal.js";
import { t } from "./strings.js";
import { esc } from "../shared/util.js";
import { nameOf, altOf } from "../shared/i18n.js";
import { photoUrl, thumbPath } from "../shared/api.js";
import { icon } from "../shared/icons.js";
import { toast, confirmDialog } from "../shared/ui.js";

const pos = (o, x = "focus_x", y = "focus_y") => `object-position:${o[x] ?? 50}% ${o[y] ?? 50}%`;
const HERO_FRAMES = [["frameHeroWide", "16 / 9"], ["frameHeroPhone", "7 / 10"]];

/** First flower photo in a category: what the store shows when no custom cover is set. */
function autoCover(cat) {
  for (const f of A.flowers.filter((x) => x.category_id === cat.id)) {
    for (const c of f.colors || []) if (c.photos?.length) return c.photos[0];
  }
  return null;
}

/* ---------- Page ---------- */
function heroTile(s, i) {
  const n = A.hero.length;
  return `<li class="hero-tile ${s.is_active ? "" : "is-off"}">
    <div class="hero-img"><img src="${esc(photoUrl(s.path))}" alt="" style="${pos(s)}" loading="lazy" decoding="async"></div>
    ${s.is_active ? "" : `<span class="badge badge-muted tile-badge">${t("hidden")}</span>`}
    <span class="tile-num">${i + 1}</span>
    <div class="tile-ctrl">
      <button type="button" data-act="heroCrop" data-id="${s.id}" aria-label="${esc(t("adjustCrop"))}">${icon("crop", 16)}</button>
      <button type="button" data-act="heroToggle" data-id="${s.id}" aria-label="${esc(t(s.is_active ? "hide" : "show"))}">${icon(s.is_active ? "eye" : "eyeOff", 16)}</button>
      ${i > 0 ? `<button type="button" data-act="heroMove" data-id="${s.id}" data-d="-1" aria-label="${esc(t("moveEarlier"))}">${icon("chevronLeft", 16, "flip")}</button>` : ""}
      ${i < n - 1 ? `<button type="button" data-act="heroMove" data-id="${s.id}" data-d="1" aria-label="${esc(t("moveLater"))}">${icon("chevronRight", 16, "flip")}</button>` : ""}
      <button type="button" data-act="heroDel" data-id="${s.id}" aria-label="${esc(t("deleteSlide"))}">${icon("trash", 16)}</button></div></li>`;
}

function coverItem(c) {
  const custom = !!c.cover_path;
  const auto = autoCover(c);
  const img = custom
    ? `<img src="${esc(photoUrl(c.cover_path, "thumb"))}" data-full="${esc(photoUrl(c.cover_path))}" alt="" style="${pos(c, "cover_focus_x", "cover_focus_y")}">`
    : auto ? `<img src="${esc(photoUrl(auto.path, "thumb"))}" data-full="${esc(photoUrl(auto.path))}" alt="" style="${pos(auto)}">` : `<span class="ph">${icon("image", 24)}</span>`;
  return `<li class="cover-item"><div class="cover-img">${img}</div>
    <div class="cover-info"><b>${esc(nameOf(c))}</b><span class="muted">${esc(altOf(c))}</span>
      <span class="badge ${custom ? "" : "badge-muted"}">${t(custom ? "customCover" : "autoCover")}</span></div>
    <div class="cover-actions">
      <label class="btn btn-ghost btn-sm">${icon("upload", 16)} ${t("uploadCover")}<input type="file" accept="image/*" hidden data-cover-upload="${c.id}"></label>
      ${custom ? `<button type="button" class="btn btn-ghost btn-sm" data-act="coverCrop" data-id="${c.id}">${icon("crop", 16)} ${t("adjustCrop")}</button>
      <button type="button" class="btn btn-ghost btn-sm" data-act="coverClear" data-id="${c.id}">${t("useAuto")}</button>` : ""}</div></li>`;
}

export function storefrontHtml() {
  return `<div class="a-page"><div class="a-head"><div><h1>${t("storefront")}</h1><p class="muted">${t("storefrontSub")}</p></div></div>
    <section class="a-card pad stack"><div><h2>${icon("image", 20)} ${t("heroTitle")}</h2><p class="muted">${t("heroHelp")}</p></div>
      ${A.heroError ? `<p class="notice">${t("heroSetup")}</p>` : `
      ${A.hero.length ? `<ul class="hero-grid">${A.hero.map(heroTile).join("")}</ul>` : `<p class="muted">${t("heroEmpty")}</p>`}
      <label class="btn btn-primary">${icon("upload", 18)} ${t("addImages")}<input type="file" accept="image/*" multiple hidden data-hero-upload></label>`}</section>
    <section class="a-card pad stack"><div><h2>${icon("layers", 20)} ${t("coversTitle")}</h2><p class="muted">${t("coversHelp")}</p></div>
      ${A.cats.length ? `<ul class="cover-list">${A.cats.map(coverItem).join("")}</ul>` : `<p class="muted">${t("noCats")}</p>`}</section></div>`;
}

/* ---------- Hero slides ---------- */
const slide = (id) => A.hero.find((s) => s.id === id);

async function renumber() {
  await Promise.all(A.hero.map((s, i) => (s.sort === i ? null : api(`hero_slides?id=eq.${s.id}`, { method: "PATCH", body: { sort: i } }).then(() => { s.sort = i; }))));
}

async function cropSlide(id) {
  const s = slide(id);
  if (!s) return;
  const r = await pickFocus({ src: photoUrl(s.path), x: s.focus_x ?? 50, y: s.focus_y ?? 50, title: t("cropTitle"), frames: HERO_FRAMES });
  if (!r) return;
  try {
    await api(`hero_slides?id=eq.${s.id}`, { method: "PATCH", body: { focus_x: r.x, focus_y: r.y } });
    s.focus_x = r.x;
    s.focus_y = r.y;
    bus.render();
    toast(t("saved"), { ms: 1500 });
  } catch (err) { toast(err.message, { type: "error" }); }
}

async function addSlides(files) {
  let done = 0, last = null;
  for (const file of files) {
    const stop = toast(t("uploading", { a: done + 1, b: files.length }), { ms: 60000 });
    try {
      const prep = await prepare(file, { fullMax: 2400, quality: 0.88, thumb: false });
      const path = `hero/${prep.id}.${prep.ext}`;
      await uploadFile(path, prep.full.blob);
      const [row] = await api("hero_slides", { method: "POST", body: { path, sort: A.hero.length }, prefer: "return=representation" });
      A.hero.push(row);
      last = row;
      done++;
      bus.render();
    } catch (err) { toast(`${file.name}: ${err.message}`, { type: "error", ms: 7000 }); }
    stop();
  }
  if (done) toast(t("photosAdded", { n: done }));
  if (done === 1 && files.length === 1) cropSlide(last.id);
}

/* ---------- Category covers ---------- */
const cat = (id) => A.cats.find((c) => c.id === id);

async function cropCover(id) {
  const c = cat(id);
  if (!c?.cover_path) return;
  const r = await pickFocus({ src: photoUrl(c.cover_path), x: c.cover_focus_x ?? 50, y: c.cover_focus_y ?? 50, title: t("cropTitle"), frames: [["frameCover", "4 / 3"]] });
  if (!r) return;
  try {
    await api(`categories?id=eq.${c.id}`, { method: "PATCH", body: { cover_focus_x: r.x, cover_focus_y: r.y } });
    c.cover_focus_x = r.x;
    c.cover_focus_y = r.y;
    bus.render();
    toast(t("saved"), { ms: 1500 });
  } catch (err) { toast(err.message, { type: "error" }); }
}

async function setCover(id, file) {
  const c = cat(id);
  if (!c) return;
  const stop = toast(t("uploading", { a: 1, b: 1 }), { ms: 60000 });
  try {
    const prep = await prepare(file, { fullMax: 1400 });
    const path = `covers/${c.slug}/${prep.id}.${prep.ext}`;
    await uploadFile(path, prep.full.blob);
    await uploadFile(thumbPath(path), prep.thumb.blob);
    const old = c.cover_path;
    await api(`categories?id=eq.${c.id}`, { method: "PATCH", body: { cover_path: path, cover_focus_x: 50, cover_focus_y: 50 } });
    Object.assign(c, { cover_path: path, cover_focus_x: 50, cover_focus_y: 50 });
    if (old) removeFiles([old, thumbPath(old)]).catch(() => {});
    stop();
    bus.render();
    toast(t("coverSaved"));
    cropCover(id);
  } catch (err) { stop(); toast(`${file.name}: ${err.message}`, { type: "error", ms: 7000 }); }
}

export const storefrontActions = {
  heroCrop: (el) => cropSlide(el.dataset.id),
  async heroToggle(el) {
    const s = slide(el.dataset.id);
    if (!s) return;
    try {
      await api(`hero_slides?id=eq.${s.id}`, { method: "PATCH", body: { is_active: !s.is_active } });
      s.is_active = !s.is_active;
      bus.render();
    } catch (err) { toast(err.message, { type: "error" }); }
  },
  async heroMove(el) {
    const i = A.hero.findIndex((s) => s.id === el.dataset.id), j = i + Number(el.dataset.d);
    if (i < 0 || j < 0 || j >= A.hero.length) return;
    [A.hero[i], A.hero[j]] = [A.hero[j], A.hero[i]];
    bus.render();
    try { await renumber(); } catch (err) { toast(err.message, { type: "error" }); }
  },
  async heroDel(el) {
    const s = slide(el.dataset.id);
    if (!s || !await confirmDialog({ title: t("deleteSlide"), message: t("deleteSlideSure"), confirmLabel: t("delete"), cancelLabel: t("cancel"), danger: true })) return;
    try {
      await api(`hero_slides?id=eq.${s.id}`, { method: "DELETE" });
      await removeFiles([s.path]);
      A.hero = A.hero.filter((x) => x.id !== s.id);
      await renumber();
      bus.render();
    } catch (err) { toast(err.message, { type: "error" }); }
  },
  coverCrop: (el) => cropCover(el.dataset.id),
  async coverClear(el) {
    const c = cat(el.dataset.id);
    if (!c?.cover_path) return;
    try {
      const old = c.cover_path;
      await api(`categories?id=eq.${c.id}`, { method: "PATCH", body: { cover_path: null, cover_focus_x: 50, cover_focus_y: 50 } });
      c.cover_path = null;
      removeFiles([old, thumbPath(old)]).catch(() => {});
      bus.render();
      toast(t("saved"), { ms: 1500 });
    } catch (err) { toast(err.message, { type: "error" }); }
  },
};

document.addEventListener("change", (e) => {
  const el = e.target;
  if (el.dataset?.heroUpload !== undefined && el.files?.length) { addSlides([...el.files]); el.value = ""; }
  if (el.dataset?.coverUpload && el.files?.length) { setCover(el.dataset.coverUpload, el.files[0]); el.value = ""; }
});

export { loadCatalog, loadHero };
