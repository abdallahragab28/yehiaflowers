import { A, orderTotals, loadCatalog, newCount } from "./state.js";
import { t } from "./strings.js";
import { esc, nf, timeAgo } from "../shared/util.js";
import { prefs } from "../shared/prefs.js";
import { unit, nameOf, statusLabel } from "../shared/i18n.js";
import { icon } from "../shared/icons.js";

const DAY = 86400000;
const since = (days) => Date.now() - days * DAY;

export function dashboardHtml() {
  const week = A.orders.filter((o) => new Date(o.created_at).getTime() > since(7));
  const month = A.orders.filter((o) => new Date(o.created_at).getTime() > since(30));
  const weekPacks = week.reduce((s, o) => s + orderTotals(o).packs, 0);
  const by = (s) => A.orders.filter((o) => o.status === s).length;

  const tally = new Map();
  month.filter((o) => o.status !== "cancelled").forEach((o) => o.order_items.forEach((i) => {
    const k = `${i.flower_name_en}|${i.color_name_en}`;
    const cur = tally.get(k) || { f: { name_en: i.flower_name_en, name_ar: i.flower_name_ar }, c: { name_en: i.color_name_en, name_ar: i.color_name_ar }, hex: i.color_hex, n: 0 };
    cur.n += i.packs;
    tally.set(k, cur);
  }));
  const top = [...tally.values()].sort((a, b) => b.n - a.n).slice(0, 6);
  const max = top[0]?.n || 1;

  const pending = A.orders.filter((o) => o.status === "new").slice(0, 5);
  const out = A.flowers.flatMap((f) => (f.colors || []).filter((c) => !c.in_stock).map((c) => ({ f, c }))).slice(0, 8);

  const kpi = (iconName, value, label, tone = "") => `<div class="kpi ${tone}"><span class="kpi-ic">${icon(iconName, 20)}</span><b>${nf(value)}</b><span>${esc(label)}</span></div>`;
  return `<div class="a-page"><div class="a-head"><div><h1>${t("dashboard")}</h1><p class="muted">${t("dashboardSub")}</p></div></div>
    <div class="kpis">${kpi("inbox", newCount(), t("kNew"), newCount() ? "hot" : "")}${kpi("clock", by("quoted"), t("kQuoted"))}${kpi("check", by("confirmed"), t("kConfirmed"))}${kpi("package", weekPacks, t("kWeekPacks"))}</div>
    <div class="grid-2">
      <section class="a-card"><div class="a-card-h"><h2>${t("needsAttention")}</h2><a class="link" href="#/orders">${t("viewAll")}</a></div>
        ${pending.length ? `<ul class="plain">${pending.map((o) => `<li><button class="line-btn" data-act="openOrder" data-id="${o.id}"><span><b>${esc(o.customer_name)}</b><span class="muted"> · ${esc(timeAgo(o.created_at, prefs.lang))}</span></span><span class="badge">${esc(unit(orderTotals(o).packs, "pack"))}</span></button></li>`).join("")}</ul>`
          : `<p class="muted pad">${t("allCaughtUp")}</p>`}</section>
      <section class="a-card"><div class="a-card-h"><h2>${t("topColors")}</h2><span class="muted">${t("last30")}</span></div>
        ${top.length ? `<ul class="bars">${top.map((x) => `<li><span class="bar-l"><i class="sw" style="--c:${esc(x.hex)}"></i>${esc(nameOf(x.f))} · ${esc(nameOf(x.c))}</span><span class="bar-t"><i style="width:${Math.max(6, (x.n / max) * 100)}%"></i></span><b>${nf(x.n)}</b></li>`).join("")}</ul>` : `<p class="muted pad">${t("noData")}</p>`}</section>
      <section class="a-card"><div class="a-card-h"><h2>${t("outOfStock")}</h2><a class="link" href="#/stock">${t("openStock")}</a></div>
        ${out.length ? `<ul class="plain">${out.map(({ f, c }) => `<li class="line-static"><span><i class="sw" style="--c:${esc(c.hex)}"></i> ${esc(nameOf(f))} · ${esc(nameOf(c))}</span><span class="badge badge-muted">${t("soldOut")}</span></li>`).join("")}</ul>` : `<p class="muted pad">${A.catalogLoaded ? t("allInStock") : t("loading")}</p>`}</section>
      <section class="a-card"><div class="a-card-h"><h2>${t("byStatus")}</h2></div>
        <ul class="plain">${["new", "quoted", "confirmed", "delivered", "cancelled"].map((s) => `<li class="line-static"><span class="badge st st-${s}">${esc(statusLabel(s))}</span><b>${nf(by(s))}</b></li>`).join("")}</ul></section>
    </div></div>`;
}

export async function ensureCatalog() {
  if (!A.catalogLoaded) await loadCatalog();
}
