// dashboard.js — renders all the read-only analysis cards from an IV object.
import { MONTHS, DOWN, fmt, usd, colorScale, inWindow, deriveBasis } from './util.js';

let thresholdRegistered = false;

export function renderDashboard(IV) {
  const { calMonthly, typYear, calcMonths, annualKwh } = deriveBasis(IV);

  /* ---- KPIs ---- */
  const ymLabel = ym => { const [y, m] = ym.split('-'); return `${MONTHS[+m - 1]} ${y}`; };
  const fullMonths = Object.keys(IV.monthMeta).length;
  const winFirst = calcMonths[0], winLast = calcMonths[calcMonths.length - 1];
  const annualWindow = calcMonths.length === 12 ? `${ymLabel(winFirst)} – ${ymLabel(winLast)}` : `${calcMonths.length} mo`;
  document.getElementById('dataRange').innerHTML =
    `Analyzed <b>${ymLabel(IV.stats.start.slice(0, 7))} – ${ymLabel(IV.stats.end.slice(0, 7))}</b> · ${fmt(IV.stats.days)} days · ${fullMonths} calendar months of 15-min data. ` +
    `Annual figures below use your latest 12 complete months (<b>${annualWindow}</b>); demand, peak &amp; load-factor use all data.`;

  const peak = typYear.reduce((a, b) => b.kwh > a.kwh ? b : a);
  const over1000 = calcMonths.filter(m => IV.monthMeta[m].kwh >= 1000).length;
  const over2000 = calcMonths.filter(m => IV.monthMeta[m].kwh >= 2000).length;
  const avgDemand = IV.stats.totalKwh / (IV.stats.days * 24);
  const loadFactor = IV.stats.peakKw > 0 ? avgDemand / IV.stats.peakKw * 100 : 0;
  const kpis = [
    { l: "Interval-year use", v: fmt(annualKwh) + " kWh", x: annualWindow, c: "var(--accent)" },
    { l: "Avg daily use", v: fmt(IV.stats.avgDay, 1) + " kWh", x: "all " + fmt(IV.stats.days) + " days", c: "var(--text)" },
    { l: "Peak demand", v: fmt(IV.stats.peakKw, 1) + " kW", x: IV.stats.peakWhen, c: "var(--bad)" },
    { l: "Load factor", v: fmt(loadFactor, 0) + "%", x: "avg " + fmt(avgDemand, 1) + " kW vs peak (low=peaky)", c: "var(--accent2)" },
    { l: "Peak month", v: peak.name + " \u00b7 " + fmt(peak.kwh), x: "avg across all years (summer AC)", c: "var(--warn)" },
    { l: "Months \u22651000 kWh", v: over1000 + " / " + calcMonths.length, x: "qualify for usage credits", c: "var(--good)" },
    { l: "Months \u22652000 kWh", v: over2000 + " / " + calcMonths.length, x: "high-tier / summer", c: "var(--warn)" },
  ];
  document.getElementById('kpis').innerHTML = kpis.map(k =>
    `<div class="card kpi"><div class="v" style="color:${k.c}">${k.v}</div>
     <div class="l">${k.l}</div><div class="x">${k.x}</div></div>`).join('');

  /* ---- Monthly chart ---- */
  if (!thresholdRegistered) {
    Chart.register({
      id: 'thr', afterDraw: c => {
        if (c.canvas.id === 'monthlyChart') thresholdLines(c, [
          { y: 1000, c: '#4dabf7', t: '1000 kWh credit threshold' },
          { y: 2000, c: '#ff922b', t: '2000 kWh' }]);
      }
    });
    thresholdRegistered = true;
  }
  function thresholdLines(chart, vals) {
    const { ctx, chartArea, scales } = chart;
    vals.forEach(v => {
      const y = scales.y.getPixelForValue(v.y);
      ctx.save(); ctx.strokeStyle = v.c; ctx.setLineDash([5, 4]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(chartArea.left, y); ctx.lineTo(chartArea.right, y); ctx.stroke();
      ctx.fillStyle = v.c; ctx.font = '10px sans-serif'; ctx.fillText(v.t, chartArea.left + 4, y - 3); ctx.restore();
    });
  }
  const cm = calMonthly.filter(m => m.days >= 10);
  new Chart(document.getElementById('monthlyChart'), {
    type: 'bar',
    data: { labels: cm.map(m => m.month), datasets: [{ label: 'kWh', data: cm.map(m => m.kwh),
      backgroundColor: cm.map(m => m.kwh >= 2000 ? '#ff922b' : m.kwh >= 1000 ? '#4dabf7' : '#51cf66') }] },
    options: { plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => fmt(c.raw) + ' kWh' } } },
      scales: { y: { title: { display: true, text: 'kWh' } }, x: { ticks: { maxRotation: 90, minRotation: 45 } } } }
  });

  /* ---- Seasonal ---- */
  new Chart(document.getElementById('seasonChart'), {
    type: 'bar',
    data: { labels: MONTHS, datasets: [{ label: 'Typical kWh', data: typYear.map(o => o.kwh),
      backgroundColor: typYear.map(o => `hsl(${210 - (o.kwh - 1300) / 1800 * 210},70%,55%)`) }] },
    options: { plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => fmt(c.raw) + ' kWh' } } },
      scales: { y: { title: { display: true, text: 'kWh' } } } }
  });

  /* ---- Day of week ---- */
  new Chart(document.getElementById('dowChart'), {
    type: 'bar',
    data: { labels: DOWN, datasets: [{ label: 'avg kWh/day', data: IV.dow,
      backgroundColor: IV.dow.map((_, i) => i >= 5 ? '#ffd43b' : '#4dabf7') }] },
    options: { plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => fmt(c.raw, 0) + ' kWh/day' } } },
      scales: { y: { title: { display: true, text: 'kWh / day' } } } }
  });

  /* ---- Monthly usage by hour heatmap ---- */
  (function buildHeatmap() {
    const months = Object.keys(IV.monthHour).sort();
    const grid = months.map(m => IV.monthHour[m].map(v => v / IV.monthMeta[m].days));
    let max = 0; grid.forEach(r => r.forEach(v => max = Math.max(max, v)));
    const el = document.getElementById('heatmap');
    el.className = 'heatgrid'; el.style.display = 'grid';
    el.style.gridTemplateColumns = `repeat(${months.length},1fr)`;
    el.style.gridTemplateRows = `repeat(24,1fr)`; el.style.gap = '2px';
    let html = '';
    for (let h = 0; h < 24; h++) for (let mi = 0; mi < months.length; mi++) {
      const v = grid[mi][h];
      html += `<div class="hmcell" title="${months[mi]} ${h}:00 — ${v.toFixed(2)} kW" style="background:${colorScale(v, max)}"></div>`;
    }
    el.innerHTML = html;
    document.getElementById('hmScale').innerHTML =
      `<span>0 kW</span><div class="swatch" style="background:${colorScale(0, max)}"></div>
       <div class="swatch" style="background:${colorScale(max * 0.5, max)}"></div>
       <div class="swatch" style="background:${colorScale(max, max)}"></div><span>${max.toFixed(1)} kW peak-hour avg</span>`;
  })();

  /* ---- Daily usage: month (x) x day-of-month (y) ---- */
  (function buildCalendar() {
    const days = IV.daily;
    const max = Math.max(...days.map(d => d.k));
    const byMonthDay = {};
    days.forEach(d => { const [y, m, day] = d.d.split('-'); const ym = y + '-' + m; (byMonthDay[ym] = byMonthDay[ym] || {})[+day] = d.k; });
    const months = Object.keys(byMonthDay).sort();
    const el = document.getElementById('calHeat');
    el.className = 'heatgrid'; el.style.display = 'grid';
    el.style.gridTemplateColumns = `repeat(${months.length},1fr)`;
    el.style.gridTemplateRows = `repeat(31,1fr)`; el.style.gap = '2px';
    let html = '';
    for (let day = 1; day <= 31; day++) months.forEach(m => {
      const k = byMonthDay[m][day];
      if (k === undefined) { html += '<div class="daycell" style="background:#161b22"></div>'; }
      else { html += `<div class="daycell" title="${m}-${String(day).padStart(2, '0')}: ${k.toFixed(1)} kWh" style="background:${colorScale(k, max)}"></div>`; }
    });
    el.innerHTML = html;
    document.getElementById('calScale').innerHTML =
      `<span>low</span><div class="swatch" style="background:${colorScale(0, max)}"></div>
       <div class="swatch" style="background:${colorScale(max * 0.5, max)}"></div>
       <div class="swatch" style="background:${colorScale(max, max)}"></div><span>${max.toFixed(0)} kWh/day max</span>`;
  })();

  /* ---- Year over year ---- */
  let yoyChart;
  function buildYoY(mode) {
    const byYear = {};
    calMonthly.forEach(m => { const [y, mo] = m.month.split('-').map(Number); byYear[y] = byYear[y] || {}; byYear[y][mo] = mode === 'daily' ? +(m.kwh / m.days).toFixed(1) : m.kwh; });
    const years = Object.keys(byYear).sort(); const colors = ['#4dabf7', '#ffd43b', '#ff6b6b', '#51cf66'];
    const ds = years.map((y, i) => ({ label: y, data: MONTHS.map((_, k) => byYear[y][k + 1] ?? null),
      borderColor: colors[i % 4], backgroundColor: colors[i % 4] + '33', spanGaps: true, tension: .3, pointRadius: 3 }));
    if (yoyChart) yoyChart.destroy();
    yoyChart = new Chart(document.getElementById('yoyChart'), {
      type: 'line', data: { labels: MONTHS, datasets: ds },
      options: { responsive: true, maintainAspectRatio: false,
        plugins: { tooltip: { callbacks: { label: c => c.dataset.label + ': ' + fmt(c.raw, mode === 'daily' ? 1 : 0) + (mode === 'daily' ? ' kWh/day' : ' kWh') } } },
        scales: { y: { title: { display: true, text: mode === 'daily' ? 'kWh / day' : 'kWh' } } } }
    });
  }
  buildYoY('yoy');
  document.querySelectorAll('.tab[data-mode]').forEach(t => t.onclick = () => {
    document.querySelectorAll('.tab[data-mode]').forEach(x => x.classList.remove('active'));
    t.classList.add('active'); buildYoY(t.dataset.mode);
  });

  /* ---- Insights (derived from the data) ---- */
  function realWindowShare(s, e) {
    let win = 0, tot = 0;
    calcMonths.forEach(m => { IV.monthHour[m].forEach((v, h) => { tot += v; if (inWindow(h, s, e)) win += v; }); });
    return win / tot;
  }
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const ns216 = realWindowShare(23, 6);
  const nMonths = calcMonths.length;

  // peak hour-of-day from the real average profile
  const prof = IV.hourProfile.all;
  const peakHour = prof.reduce((bi, v, i) => v > prof[bi] ? i : bi, 0);
  const peakHourLabel = `${peakHour}:00\u2013${(peakHour + 1) % 24}:00`;
  const driverWord = peakHour >= 16 ? 'evening-driven' : peakHour <= 10 ? 'morning-driven' : 'midday-driven';

  // summer- vs winter-peaking from the seasonal averages
  const summerAvg = [6, 7, 8, 9].reduce((s, m) => s + typYear[m - 1].kwh, 0) / 4;
  const winterAvg = [12, 1, 2].reduce((s, m) => s + typYear[m - 1].kwh, 0) / 3;
  const summerPeaking = summerAvg >= winterAvg;
  const seasonWord = summerPeaking ? 'summer-peaking' : 'winter-peaking';
  const causeWord = summerPeaking ? 'likely AC' : 'likely heating';
  const seasonRate = summerPeaking ? 'summer' : 'winter';

  // weekday vs weekend averages (Mon-Fri vs Sat-Sun)
  const wkAvg = (IV.dow[0] + IV.dow[1] + IV.dow[2] + IV.dow[3] + IV.dow[4]) / 5;
  const weAvg = (IV.dow[5] + IV.dow[6]) / 2;
  const wePct = wkAvg > 0 ? (weAvg - wkAvg) / wkAvg * 100 : 0;

  const ins = [];
  ins.push(`<b>${cap(seasonWord)}, ${driverWord} load.</b> Demand peaks around <b>${peakHourLabel}</b> (${causeWord}) and your all-time peak was <b>${fmt(IV.stats.peakKw, 1)} kW</b> on ${IV.stats.peakWhen}.`);
  ins.push(`<b>Load factor ${fmt(loadFactor, 0)}%</b>: your peak is ${fmt(avgDemand > 0 ? IV.stats.peakKw / avgDemand : 0, 1)}\u00d7 your average draw. ${loadFactor < 30 ? 'That\u2019s peaky \u2014 <b>avoid plans with demand charges</b> ($/kW), which penalize sharp peaks.' : 'Your load is relatively flat, so demand-charge plans hurt less than for most homes.'}`);
  ins.push(`<b>${fmt(ns216 * 100, 0)}%</b> of your usage falls in an 11pm\u20136am window. ${ns216 < 0.25 ? 'A <b>free-nights</b> plan won\u2019t pay off unless you shift load (EV charging, pool pump, laundry, pre-cooling) into those hours \u2014 test it with the slider below.' : 'A meaningful share is already overnight, so a <b>free-nights</b> plan may pay off \u2014 confirm with the calculator below.'} You can also try the <b>Free weekends</b> option.`);
  ins.push(`<b>${over1000}/${nMonths}</b> months exceed 1000 kWh and <b>${over2000}/${nMonths}</b> exceed 2000 kWh, so usage-credit plans (which pay out once a month passes a minimum) ${over1000 >= nMonths / 2 ? 'trigger most of the year' : 'only trigger in your heavier months'}.`);
  ins.push(Math.abs(wePct) < 10
    ? `Weekday and weekend use are similar (${fmt(wkAvg, 0)} vs ${fmt(weAvg, 0)} kWh/day) \u2014 whole-home <b>time-of-use</b> savings are limited without behavior change.`
    : wePct >= 10
      ? `Weekends run <b>~${fmt(wePct, 0)}% higher</b> (${fmt(weAvg, 0)} vs ${fmt(wkAvg, 0)} kWh/day) \u2014 a <b>free-weekends</b> plan is worth a close look.`
      : `Weekdays run <b>~${fmt(-wePct, 0)}% higher</b> (${fmt(wkAvg, 0)} vs ${fmt(weAvg, 0)} kWh/day) \u2014 you\u2019re likely out on weekends, so free-weekend perks help less.`);
  ins.push(`High volume (~${fmt(annualKwh)} kWh/yr): each 1\u00a2/kWh \u2248 <b>${usd(annualKwh * 0.01)}</b>/yr \u2014 prioritize the lowest all-in <b>${seasonRate}</b> rate.`);
  document.getElementById('insights').innerHTML = ins.map(t => `<div class="ins">${t}</div>`).join('');
}
