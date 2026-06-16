// parse.js — Smart Meter Texas 15-minute interval CSV -> aggregated IV object.
// Pure, in-browser. Mirrors the original offline Python aggregation.

const round = (v, n) => { const p = 10 ** n; return Math.round(v * p) / p; };
const pad2 = n => String(n).padStart(2, '0');

// Build an empty 7x24 matrix (rows = day-of-week Mon..Sun, cols = hour 0..23)
const dowHourMatrix = () => Array.from({ length: 7 }, () => new Array(24).fill(0));

export class CsvError extends Error {}

// Parse the CSV text and return the IV object the dashboard consumes.
// Throws CsvError with a friendly message on invalid/insufficient input.
export function parseIntervalCSV(text) {
  if (!text || !text.trim()) throw new CsvError('The file is empty.');

  const lines = text.split(/\r?\n/);
  // locate header
  let headerIdx = lines.findIndex(l => /USAGE_DATE/i.test(l) && /USAGE_KWH/i.test(l));
  if (headerIdx === -1) {
    throw new CsvError('This does not look like a Smart Meter Texas interval CSV (missing USAGE_DATE / USAGE_KWH columns).');
  }
  const header = lines[headerIdx].split(',').map(s => s.trim().toUpperCase());
  const iDate = header.indexOf('USAGE_DATE');
  const iStart = header.indexOf('USAGE_START_TIME');
  const iKwh = header.indexOf('USAGE_KWH');
  if (iDate === -1 || iStart === -1 || iKwh === -1) {
    throw new CsvError('Missing required columns USAGE_DATE, USAGE_START_TIME, or USAGE_KWH.');
  }

  const monthHour = {};      // ym -> [24]
  const monthDays = {};      // ym -> Set(iso)
  const monthsTotal = {};    // ym -> kWh
  const monthDowHour = {};   // ym -> [7][24]
  const daily = {};          // iso -> kWh
  const hourAll = new Array(24).fill(0);
  const hourSeason = { summer: new Array(24).fill(0), winter: new Array(24).fill(0), shoulder: new Array(24).fill(0) };
  const seasonDays = { summer: new Set(), winter: new Set(), shoulder: new Set() };
  const hourWE = { wk: new Array(24).fill(0), we: new Array(24).fill(0) };
  const weDays = { wk: new Set(), we: new Set() };
  const dow = new Array(7).fill(0);
  const dowDays = Array.from({ length: 7 }, () => new Set());
  let peakKw = 0, peakWhen = null, n = 0;

  for (let li = headerIdx + 1; li < lines.length; li++) {
    const raw = lines[li];
    if (!raw || !raw.trim()) continue;
    const f = raw.split(',');
    const dateStr = (f[iDate] || '').trim();
    const startStr = (f[iStart] || '').trim();
    const kwhStr = (f[iKwh] || '').trim();
    if (!dateStr || !startStr) continue;

    // USAGE_DATE = mm/dd/yyyy
    const dm = dateStr.split('/');
    if (dm.length !== 3) continue;
    const mm = +dm[0], dd = +dm[1], yyyy = +dm[2];
    if (!yyyy || !mm || !dd) continue;
    const hh = parseInt(startStr.slice(0, 2), 10);
    if (Number.isNaN(hh)) continue;
    const kwh = kwhStr === '' ? null : parseFloat(kwhStr);
    if (kwh === null || Number.isNaN(kwh)) continue;

    const iso = `${yyyy}-${pad2(mm)}-${pad2(dd)}`;
    const ym = `${yyyy}-${pad2(mm)}`;
    // Python weekday(): Mon=0..Sun=6.  JS getUTCDay(): Sun=0..Sat=6.
    const wd = (new Date(Date.UTC(yyyy, mm - 1, dd)).getUTCDay() + 6) % 7;

    if (!monthHour[ym]) { monthHour[ym] = new Array(24).fill(0); monthDays[ym] = new Set(); monthsTotal[ym] = 0; monthDowHour[ym] = dowHourMatrix(); }
    monthHour[ym][hh] += kwh;
    monthDays[ym].add(iso);
    monthsTotal[ym] += kwh;
    monthDowHour[ym][wd][hh] += kwh;

    daily[iso] = (daily[iso] || 0) + kwh;
    hourAll[hh] += kwh;
    n++;

    const seas = (mm >= 6 && mm <= 9) ? 'summer' : (mm === 12 || mm <= 2) ? 'winter' : 'shoulder';
    hourSeason[seas][hh] += kwh; seasonDays[seas].add(iso);

    const we = wd >= 5 ? 'we' : 'wk';
    hourWE[we][hh] += kwh; weDays[we].add(iso);

    dow[wd] += kwh; dowDays[wd].add(iso);

    const kw = kwh * 4; // 15-min interval -> kW
    if (kw > peakKw) { peakKw = kw; peakWhen = `${iso} ${startStr}`; }
  }

  if (n === 0) throw new CsvError('No usable interval readings were found in the file.');
  const months = Object.keys(monthHour);
  if (months.length === 0) throw new CsvError('No monthly data could be derived from the file.');

  const avgday = (arr, days) => arr.map(v => round(v / Math.max(days.size, 1), 3));

  const out = {
    monthHour: {},
    monthMeta: {},
    monthDowHour: {},
    hourProfile: {
      all: avgday(hourAll, new Set(Object.keys(daily))),
      summer: avgday(hourSeason.summer, seasonDays.summer),
      winter: avgday(hourSeason.winter, seasonDays.winter),
      shoulder: avgday(hourSeason.shoulder, seasonDays.shoulder),
      weekday: avgday(hourWE.wk, weDays.wk),
      weekend: avgday(hourWE.we, weDays.we),
    },
    dow: dow.map((_, i) => round(dow[i] / Math.max(dowDays[i].size, 1), 1)),
    daily: Object.keys(daily).sort().map(d => ({ d, k: round(daily[d], 2) })),
    stats: {},
  };

  months.sort().forEach(ym => {
    out.monthHour[ym] = monthHour[ym].map(v => round(v, 2));
    out.monthMeta[ym] = { days: monthDays[ym].size, kwh: round(monthsTotal[ym], 1) };
    out.monthDowHour[ym] = monthDowHour[ym].map(rowArr => rowArr.map(v => round(v, 2)));
  });

  const totalKwh = out.daily.reduce((s, o) => s + o.k, 0);
  const dayCount = out.daily.length;
  const isoSorted = out.daily.map(o => o.d);
  out.stats = {
    intervals: n,
    totalKwh: round(totalKwh, 0),
    days: dayCount,
    avgDay: round(totalKwh / Math.max(dayCount, 1), 1),
    peakKw: round(peakKw, 2),
    peakWhen,
    start: isoSorted[0],
    end: isoSorted[isoSorted.length - 1],
  };

  return out;
}
