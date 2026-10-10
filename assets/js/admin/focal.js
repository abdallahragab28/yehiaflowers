import { openDialog } from "../shared/ui.js";
import { $, $$, clamp } from "../shared/util.js";
import { icon } from "../shared/icons.js";
import { t } from "./strings.js";

/**
 * Lets the owner choose which part of a photo stays visible when it is cropped.
 * Drag (or use the arrow keys) on the photo to move the focus point; the previews show the real crops.
 * Resolves with { x, y } in percent (0-100), or null when cancelled.
 */
export function pickFocus({ src, x = 50, y = 50, title, frames = [["frameCard", "4 / 5"], ["frameSquare", "1 / 1"]] }) {
  return new Promise((resolve) => {
    let result = null;
    const pos = { x: Math.round(x), y: Math.round(y) };
    const dlg = openDialog({
      className: "dlg-focal",
      label: title,
      onClose: () => resolve(result),
      html: `<div class="dlg-body focal">
        <div class="focal-h"><h2>${title}</h2><button type="button" class="icon-btn" data-f="cancel" aria-label="${t("close")}">${icon("x", 22)}</button></div>
        <p class="muted">${t("focalHelp")}</p>
        <div class="focal-stage" tabindex="0" role="application" aria-label="${t("focalHelp")}"><img class="focal-img" src="${src}" alt="" draggable="false"><span class="focal-dot"></span></div>
        <div class="focal-frames">${frames.map(([k, ratio]) => `<figure><div class="focal-frame" style="aspect-ratio:${ratio}"><img src="${src}" alt=""></div><figcaption>${t(k)}</figcaption></figure>`).join("")}</div>
        <div class="dlg-actions"><button type="button" class="btn btn-ghost" data-f="reset">${t("focalReset")}</button><span class="grow"></span>
          <button type="button" class="btn btn-ghost" data-f="cancel">${t("cancel")}</button><button type="button" class="btn btn-primary" data-f="save">${t("save")}</button></div></div>`,
    });
    const stage = $(".focal-stage", dlg);
    const dot = $(".focal-dot", dlg);
    const previews = $$(".focal-frame img", dlg);
    const paint = () => {
      dot.style.left = `${pos.x}%`;
      dot.style.top = `${pos.y}%`;
      previews.forEach((img) => (img.style.objectPosition = `${pos.x}% ${pos.y}%`));
    };
    const fromPointer = (e) => {
      const r = $(".focal-img", dlg).getBoundingClientRect();
      pos.x = clamp(Math.round(((e.clientX - r.left) / r.width) * 100), 0, 100);
      pos.y = clamp(Math.round(((e.clientY - r.top) / r.height) * 100), 0, 100);
      paint();
    };
    let down = false;
    stage.addEventListener("pointerdown", (e) => { down = true; stage.setPointerCapture?.(e.pointerId); fromPointer(e); });
    stage.addEventListener("pointermove", (e) => { if (down) fromPointer(e); });
    stage.addEventListener("pointerup", () => { down = false; });
    stage.addEventListener("keydown", (e) => {
      const step = e.shiftKey ? 10 : 2;
      const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (!d) return;
      e.preventDefault();
      pos.x = clamp(pos.x + d[0], 0, 100);
      pos.y = clamp(pos.y + d[1], 0, 100);
      paint();
    });
    dlg.addEventListener("click", (e) => {
      const b = e.target.closest("[data-f]");
      if (!b) return;
      if (b.dataset.f === "reset") { pos.x = 50; pos.y = 50; paint(); }
      else if (b.dataset.f === "save") { result = { ...pos }; dlg.close(); }
      else dlg.close();
    });
    paint();
  });
}
