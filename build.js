#!/usr/bin/env node
/**
 * Build script: bundles and minifies all three JS entry points with esbuild.
 * Output goes to dist/ so the source tree is unchanged.
 * Run: node build.js
 */
import { build } from "esbuild";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const OUT = "dist";

// ── 1. Bundle JS ───────────────────────────────────────────────────────────
const entries = [
  { in: "assets/js/store/app.js",  out: `${OUT}/assets/js/store/app.js` },
  { in: "assets/js/order/main.js", out: `${OUT}/assets/js/order/main.js` },
  { in: "assets/js/admin/main.js", out: `${OUT}/assets/js/admin/main.js` },
];

await Promise.all(entries.map(({ in: entryPoint, out: outfile }) =>
  build({
    entryPoints: [entryPoint],
    bundle: true,
    minify: true,
    format: "esm",
    target: ["es2020"],
    outfile,
    logLevel: "info",
  })
));

// ── 2. Copy all non-JS/non-HTML assets verbatim ────────────────────────────
const staticDirs = ["assets/css", "assets/img"];
for (const dir of staticDirs) {
  try {
    mkdirSync(join(OUT, dir), { recursive: true });
    cpSync(dir, join(OUT, dir), { recursive: true });
  } catch { /* dir may not exist */ }
}
// Copy favicon and other root-level files
for (const f of ["favicon.ico"]) {
  try { cpSync(f, join(OUT, f)); } catch {}
}

// ── 3. Copy & patch HTML files ─────────────────────────────────────────────
function patchHtml(src, dest) {
  mkdirSync(dest.replace(/\/[^/]+$/, ""), { recursive: true });
  let html = readFileSync(src, "utf8");
  // Remove type="module" so bundled IIFE-style script works in all browsers.
  // esbuild outputs ESM, so keep type="module" — just strip any src that
  // points at an unbundled path (they're already covered by the bundles above).
  writeFileSync(dest, html);
}

// Store
mkdirSync(`${OUT}`, { recursive: true });
patchHtml("index.html", `${OUT}/index.html`);

// Order page
mkdirSync(`${OUT}/order`, { recursive: true });
patchHtml("order/index.html", `${OUT}/order/index.html`);

// Admin panel
mkdirSync(`${OUT}/admin`, { recursive: true });
patchHtml("admin/index.html", `${OUT}/admin/index.html`);

console.log("✅  Build complete → dist/");
