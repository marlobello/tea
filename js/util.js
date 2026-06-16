// util.js — shared constants, formatters, and derived basis used by dashboard + calculator.

export const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
export const DOWN = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

export const fmt = (n, d = 0) => n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
export const usd = n => "$" + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Escape user-supplied text before inserting into innerHTML.
export const escapeHtml = s => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Heatmap color scale (blue -> red as value approaches max).
export function colorScale(v, max, hueLow = 210, hueHigh = 0) {
  const t = max > 0 ? Math.min(v / max, 1) : 0;
  const hue = hueLow + (hueHigh - hueLow) * t;
  return `hsl(${hue},75%,${28 + t * 30}%)`;
}

// Night window helper: is hour h inside [s,e)? Handles wrap-around (e.g. 23 -> 6).
export const inWindow = (h, s, e) => s <= e ? (h >= s && h < e) : (h >= s || h < e);

// Derive shared analysis basis from the IV object.
export function deriveBasis(IV) {
  const calMonthly = Object.keys(IV.monthMeta).sort()
    .map(m => ({ month: m, kwh: IV.monthMeta[m].kwh, days: IV.monthMeta[m].days }));
  const moyAgg = {};
  calMonthly.forEach(c => {
    const mo = +c.month.slice(5, 7);
    (moyAgg[mo] = moyAgg[mo] || { k: 0, d: 0 });
    moyAgg[mo].k += c.kwh; moyAgg[mo].d += c.days;
  });
  const typYear = [...Array(12)].map((_, i) => {
    const mo = i + 1, a = moyAgg[mo];
    return { m: mo, name: MONTHS[i], kwh: a ? Math.round(a.k / a.d * 30) : 0 };
  });
  // Prefer the latest 12 complete (>=28-day) months. If none are complete
  // (e.g. a short upload), fall back to whatever months exist so downstream
  // math has a non-empty basis and never divides by zero.
  const allMonths = Object.keys(IV.monthHour).sort();
  const completeMonths = allMonths.filter(m => IV.monthMeta[m].days >= 28);
  const basisMonths = (completeMonths.length ? completeMonths : allMonths);
  const calcMonths = basisMonths.slice(-12);
  const annualKwh = calcMonths.reduce((s, m) => s + IV.monthMeta[m].kwh, 0);
  return { calMonthly, typYear, calcMonths, annualKwh };
}
