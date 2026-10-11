import { uid } from "../shared/util.js";

const MAX_INPUT = 30 * 1024 * 1024;

async function decode(file) {
  if (window.createImageBitmap) {
    try { return await createImageBitmap(file, { imageOrientation: "from-image" }); } catch { /* fall back to <img> */ }
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function encode(src, max, quality) {
  const scale = Math.min(1, max / Math.max(src.width, src.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(src.width * scale);
  canvas.height = Math.round(src.height * scale);
  canvas.getContext("2d").drawImage(src, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) =>
    canvas.toBlob((b) => {
      if (b && b.type === "image/webp") resolve({ blob: b, ext: "webp" });
      else canvas.toBlob((j) => resolve({ blob: j, ext: "jpg" }), "image/jpeg", quality); // older Safari cannot encode WebP
    }, "image/webp", quality)
  );
}

/** Shrinks a phone photo to a full version plus a 480px thumbnail. */
export async function prepare(file, { fullMax = 1600, quality = 0.85, thumb = true } = {}) {
  if (!file.type.startsWith("image/")) throw new Error("not an image");
  if (file.size > MAX_INPUT) throw new Error("file too large");
  const src = await decode(file);
  const full = await encode(src, fullMax, quality);
  const small = thumb ? await encode(src, 480, 0.78) : null;
  return { id: uid().slice(0, 12), full, thumb: small, ext: full.ext };
}
