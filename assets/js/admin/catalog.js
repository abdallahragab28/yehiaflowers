import { api, uploadFile, removeFiles } from "./db.js";
import { A, bus, loadCatalog, catById, flowerById, colorCount, photoCount } from "./state.js";
import { prepare } from "./images.js";
import { pickFocus } from "./focal.js";
import { t } from "./strings.js";
import { $, $$, esc, normSearch, slugify, nf } from "../shared/util.js";
import { unit, nameOf, altOf } from "../shared/i18n.js";
import { photoUrl, thumbPath } from "../shared/api.js";
import { icon } from "../shared/icons.js";
import { toast, openDialog, confirmDialog } from "../shared/ui.js";

export const PRESETS = {
  red: ["Red", "أحمر", "#B3202F"], pink: ["Pink", "وردي", "#E58DA6"], white: ["White", "أبيض", "#F7F5F0"],
  yellow: ["Yellow", "أصفر", "#E8C23A"], orange: ["Orange", "برتقالي", "#E8803A"], purple: ["Purple", "بنفسجي", "#8E5BB5"],
  blue: ["Blue", "أزرق", "#5B86C9"], green: ["Green", "أخضر", "#3E8E5A"], mauve: ["Mauve", "موف", "#7341a3"],
};

const C = { tab: "flowers", cat: "all", q: "" };
let dlg = null;
let editingId = null;

const cover = (f) => f.colors.flatMap((c) => c.photos || []).find(Boolean);
const pos = (p) => `object-position:${p.focus_x ?? 50}% ${p.focus_y ?? 50}%`;
const coverHex = (f) => f.colors[0]?.hex || "#9DB0A5";

/* ---------- List ---------- */
function flowerRows() {
  const q = normSearch(C.q);
  const list = A.flowers.filter((f) =>
    (C.cat === "all" || f.category_id === C.cat) &&
    (!q || normSearch(`${f.name_en} ${f.name_ar}`).includes(q)));
  if (!list.length) return `<div class="empty">${icon("layers", 36)}<h2>${t("noFlowers")}</h2><p>${t("noFlowersSub")}</p></div>`;
  const groups = A.cats.map((c) => [c, list.filter((f) => f.category_id === c.id)]).filter(([, l]) => l.length);
  return groups.map(([c, l]) => `<section class="c-group"><h2 class="c-group-h">${esc(nameOf(c))} <span class="muted">${l.length}</span></h2>
    <div class="c-list">${l.map((f) => {
    const p = cover(f);
    return `<button type="button" class="c-row" data-act="editFlower" data-id="${f.id}">
        <span class="c-thumb">${p ? `<img src="${esc(photoUrl(p.path, "thumb"))}" data-full="${esc(photoUrl(p.path))}" alt="" style="${pos(p)}" loading="lazy" decoding="async">` : `<span class="ph" style="--c:${esc(coverHex(f))}">${icon("leaf", 22)}</span>`}</span>
        <span class="c-main"><b>${esc(nameOf(f))}</b><span class="muted">${esc(altOf(f))}</span>
          <span class="c-meta">${esc(unit(colorCount(f), "color"))} · ${nf(photoCount(f))} ${t("photos")} · ${nf(f.stems_per_pack)} ${t("stemsPack")}</span></span>
        <span class="c-end">${f.is_active ? "" : `<span class="badge badge-muted">${t("hidden")}</span>`}${icon("chevronRight", 18, "flip")}</span></button>`;
  }).join("")}</div></section>`).join("");
}

function categoryRows() {
  if (!A.cats.length) return `<div class="empty">${icon("layers", 36)}<h2>${t("noCats")}</h2></div>`;
  return `<div class="c-list">${A.cats.map((c) => `<button type="button" class="c-row" data-act="editCat" data-id="${c.id}">
    <span class="c-main"><b>${esc(nameOf(c))}</b><span class="muted">${esc(altOf(c))} · ${esc(unit(A.flowers.filter((f) => f.category_id === c.id).length, "type"))}</span></span>
    <span class="c-end">${c.is_active ? "" : `<span class="badge badge-muted">${t("hidden")}</span>`}${icon("chevronRight", 18, "flip")}</span></button>`).join("")}</div>`;
}

export function catalogHtml() {
  const empty = !A.cats.length && !A.flowers.length;
  return `<div class="a-page"><div class="a-head"><div><h1>${t("catalog")}</h1><p class="muted">${t("catalogSub")}</p></div>
      <button class="btn btn-primary" data-act="${C.tab === "flowers" ? "newFlower" : "newCat"}">${icon("plus", 18)} ${t(C.tab === "flowers" ? "addFlower" : "addCat")}</button></div>
    <div class="seg seg-text" role="group"><button data-act="ctab" data-tab="flowers" aria-pressed="${C.tab === "flowers"}">${t("flowers")}</button><button data-act="ctab" data-tab="cats" aria-pressed="${C.tab === "cats"}">${t("categories")}</button></div>
    ${empty ? `<div class="empty">${icon("layers", 40)}<h2>${t("catalogEmpty")}</h2><p>${t("catalogEmptySub")}</p><button class="btn btn-primary" data-act="seed">${t("seed")}</button></div>`
      : C.tab === "flowers"
        ? `<div class="a-tools"><div class="search-box">${icon("search", 18)}<input id="cq" class="input" type="search" placeholder="${esc(t("searchFlowers"))}" value="${esc(C.q)}" aria-label="${esc(t("searchFlowers"))}"></div>
         <select class="input" data-act-change="ccat" aria-label="${esc(t("category"))}"><option value="all">${t("allCats")}</option>${A.cats.map((c) => `<option value="${c.id}" ${C.cat === c.id ? "selected" : ""}>${esc(nameOf(c))}</option>`).join("")}</select></div>
         <div id="flowerRows">${flowerRows()}</div>`
        : categoryRows()}</div>`;
}

export function bindCatalog(root) {
  $("#cq", root)?.addEventListener("input", (e) => { C.q = e.target.value; $("#flowerRows", root).innerHTML = flowerRows(); });
  $$("[data-act-change='ccat']", root).forEach((s) => s.addEventListener("change", () => { C.cat = s.value; bus.render(); }));
}

/* ---------- Flower editor ---------- */
const sel = (id, cats, value) => `<select id="${id}" class="input" required>${cats.map((c) => `<option value="${c.id}" ${c.id === value ? "selected" : ""}>${esc(nameOf(c))}</option>`).join("")}</select>`;

function photoTile(c, p, i, n) {
  return `<div class="ph-tile"><img src="${esc(photoUrl(p.path, "thumb"))}" data-full="${esc(photoUrl(p.path))}" alt="" style="${pos(p)}" loading="lazy">
    <button type="button" class="ph-crop" data-act="phCrop" data-id="${p.id}" data-c="${c.id}" aria-label="${esc(t("adjustCrop"))}">${icon("crop", 16)}</button>
    ${i === 0 ? `<span class="cover-tag">${t("cover")}</span>` : ""}
    <div class="ph-ctrl">
      ${i > 0 ? `<button type="button" data-act="phMove" data-id="${p.id}" data-c="${c.id}" data-d="-1" aria-label="${esc(t("moveEarlier"))}">${icon("chevronLeft", 16, "flip")}</button>` : ""}
      ${i < n - 1 ? `<button type="button" data-act="phMove" data-id="${p.id}" data-c="${c.id}" data-d="1" aria-label="${esc(t("moveLater"))}">${icon("chevronRight", 16, "flip")}</button>` : ""}
      ${i > 0 ? `<button type="button" data-act="phCover" data-id="${p.id}" data-c="${c.id}" aria-label="${esc(t("makeCover"))}">${icon("star", 16)}</button>` : ""}
      <button type="button" data-act="phDel" data-id="${p.id}" data-c="${c.id}" aria-label="${esc(t("deletePhoto"))}">${icon("trash", 16)}</button></div></div>`;
}

function colorBlock(c) {
  const photos = c.photos || [];
  return `<section class="col-ed" data-color="${c.id}">
    <div class="col-top"><input type="color" class="hexpick" value="${esc(c.hex)}" data-cf="hex" aria-label="${esc(t("colorCode"))}">
      <input class="input" data-cf="name_en" value="${esc(c.name_en)}" placeholder="${esc(t("nameEn"))}" aria-label="${esc(t("nameEn"))}">
      <input class="input" data-cf="name_ar" value="${esc(c.name_ar)}" dir="rtl" placeholder="${esc(t("nameAr"))}" aria-label="${esc(t("nameAr"))}"></div>
    <div class="col-row"><label class="switch"><input type="checkbox" data-cf="in_stock" ${c.in_stock ? "checked" : ""}><span class="track"></span><span>${t("inStock")}</span></label>
      <button type="button" class="btn btn-ghost btn-sm danger-text" data-act="delColor" data-c="${c.id}">${icon("trash", 16)} ${t("deleteColor")}</button></div>
    <div class="photos">${photos.map((p, i) => photoTile(c, p, i, photos.length)).join("")}
      <label class="ph-add">${icon("upload", 20)}<span>${t("addPhotos")}</span><input type="file" accept="image/*" multiple hidden data-upload="${c.id}"></label></div></section>`;
}

function flowerDialogHtml(f) {
  const isNew = !f.id;
  const bunches = f.stems_per_bunch ? Math.round((f.stems_per_pack || 0) / f.stems_per_bunch) : 0;
  return `<div class="drawer"><header class="drawer-h"><div><p class="muted">${t(isNew ? "newFlower" : "editFlower")}</p><h2>${esc(isNew ? t("addFlower") : nameOf(f))}</h2></div>
      <button class="icon-btn" data-act="closeDrawer" aria-label="${esc(t("close"))}">${icon("x", 22)}</button></header>
    <div class="drawer-b">
      <form id="flowerForm" class="stack" novalidate>
        <div class="field"><label for="ff-cat">${t("category")}</label>${sel("ff-cat", A.cats, f.category_id)}</div>
        <div class="two"><div class="field"><label for="ff-en">${t("nameEn")}</label><input id="ff-en" class="input" value="${esc(f.name_en || "")}" required maxlength="80"></div>
          <div class="field"><label for="ff-ar">${t("nameAr")}</label><input id="ff-ar" class="input" dir="rtl" value="${esc(f.name_ar || "")}" required maxlength="80"></div></div>
        <div class="two"><div class="field"><label for="ff-pack">${t("stemsPerPack")}</label><input id="ff-pack" class="input" type="number" min="1" max="5000" inputmode="numeric" value="${f.stems_per_pack ?? 160}"></div>
          <div class="field"><label for="ff-bunch">${t("stemsPerBunch")}</label><input id="ff-bunch" class="input" type="number" min="1" max="500" inputmode="numeric" value="${f.stems_per_bunch ?? 10}"></div></div>
        <p class="hint" id="ff-calc">${t("packCalc", { n: nf(bunches) })}</p>
        <div class="two"><div class="field"><label for="ff-sort">${t("sortOrder")}</label><input id="ff-sort" class="input" type="number" inputmode="numeric" value="${f.sort ?? 0}"></div>
          <div class="field"><span class="label">${t("visibility")}</span><label class="switch"><input id="ff-active" type="checkbox" ${f.is_active === false ? "" : "checked"}><span class="track"></span><span>${t("visible")}</span></label></div></div>
        <button class="btn btn-primary btn-block" type="submit">${t(isNew ? "createFlower" : "saveChanges")}</button></form>
      ${isNew ? `<p class="hint center">${t("colorsAfter")}</p>` : `
      <section class="stack"><h3>${t("colors")} <span class="muted">(${colorCount(f)})</span></h3>
        ${f.colors.map(colorBlock).join("")}
        <div class="presets" role="group" aria-label="${esc(t("addColor"))}"><span class="label">${t("addColor")}</span><div class="preset-row">
          ${Object.entries(PRESETS).map(([k, [en, ar, hex]]) => `<button type="button" class="preset" data-act="addColor" data-k="${k}"><i class="sw" style="--c:${hex}"></i>${esc(nameOf({ name_en: en, name_ar: ar }))}</button>`).join("")}
          <button type="button" class="preset" data-act="addColor" data-k="custom">${icon("plus", 14)} ${t("custom")}</button></div></div></section>
      <button class="btn btn-ghost btn-block danger-text" data-act="delFlower">${icon("trash", 16)} ${t("deleteFlower")}</button>`}
    </div></div>`;
}

const readFlowerForm = () => ({
  category_id: $("#ff-cat", dlg).value,
  name_en: $("#ff-en", dlg).value.trim(),
  name_ar: $("#ff-ar", dlg).value.trim(),
  stems_per_pack: Math.round(Number($("#ff-pack", dlg).value)),
  stems_per_bunch: Math.round(Number($("#ff-bunch", dlg).value)),
  sort: Math.round(Number($("#ff-sort", dlg).value) || 0),
  is_active: $("#ff-active", dlg).checked,
});

function mountFlower(f) {
  if (dlg?.open) { const sc = $(".drawer-b", dlg)?.scrollTop || 0; dlg.innerHTML = flowerDialogHtml(f); $(".drawer-b", dlg).scrollTop = sc; return; }
  dlg = openDialog({ className: "dlg-drawer", label: nameOf(f) || t("addFlower"), html: flowerDialogHtml(f), onClose: () => { dlg = null; editingId = null; bus.render(); } });
  dlg.addEventListener("submit", onFlowerSubmit);
  dlg.addEventListener("input", (e) => {
    if (e.target.id === "ff-pack" || e.target.id === "ff-bunch") {
      const p = Number($("#ff-pack", dlg).value), b = Number($("#ff-bunch", dlg).value);
      $("#ff-calc", dlg).textContent = t("packCalc", { n: nf(b > 0 ? Math.round(p / b) : 0) });
    }
  });
  dlg.addEventListener("change", onColorChange);
}

async function onFlowerSubmit(e) {
  if (e.target.id !== "flowerForm") return;
  e.preventDefault();
  const body = readFlowerForm();
  if (!body.name_en || !body.name_ar || !body.category_id || !(body.stems_per_pack > 0) || !(body.stems_per_bunch > 0)) {
    toast(t("fillRequired"), { type: "error" });
    return;
  }
  const btn = $("button[type=submit]", e.target);
  btn.disabled = true;
  try {
    if (editingId) {
      await api(`flowers?id=eq.${editingId}`, { method: "PATCH", body });
      Object.assign(flowerById(editingId), body);
      toast(t("saved"));
      mountFlower(flowerById(editingId));
    } else {
      let slug = slugify(body.name_en), n = 2;
      while (A.flowers.some((f) => f.slug === slug)) slug = `${slugify(body.name_en)}-${n++}`;
      const [row] = await api("flowers", { method: "POST", body: { ...body, slug }, prefer: "return=representation" });
      row.colors = [];
      A.flowers.push(row);
      editingId = row.id;
      toast(t("flowerCreated"));
      mountFlower(row);
    }
  } catch (err) { toast(err.message, { type: "error" }); btn.disabled = false; }
}

async function onColorChange(e) {
  const key = e.target.dataset.cf;
  if (!key) return;
  const block = e.target.closest("[data-color]");
  const color = flowerById(editingId)?.colors.find((c) => c.id === block.dataset.color);
  if (!color) return;
  const value = key === "in_stock" ? e.target.checked : e.target.value.trim();
  if ((key === "name_en" || key === "name_ar") && !value) { e.target.value = color[key]; return; }
  try {
    await api(`colors?id=eq.${color.id}`, { method: "PATCH", body: { [key]: value } });
    color[key] = value;
    toast(t("saved"), { ms: 1500 });
  } catch (err) { toast(err.message, { type: "error" }); }
}

async function cropPhoto(colorId, photoId) {
  const c = flowerById(editingId)?.colors.find((x) => x.id === colorId);
  const p = c?.photos.find((x) => x.id === photoId);
  if (!p) return;
  const r = await pickFocus({
    src: photoUrl(p.path), x: p.focus_x ?? 50, y: p.focus_y ?? 50, title: t("cropTitle"),
    frames: [["frameCard", "4 / 5"], ["frameSquare", "1 / 1"]],
  });
  if (!r) return;
  try {
    await api(`photos?id=eq.${p.id}`, { method: "PATCH", body: { focus_x: r.x, focus_y: r.y } });
    p.focus_x = r.x;
    p.focus_y = r.y;
    toast(t("saved"), { ms: 1500 });
    if (dlg?.isConnected) mountFlower(flowerById(editingId));
  } catch (err) { toast(err.message, { type: "error" }); }
}

async function renumber(color) {
  await Promise.all(color.photos.map((p, i) => (p.sort === i ? null : api(`photos?id=eq.${p.id}`, { method: "PATCH", body: { sort: i } }).then(() => { p.sort = i; }))));
}

async function uploadPhotos(colorId, files) {
  const f = flowerById(editingId);
  const color = f?.colors.find((c) => c.id === colorId);
  if (!color) return;
  let done = 0;
  for (const file of files) {
    const stop = toast(t("uploading", { a: done + 1, b: files.length }), { ms: 60000 });
    try {
      const prep = await prepare(file);
      const base = `${f.slug}/${color.id}/${prep.id}`;
      const path = `${base}.${prep.ext}`;
      await uploadFile(path, prep.full.blob);
      await uploadFile(thumbPath(path), prep.thumb.blob);
      const [row] = await api("photos", { method: "POST", body: { color_id: color.id, path, sort: color.photos.length }, prefer: "return=representation" });
      color.photos.push(row);
      done++;
    } catch (err) {
      toast(`${file.name}: ${err.message}`, { type: "error", ms: 7000 });
    }
    stop();
    mountFlower(f);
  }
  if (done) toast(t("photosAdded", { n: done }));
  if (done === 1 && files.length === 1) cropPhoto(color.id, color.photos.at(-1).id); // one photo: let the owner choose the visible area right away
}

export const catalogActions = {
  ctab: (el) => { C.tab = el.dataset.tab; bus.render(); },
  newFlower: () => {
    if (!A.cats.length) return toast(t("needCat"), { type: "error" });
    editingId = null;
    mountFlower({ category_id: C.cat !== "all" ? C.cat : A.cats[0].id, colors: [] });
  },
  editFlower: (el) => { editingId = el.dataset.id; mountFlower(flowerById(editingId)); },
  async delFlower() {
    const f = flowerById(editingId);
    if (!f || !await confirmDialog({ title: t("deleteFlower"), message: t("deleteFlowerSure", { name: nameOf(f) }), confirmLabel: t("delete"), cancelLabel: t("cancel"), danger: true })) return;
    try {
      const paths = f.colors.flatMap((c) => (c.photos || []).flatMap((p) => [p.path, thumbPath(p.path)]));
      await api(`flowers?id=eq.${f.id}`, { method: "DELETE" });
      await removeFiles(paths);
      A.flowers = A.flowers.filter((x) => x.id !== f.id);
      dlg?.close();
      toast(t("deleted"));
    } catch (err) { toast(err.message, { type: "error" }); }
  },
  async addColor(el) {
    const f = flowerById(editingId);
    if (!f) return;
    const [en, ar, hex] = PRESETS[el.dataset.k] || ["", "", "#E58DA6"];
    try {
      const [row] = await api("colors", {
        method: "POST", prefer: "return=representation",
        body: { flower_id: f.id, name_en: en || "New color", name_ar: ar || "لون جديد", hex, in_stock: true, sort: f.colors.length }
      });
      row.photos = [];
      f.colors.push(row);
      mountFlower(f);
      if (!en) $(`[data-color="${row.id}"] [data-cf="name_en"]`, dlg)?.select();
    } catch (err) { toast(err.message, { type: "error" }); }
  },
  async delColor(el) {
    const f = flowerById(editingId);
    const c = f?.colors.find((x) => x.id === el.dataset.c);
    if (!c || !await confirmDialog({ title: t("deleteColor"), message: t("deleteColorSure", { name: nameOf(c) }), confirmLabel: t("delete"), cancelLabel: t("cancel"), danger: true })) return;
    try {
      const paths = (c.photos || []).flatMap((p) => [p.path, thumbPath(p.path)]);
      await api(`colors?id=eq.${c.id}`, { method: "DELETE" });
      await removeFiles(paths);
      f.colors = f.colors.filter((x) => x.id !== c.id);
      mountFlower(f);
    } catch (err) { toast(err.message, { type: "error" }); }
  },
  phCrop: (el) => cropPhoto(el.dataset.c, el.dataset.id),
  async phDel(el) {
    const c = flowerById(editingId)?.colors.find((x) => x.id === el.dataset.c);
    const p = c?.photos.find((x) => x.id === el.dataset.id);
    if (!p || !await confirmDialog({ title: t("deletePhoto"), message: t("deletePhotoSure"), confirmLabel: t("delete"), cancelLabel: t("cancel"), danger: true })) return;
    try {
      await api(`photos?id=eq.${p.id}`, { method: "DELETE" });
      await removeFiles([p.path, thumbPath(p.path)]);
      c.photos = c.photos.filter((x) => x.id !== p.id);
      await renumber(c);
      mountFlower(flowerById(editingId));
    } catch (err) { toast(err.message, { type: "error" }); }
  },
  async phMove(el) {
    const c = flowerById(editingId)?.colors.find((x) => x.id === el.dataset.c);
    if (!c) return;
    const i = c.photos.findIndex((x) => x.id === el.dataset.id), j = i + Number(el.dataset.d);
    if (j < 0 || j >= c.photos.length) return;
    [c.photos[i], c.photos[j]] = [c.photos[j], c.photos[i]];
    mountFlower(flowerById(editingId));
    try { await renumber(c); } catch (err) { toast(err.message, { type: "error" }); }
  },
  async phCover(el) {
    const c = flowerById(editingId)?.colors.find((x) => x.id === el.dataset.c);
    if (!c) return;
    const i = c.photos.findIndex((x) => x.id === el.dataset.id);
    c.photos.unshift(...c.photos.splice(i, 1));
    mountFlower(flowerById(editingId));
    try { await renumber(c); } catch (err) { toast(err.message, { type: "error" }); }
  },
  async newCat() { editCategory(null); },
  editCat: (el) => editCategory(catById(el.dataset.id)),
  async seed() {
    try {
      toast(t("seeding"), { ms: 8000 });
      await seedCatalog();
      await loadCatalog();
      bus.render();
      toast(t("seeded"));
    } catch (err) { toast(err.message, { type: "error" }); }
  },
};

document.addEventListener("change", (e) => {
  const id = e.target.dataset?.upload;
  if (id && e.target.files?.length) { uploadPhotos(id, [...e.target.files]); e.target.value = ""; }
});

/* ---------- Category editor ---------- */
function editCategory(c) {
  const isNew = !c;
  const d = openDialog({
    className: "dlg-sm", label: t(isNew ? "addCat" : "editCat"), html: `<form class="dlg-body" id="catForm" novalidate>
    <h2>${t(isNew ? "addCat" : "editCat")}</h2>
    <div class="field"><label for="cf-en">${t("nameEn")}</label><input id="cf-en" class="input" value="${esc(c?.name_en || "")}" required maxlength="60"></div>
    <div class="field"><label for="cf-ar">${t("nameAr")}</label><input id="cf-ar" class="input" dir="rtl" value="${esc(c?.name_ar || "")}" required maxlength="60"></div>
    <div class="two"><div class="field"><label for="cf-sort">${t("sortOrder")}</label><input id="cf-sort" class="input" type="number" inputmode="numeric" value="${c?.sort ?? A.cats.length}"></div>
      <div class="field"><span class="label">${t("visibility")}</span><label class="switch"><input id="cf-active" type="checkbox" ${c?.is_active === false ? "" : "checked"}><span class="track"></span><span>${t("visible")}</span></label></div></div>
    <div class="dlg-actions">${isNew ? "" : `<button type="button" class="btn btn-ghost danger-text" id="cf-del">${t("delete")}</button>`}<button type="button" class="btn btn-ghost" id="cf-cancel">${t("cancel")}</button><button class="btn btn-primary" type="submit">${t("save")}</button></div></form>`
  });
  $("#cf-cancel", d).addEventListener("click", () => d.close());
  $("#cf-del", d)?.addEventListener("click", async () => {
    const n = A.flowers.filter((f) => f.category_id === c.id).length;
    if (!await confirmDialog({ title: t("delete"), message: t("deleteCatSure", { n }), confirmLabel: t("delete"), cancelLabel: t("cancel"), danger: true })) return;
    try { await api(`categories?id=eq.${c.id}`, { method: "DELETE" }); await loadCatalog(); d.close(); bus.render(); } catch (err) { toast(err.message, { type: "error" }); }
  });
  $("#catForm", d).addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = { name_en: $("#cf-en", d).value.trim(), name_ar: $("#cf-ar", d).value.trim(), sort: Math.round(Number($("#cf-sort", d).value) || 0), is_active: $("#cf-active", d).checked };
    if (!body.name_en || !body.name_ar) return toast(t("fillRequired"), { type: "error" });
    try {
      if (isNew) {
        let slug = slugify(body.name_en), n = 2;
        while (A.cats.some((x) => x.slug === slug)) slug = `${slugify(body.name_en)}-${n++}`;
        await api("categories", { method: "POST", body: { ...body, slug } });
      } else await api(`categories?id=eq.${c.id}`, { method: "PATCH", body });
      await loadCatalog();
      d.close();
      bus.render();
      toast(t("saved"));
    } catch (err) { toast(err.message, { type: "error" }); }
  });
}

/* ---------- Starter catalog ---------- */
const SEED = {
  cats: [["focal", "Focal Flowers", "زهور رئيسية"], ["filler", "Filler Flowers", "زهور تكميلية"], ["seasonal", "Seasonal", "زهور موسمية"], ["foliage", "Foliage", "ورقيات"]],
  flowers: [
    ["focal", "Roses", "ورد", ["red", "pink", "white", "yellow", "orange"]], ["focal", "Lisianthus", "ليزيانثس", ["purple", "white", "pink", "blue"]],
    ["focal", "Carnations", "قرنفل", ["red", "pink", "white", "yellow", "orange"]], ["focal", "Sunflowers", "عباد الشمس", ["yellow", "orange"]],
    ["focal", "Chrysanthemum", "أقحوان", ["white", "yellow", "pink", "purple"]], ["filler", "Gypsophila", "جبسوفيلا", ["white", "pink"]],
    ["filler", "Statice", "ستاتيس", ["purple", "white", "yellow", "blue"]], ["filler", "Waxflower", "زهرة الشمع", ["white", "pink"]],
    ["seasonal", "Snapdragons", "حلق السبع", ["red", "pink", "white", "yellow"]], ["seasonal", "Stock", "منثور", ["white", "pink", "purple"]],
    ["seasonal", "Daisies", "ديزي", ["white", "yellow"]], ["foliage", "Eucalyptus", "أوكالبتوس", ["green"]],
    ["foliage", "Ruscus", "روسكس", ["green"]], ["foliage", "Fern", "سرخس", ["green"]],
  ],
};

async function seedCatalog() {
  const cats = await api("categories?on_conflict=slug", {
    method: "POST", prefer: "return=representation,resolution=merge-duplicates",
    body: SEED.cats.map(([slug, en, ar], i) => ({ slug, name_en: en, name_ar: ar, sort: i }))
  });
  const catId = Object.fromEntries(cats.map((c) => [c.slug, c.id]));
  const flowers = await api("flowers?on_conflict=slug", {
    method: "POST", prefer: "return=representation,resolution=merge-duplicates",
    body: SEED.flowers.map(([cat, en, ar], i) => ({ category_id: catId[cat], slug: slugify(en), name_en: en, name_ar: ar, sort: i }))
  });
  const id = Object.fromEntries(flowers.map((f) => [f.slug, f.id]));
  const colors = SEED.flowers.flatMap(([, en, , list]) => list.map((k, j) => ({ flower_id: id[slugify(en)], name_en: PRESETS[k][0], name_ar: PRESETS[k][1], hex: PRESETS[k][2], sort: j })));
  await api("colors", { method: "POST", body: colors });
}
