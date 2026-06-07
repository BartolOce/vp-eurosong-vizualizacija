/// <reference types="vite/client" />
import * as d3 from 'd3';
import { getState, setState, subscribe, toggleSelected } from './state.js';
import { AGGREGATE_METRICS } from './metrics.js';
import { initCountryColors, countryColor } from './colors.js';
import { createMap } from './charts/map.js';
import { createBar } from './charts/bar.js';
import { createLine } from './charts/line.js';
import { createScatter } from './charts/scatter.js';
import { moveTooltip } from './tooltip.js';
import type {
  AppState,
  ChartHandle,
  Entry,
  EuropeTopology,
  MetricKey,
  ScatterMode,
} from './types.js';

async function main(): Promise<void> {
  window.addEventListener('mousemove', (e) => moveTooltip(e));

  for (const id of ['chart-map', 'chart-bar', 'chart-line', 'chart-scatter']) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '<div class="loading">Učitavam podatke…</div>';
  }

  let entries: Entry[] | undefined;
  let topology: EuropeTopology | undefined;
  try {
    // Izvori podataka (obrađeni offline, pohranjeni u public/data/):
    //  - entries.json: rezultati iz Spijkervet/eurovision-dataset
    //    (https://github.com/Spijkervet/eurovision-dataset) + broj pregleda s YouTubea
    //  - europe.topo.json: granice država (TopoJSON) iz leakyMirror/map-of-europe
    //    (https://github.com/leakyMirror/map-of-europe)
    [entries, topology] = await Promise.all([
      d3.json<Entry[]>(`${import.meta.env.BASE_URL}data/entries.json`),
      d3.json<EuropeTopology>(`${import.meta.env.BASE_URL}data/europe.topo.json`),
    ]);
    if (!entries || !topology) throw new Error('Nedostaju podaci');
  } catch (err) {
    console.error(err);
    for (const id of ['chart-map', 'chart-bar', 'chart-line', 'chart-scatter']) {
      const el = document.getElementById(id);
      if (el)
        el.innerHTML =
          '<div class="loading">Greška kod učitavanja podataka iz <code>public/data/</code>.</div>';
    }
    return;
  }

  bootstrap(entries, topology);
}

function bootstrap(entries: Entry[], topology: EuropeTopology): void {
  initCountryColors(entries);
  const years = Array.from(new Set(entries.map((e) => e.year))).sort((a, b) => a - b);
  const yearMin = years[0];
  const yearMax = years[years.length - 1];

  setState({
    yearFrom: yearMin,
    yearTo: yearMax,
    metric: 'totalPoints',
    selectedCountries: new Set<string>(),
    scatterMode: 'jt',
  });

  initControls({ yearMin, yearMax, entries });

  for (const id of ['chart-map', 'chart-bar', 'chart-line', 'chart-scatter']) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '';
  }

  const ctx = { entries, topology };
  const chartList: ChartHandle[] = [
    createMap(document.getElementById('chart-map') as HTMLElement, ctx),
    createBar(document.getElementById('chart-bar') as HTMLElement, ctx),
    createLine(document.getElementById('chart-line') as HTMLElement, ctx),
    createScatter(document.getElementById('chart-scatter') as HTMLElement, ctx),
  ];

  function renderAll(state: AppState): void {
    for (const c of chartList) c.update(state);
  }

  renderAll(getState());
  subscribe((state) => renderAll(state));
}

interface ControlOpts {
  yearMin: number;
  yearMax: number;
  entries: Entry[];
}

function initControls({ yearMin, yearMax, entries }: ControlOpts): void {
  const metricSel = document.getElementById('metric-select') as HTMLSelectElement;
  metricSel.innerHTML = Object.values(AGGREGATE_METRICS)
    .map((m) => `<option value="${m.key}">${m.label}</option>`)
    .join('');
  metricSel.value = getState().metric;
  metricSel.addEventListener('change', () =>
    setState({ metric: metricSel.value as MetricKey }),
  );

  // Minimalni razmak između godina (yTo - yFrom). Vrijednost 2 znači da je
  // najmanji dozvoljeni raspon npr. 2016–2018 (tri godine inclusive).
  const MIN_YEAR_GAP = 2;

  // Oba slidera imaju ISTI min/max raspon (yearMin..yearMax) da im pozicije
  // thumbova budu identično mapirane u piksele. Razmak se osigurava clampingom
  // vrijednosti na input event-u, ne mijenjanjem min/max-a.
  const yFrom = document.getElementById('year-from') as HTMLInputElement;
  const yTo = document.getElementById('year-to') as HTMLInputElement;
  yFrom.min = yTo.min = String(yearMin);
  yFrom.max = yTo.max = String(yearMax);
  yFrom.value = String(yearMin);
  yTo.value = String(yearMax);

  const label = document.getElementById('year-range-label') as HTMLElement;
  const updateLabel = () => {
    label.textContent = `${yFrom.value} – ${yTo.value}`;
  };
  updateLabel();

  yFrom.addEventListener('input', () => {
    // Clamp: yFrom ne smije doći bliže od MIN_YEAR_GAP do yTo
    const maxAllowed = +yTo.value - MIN_YEAR_GAP;
    if (+yFrom.value > maxAllowed) yFrom.value = String(maxAllowed);
    setState({ yearFrom: +yFrom.value });
    updateLabel();
  });
  yTo.addEventListener('input', () => {
    const minAllowed = +yFrom.value + MIN_YEAR_GAP;
    if (+yTo.value < minAllowed) yTo.value = String(minAllowed);
    setState({ yearTo: +yTo.value });
    updateLabel();
  });

  const countries = Array.from(
    new Map(entries.map((d) => [d.countryCode, d.country])).entries(),
  ).sort((a, b) => d3.ascending(a[1], b[1]));
  initChips(countries);

  const lineOnly = document.getElementById('line-only-selected') as HTMLInputElement;
  const updateLineToggle = () => {
    const sel = getState().selectedCountries;
    lineOnly.disabled = sel.size === 0;
    if (sel.size === 0) lineOnly.checked = false;
  };
  lineOnly.addEventListener('change', () =>
    setState({ lineOnlySelected: lineOnly.checked }),
  );

  initScatterTabs();

  subscribe(() => {
    updateLineToggle();
  });
  updateLineToggle();

  const resetBtn = document.getElementById('reset-btn') as HTMLButtonElement;
  resetBtn.addEventListener('click', () => {
    yFrom.value = String(yearMin);
    yTo.value = String(yearMax);
    metricSel.value = 'totalPoints';
    lineOnly.checked = false;
    updateLabel();
    setState({
      yearFrom: yearMin,
      yearTo: yearMax,
      metric: 'totalPoints',
      selectedCountries: new Set<string>(),
      lineOnlySelected: false,
      scatterMode: 'jt',
    });
    document
      .querySelectorAll<HTMLElement>('.scatter-tab')
      .forEach((b) => b.classList.toggle('active', b.dataset.mode === 'jt'));
  });
}

function initChips(countries: [string, string][]): void {
  const root = document.getElementById('selected-chips') as HTMLElement;
  const nameOf = new Map(countries);

  function render(): void {
    const sel = getState().selectedCountries;
    if (sel.size === 0) {
      root.innerHTML =
        '<span class="chips-empty">klikni zemlju na karti, stupcu ili točki</span>';
      return;
    }
    root.innerHTML = [...sel]
      .sort((a, b) => d3.ascending(nameOf.get(a) ?? a, nameOf.get(b) ?? b))
      .map(
        (code) => `
        <span class="chip" data-code="${code}">
          <span class="chip-color" style="background:${countryColor(code)}"></span>
          ${nameOf.get(code) ?? code}
          <button type="button" data-remove="${code}" aria-label="Ukloni">×</button>
        </span>`,
      )
      .join('');
  }

  root.addEventListener('click', (e) => {
    const target = e.target as HTMLElement | null;
    const btn = target?.closest('button[data-remove]') as HTMLButtonElement | null;
    if (!btn) return;
    const code = btn.dataset.remove;
    if (code) setState({ selectedCountries: toggleSelected(code) });
  });

  subscribe(() => render());
  render();
}

function initScatterTabs(): void {
  const tabs = document.querySelectorAll<HTMLElement>('.scatter-tab');
  tabs.forEach((t) => {
    t.addEventListener('click', () => {
      const mode = t.dataset.mode as ScatterMode | undefined;
      if (!mode) return;
      tabs.forEach((b) => b.classList.toggle('active', b === t));
      setState({ scatterMode: mode });
    });
  });
}

main();
