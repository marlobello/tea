// calculator.js — hourly profile chart (window-driven) + plan comparison calculator.
import { DOWN, fmt, usd, inWindow, escapeHtml, deriveBasis } from './util.js';

export function initCalculator(IV) {
  const { calcMonths, annualKwh } = deriveBasis(IV);
  document.getElementById('annualKwh').textContent = fmt(annualKwh);

  let hourChart, profKey = 'all';
  let win = { s: 23, e: 6 };
  let weekend = { sd: 4, sh: 19, ed: 6, eh: 23 };
  const inNightWin = h => inWindow(h, win.s, win.e);
  function inWeekendWin(wd, h) {
    const si = weekend.sd * 24 + weekend.sh, ei = weekend.ed * 24 + weekend.eh, idx = wd * 24 + h;
    return si <= ei ? (idx >= si && idx <= ei) : (idx >= si || idx <= ei);
  }
  // free hours for a specific plan, based on its own night/weekend flags
  const planFree = (p, wd, h) => (p.fn && inNightWin(h)) || (p.fw && inWeekendWin(wd, h));
  function windowShare(pred) {
    let f = 0, t = 0;
    calcMonths.forEach(m => { const g = IV.monthDowHour[m]; for (let wd = 0; wd < 7; wd++) for (let h = 0; h < 24; h++) { t += g[wd][h]; if (pred(wd, h)) f += g[wd][h]; } });
    return t > 0 ? f / t : 0;
  }

  /* ---- Real hourly profile (shaded by night window) ---- */
  function drawProfile() {
    const p = IV.hourProfile[profKey], tot = p.reduce((a, b) => a + b, 0);
    const share = tot > 0 ? p.reduce((a, x, h) => a + (inNightWin(h) ? x : 0), 0) / tot : 0;
    document.getElementById('nightShareLbl').textContent = fmt(share * 100, 0) + "% (this profile)";
    const bg = p.map((_, h) => inNightWin(h) ? '#5c7cfa' : '#4dabf7');
    if (hourChart) hourChart.destroy();
    hourChart = new Chart(document.getElementById('hourChart'), {
      type: 'bar',
      data: { labels: [...Array(24).keys()].map(h => h + ':00'), datasets: [{ label: 'avg kW', data: p, backgroundColor: bg }] },
      options: { plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => fmt(c.raw, 2) + ' kW' + (inNightWin(c.dataIndex) ? ' (night window)' : '') } } },
        scales: { y: { title: { display: true, text: 'avg kW (kWh per hour)' } } } }
    });
  }
  document.getElementById('profSelect').onchange = e => { profKey = e.target.value; drawProfile(); };

  /* ---- Plan calculator ---- */
  const defaultPlans = [
    { name: "Flat 14\u00a2", base: 0, day: 14, tduBase: 4.90, tduRate: 5.1461, credit: 0, cmin: 0, fn: false, fw: false },
    { name: "Free Nights 18\u00a2", base: 9.95, day: 18, tduBase: 4.90, tduRate: 5.1461, credit: 0, cmin: 0, fn: true, fw: false },
    { name: "$30 credit @1000kWh", base: 0, day: 16, tduBase: 4.90, tduRate: 5.1461, credit: 30, cmin: 1000, fn: false, fw: false },
    { name: "Low rate 12.5\u00a2 + $40 credit", base: 0, day: 12.5, tduBase: 4.90, tduRate: 5.1461, credit: 40, cmin: 1000, fn: false, fw: false },
  ];
  const body = document.getElementById('planBody');
  function addRow(p) {
    const tr = document.createElement('tr'); tr.className = 'planrow';
    tr.innerHTML = `<td><input type="text" value="${escapeHtml(p.name)}"></td>
      <td><input type="number" step="0.01" value="${p.tduBase}"></td>
      <td><input type="number" step="0.0001" value="${p.tduRate}"></td>
      <td><input type="number" step="0.01" value="${p.base}"></td>
      <td><input type="number" step="0.1" value="${p.day}"></td>
      <td><input type="number" step="1" value="${p.credit}"></td>
      <td><input type="number" step="50" value="${p.cmin}"></td>
      <td style="text-align:center"><input type="checkbox" class="fn"${p.fn ? ' checked' : ''}></td>
      <td style="text-align:center"><input type="checkbox" class="fw"${p.fw ? ' checked' : ''}></td>
      <td><button class="btn del">\u2715</button></td>`;
    tr.querySelector('.del').onclick = () => tr.remove();
    tr.querySelectorAll('input').forEach(i => i.oninput = calc);
    body.appendChild(tr);
  }
  defaultPlans.forEach(addRow);
  document.getElementById('addPlan').onclick = () => addRow({ name: "New plan", base: 0, day: 15, tduBase: 4.90, tduRate: 5.1461, credit: 0, cmin: 0, fn: false, fw: false });

  let planChart;
  function updateWin() {
    const hourOf = id => { const v = document.getElementById(id).value; return v ? parseInt(v.split(':')[0], 10) : 0; };
    win.s = hourOf('nightStart'); win.e = hourOf('nightEnd');
    weekend.sd = +document.getElementById('wStartDay').value; weekend.sh = hourOf('wStartHour');
    weekend.ed = +document.getElementById('wEndDay').value; weekend.eh = hourOf('wEndHour');
    const sh = +document.getElementById('shift').value;
    document.getElementById('shiftLbl').textContent = sh + '%';
    const nShare = windowShare((wd, h) => inNightWin(h));
    const wShare = windowShare((wd, h) => inWeekendWin(wd, h));
    document.getElementById('winShare').innerHTML = `nights ${fmt(nShare * 100, 0)}% &middot; weekends ${fmt(wShare * 100, 0)}%`;
    drawProfile();
  }
  function calc() {
    updateWin();
    const shiftPct = +document.getElementById('shift').value / 100;
    const rows = [...body.querySelectorAll('tr')].map(tr => { const i = tr.querySelectorAll('input');
      return { name: i[0].value, tduBase: +i[1].value, tduRate: +i[2].value, base: +i[3].value, day: +i[4].value,
        credit: +i[5].value, cmin: +i[6].value, fn: i[7].checked, fw: i[8].checked }; });
    const results = rows.map(p => {
      const hasFree = p.fn || p.fw;
      let annual = 0; const monthly = [];
      calcMonths.forEach(m => {
        const g = IV.monthDowHour[m]; const total = IV.monthMeta[m].kwh;
        let freeK = 0; for (let wd = 0; wd < 7; wd++) for (let h = 0; h < 24; h++) if (planFree(p, wd, h)) freeK += g[wd][h];
        let dayK = total - freeK;
        if (hasFree) { const shifted = dayK * shiftPct; freeK += shifted; dayK -= shifted; }
        // energy: free hours $0, day hours at energy rate. TDU delivery applies to ALL kWh.
        let c = p.base + p.tduBase + dayK * p.day / 100 + total * p.tduRate / 100;
        if (p.credit > 0 && total >= p.cmin) c -= p.credit;
        monthly.push(c); annual += c;
      });
      return { name: p.name, annual, monthly, eff: annualKwh > 0 ? annual / annualKwh * 100 : 0, free: [p.fn ? 'N' : '', p.fw ? 'W' : ''].filter(Boolean).join('+') };
    });
    results.sort((a, b) => a.annual - b.annual);
    const best = results[0].annual;
    document.getElementById('results').innerHTML = `
      <table><thead><tr><th>Plan</th><th>Free</th><th>Est. annual cost</th><th>Effective \u00a2/kWh</th><th>vs best</th><th></th></tr></thead>
      <tbody>${results.map((r, i) => `<tr class="${i === 0 ? 'winner' : ''}">
        <td>${escapeHtml(r.name)}</td><td>${r.free || '\u2014'}</td><td>${usd(r.annual)}</td><td>${fmt(r.eff, 2)}\u00a2</td>
        <td>${i === 0 ? '\u2014' : '+' + usd(r.annual - best)}</td>
        <td>${i === 0 ? '<span class="pill good">cheapest</span>' : ''}</td></tr>`).join('')}
      </tbody></table>
      <small class="help">Free-hours windows &mdash; nights ${win.s}:00\u2013${win.e}:00, weekends ${DOWN[weekend.sd]} ${weekend.sh}:00 \u2192 ${DOWN[weekend.ed]} ${weekend.eh}:59 &mdash; applied per plan as checked (N=nights, W=weekends); those hours are billed $0 energy (TDU delivery still applies to all kWh). +${(shiftPct * 100) | 0}% of daytime load shifted into free hours for marked plans. Credit applied when a month's total is at or above the min kWh.</small>`;
    const colors = ['#51cf66', '#4dabf7', '#ffd43b', '#ff922b', '#ff6b6b', '#b197fc', '#63e6be'];
    const labels = calcMonths.map(m => m.slice(2));
    if (planChart) planChart.destroy();
    planChart = new Chart(document.getElementById('planChart'), {
      type: 'line',
      data: { labels, datasets: results.map((r, i) => ({ label: r.name, data: r.monthly,
        borderColor: colors[i % colors.length], backgroundColor: colors[i % colors.length] + '22', tension: .3, pointRadius: 2 })) },
      options: { responsive: true, maintainAspectRatio: false,
        plugins: { title: { display: true, text: 'Estimated monthly bill by plan' }, tooltip: { callbacks: { label: c => c.dataset.label + ': ' + usd(c.raw) } } },
        scales: { y: { title: { display: true, text: '$ / month' } } } }
    });
  }
  ['nightStart', 'nightEnd', 'wStartDay', 'wStartHour', 'wEndDay', 'wEndHour', 'shift']
    .forEach(id => document.getElementById(id).oninput = () => { calc(); });
  document.getElementById('calc').onclick = calc;
  updateWin(); calc();
}
