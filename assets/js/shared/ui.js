import { $, esc } from "./util.js";
import { icon } from "./icons.js";

/* ---------- Toasts ---------- */
function toastHost() {
  let host = $("#toasts");
  if (!host) {
    host = document.createElement("div");
    host.id = "toasts";
    host.setAttribute("aria-live", "polite");
    document.body.appendChild(host);
  }
  return host;
}

/** Shows a short message. `action` = { label, onClick } adds a button (for example Undo). */
export function toast(message, { type = "info", action, ms = 4500 } = {}) {
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.innerHTML = `<span>${esc(message)}</span>`;
  if (action) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "toast-action";
    b.textContent = action.label;
    b.addEventListener("click", () => { action.onClick(); close(); });
    el.appendChild(b);
  }
  const close = () => {
    el.classList.add("out");
    setTimeout(() => el.remove(), 200);
  };
  toastHost().appendChild(el);
  requestAnimationFrame(() => el.classList.add("in"));
  setTimeout(close, ms);
  return close;
}

/* ---------- Dialogs (native <dialog>: focus trap, Escape and inert background for free) ---------- */
export function openDialog({ className = "", html, onClose, label = "" }) {
  const dlg = document.createElement("dialog");
  dlg.className = `dlg ${className}`;
  if (label) dlg.setAttribute("aria-label", label);
  dlg.innerHTML = html;
  document.body.appendChild(dlg);
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener("close", () => { onClose?.(); dlg.remove(); });
  dlg.showModal();
  return dlg;
}

export function confirmDialog({ title, message, confirmLabel, cancelLabel, danger = false }) {
  return new Promise((resolve) => {
    let result = false;
    const dlg = openDialog({
      className: "dlg-sm",
      label: title,
      html: `<form method="dialog" class="dlg-body">
        <h2>${esc(title)}</h2><p class="muted">${esc(message)}</p>
        <div class="dlg-actions"><button class="btn btn-ghost" value="no">${esc(cancelLabel)}</button>
        <button class="btn ${danger ? "btn-danger" : "btn-primary"}" value="yes">${esc(confirmLabel)}</button></div></form>`,
      onClose: () => resolve(result),
    });
    dlg.querySelector("form").addEventListener("submit", (e) => { result = e.submitter?.value === "yes"; });
  });
}

/* ---------- Photo lightbox ---------- */
/**
 * Full-screen photo viewer. items: [{ src, thumb, alt, caption }].
 * Keyboard arrows, swipe on touch screens, thumbnail strip, click outside the photo to close.
 */
export function lightbox(items, start = 0, labels = { close: "Close", prev: "Previous", next: "Next" }) {
  if (!items.length) return;
  let i = Math.min(Math.max(start, 0), items.length - 1);
  const many = items.length > 1;
  const dlg = openDialog({
    className: "dlg-light",
    label: items[i].caption || items[i].alt || "",
    html: `<div class="lb">
      <div class="lb-top"><div class="lb-title"><span class="lb-cap"></span><span class="lb-count" aria-live="polite"></span></div>
        <button type="button" class="lb-btn" data-lb="close" aria-label="${esc(labels.close)}">${icon("x", 22)}</button></div>
      <div class="lb-stage">
        ${many ? `<button type="button" class="lb-btn lb-nav lb-prev" data-lb="prev" aria-label="${esc(labels.prev)}">${icon("chevronLeft", 24, "flip")}</button>
        <button type="button" class="lb-btn lb-nav lb-next" data-lb="next" aria-label="${esc(labels.next)}">${icon("chevronRight", 24, "flip")}</button>` : ""}
        <img class="lb-img" alt="" draggable="false"></div>
      ${many ? `<div class="lb-thumbs" role="group">${items.map((it, n) => `<button type="button" class="lb-th" data-lb="go" data-i="${n}" aria-label="${n + 1}"><img src="${esc(it.thumb || it.src)}" alt="" loading="lazy"></button>`).join("")}</div>` : ""}
    </div>`,
  });
  const img = dlg.querySelector(".lb-img");
  const stage = dlg.querySelector(".lb-stage");
  const show = () => {
    const it = items[i];
    img.classList.remove("in");
    img.src = it.src;
    img.alt = it.alt || "";
    requestAnimationFrame(() => img.classList.add("in"));
    dlg.querySelector(".lb-cap").textContent = it.caption || it.alt || "";
    dlg.querySelector(".lb-count").textContent = many ? `${i + 1} / ${items.length}` : "";
    dlg.querySelectorAll(".lb-th").forEach((b, n) => {
      b.classList.toggle("on", n === i);
      b.setAttribute("aria-current", n === i ? "true" : "false");
      if (n === i) b.scrollIntoView?.({ block: "nearest", inline: "center" });
    });
  };
  const go = (d) => { i = (i + d + items.length) % items.length; show(); };
  dlg.addEventListener("click", (e) => {
    if (e.target === stage) return dlg.close(); // click on the dark area around the photo
    const b = e.target.closest("[data-lb]");
    if (!b) return;
    const act = b.dataset.lb;
    if (act === "close") dlg.close();
    else if (act === "go") { i = Number(b.dataset.i); show(); }
    else go(act === "next" ? 1 : -1);
  });
  dlg.addEventListener("keydown", (e) => {
    const rtl = document.documentElement.dir === "rtl";
    if (e.key === "ArrowRight") go(rtl ? -1 : 1);
    if (e.key === "ArrowLeft") go(rtl ? 1 : -1);
  });
  // Swipe left or right on touch screens.
  let x0 = null;
  stage.addEventListener("pointerdown", (e) => { x0 = e.clientX; });
  stage.addEventListener("pointerup", (e) => {
    if (x0 === null || !many) return;
    const dx = e.clientX - x0;
    x0 = null;
    if (Math.abs(dx) > 50) {
      const rtl = document.documentElement.dir === "rtl";
      go((dx < 0) !== rtl ? 1 : -1);
    }
  });
  show();
}

/* Fade images in when loaded, and fall back to the full-size file if a thumbnail is missing. */
document.addEventListener("load", (e) => {
  if (e.target.tagName === "IMG") e.target.classList.add("loaded");
}, true);
document.addEventListener("error", (e) => {
  const img = e.target;
  if (img.tagName === "IMG" && img.dataset.full && img.src !== img.dataset.full) img.src = img.dataset.full;
}, true);
