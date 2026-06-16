// app.js — entry point: modal/upload flow, localStorage persistence, and render wiring.
import { parseIntervalCSV, CsvError } from './parse.js';
import { renderDashboard } from './dashboard.js';
import { initCalculator } from './calculator.js';

const STORAGE_KEY = 'tea_iv';
const SOURCE_KEY = 'tea_src';
const SAMPLE_URL = 'assets/sample/IntervalData2.csv';

// Chart.js global theming
Chart.defaults.color = '#8b98a5';
Chart.defaults.borderColor = '#2e3a47';
Chart.defaults.font.family = '-apple-system,Segoe UI,Roboto,sans-serif';

const $ = id => document.getElementById(id);
const modal = $('uploadModal');
const dashboard = $('dashboard');
const headerActions = $('headerActions');
const sampleBanner = $('sampleBanner');
const errorEl = $('modalError');
const loadingMsg = $('loadingMsg');

function showError(msg) { errorEl.textContent = msg; }
function clearError() { errorEl.textContent = ''; }
function setLoading(on) { loadingMsg.innerHTML = on ? '<span class="spinner"></span> Processing…' : ''; }

function render(IV, isSample) {
  modal.hidden = true;
  dashboard.hidden = false;
  headerActions.hidden = false;
  sampleBanner.hidden = !isSample;
  renderDashboard(IV);
  initCalculator(IV);
}

// Persist the compact aggregated IV (not the raw CSV) and reload to render cleanly.
function store(IV, source) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(IV));
    localStorage.setItem(SOURCE_KEY, source);
  } catch (e) {
    // localStorage may be full/unavailable — fall back to in-memory render.
    render(IV, source === 'sample');
    return;
  }
  location.reload();
}

async function handleText(text, source) {
  clearError();
  setLoading(true);
  // defer so the spinner can paint before the (synchronous) parse
  await new Promise(r => setTimeout(r, 20));
  try {
    const IV = parseIntervalCSV(text);
    store(IV, source);
  } catch (e) {
    setLoading(false);
    showError(e instanceof CsvError ? e.message : 'Could not read this file. Please upload a valid Smart Meter Texas interval CSV.');
  }
}

function handleFile(file) {
  if (!file) return;
  if (!/\.csv$/i.test(file.name) && file.type !== 'text/csv') {
    showError('Please choose a .csv file.');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => handleText(String(reader.result), 'upload');
  reader.onerror = () => showError('Failed to read the file.');
  reader.readAsText(file);
}

function resetToModal() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(SOURCE_KEY);
  location.reload();
}

/* ---- wire up controls ---- */
const dropzone = $('dropzone');
const fileInput = $('fileInput');
dropzone.onclick = () => fileInput.click();
$('chooseBtn').onclick = () => fileInput.click();
fileInput.onchange = e => handleFile(e.target.files[0]);

['dragenter', 'dragover'].forEach(ev => dropzone.addEventListener(ev, e => { e.preventDefault(); dropzone.classList.add('drag'); }));
['dragleave', 'drop'].forEach(ev => dropzone.addEventListener(ev, e => { e.preventDefault(); dropzone.classList.remove('drag'); }));
dropzone.addEventListener('drop', e => { if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); });

$('sampleBtn').onclick = async () => {
  clearError(); setLoading(true);
  try {
    const res = await fetch(SAMPLE_URL);
    if (!res.ok) throw new Error('fetch failed');
    const text = await res.text();
    await handleText(text, 'sample');
  } catch (e) {
    setLoading(false);
    showError('Could not load the sample data.');
  }
};

$('uploadNew').onclick = resetToModal;
$('bannerUpload').onclick = resetToModal;

/* ---- on load: hydrate from storage or show modal ---- */
(function init() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const IV = JSON.parse(saved);
      if (IV && IV.monthHour && IV.stats) {
        render(IV, localStorage.getItem(SOURCE_KEY) === 'sample');
        return;
      }
    } catch (e) { /* fall through to modal */ }
  }
  modal.hidden = false;
})();
