import * as d3 from 'd3';
import { showTooltip, hideTooltip } from '../tooltip.js';
import { setState, toggleSelected } from '../state.js';
import { AGGREGATE_METRICS, aggregateByCountry } from '../metrics.js';
import type { AppState, ChartContext, ChartHandle, Entry } from '../types.js';

const MARGIN = { top: 12, right: 16, bottom: 26, left: 50 };
const TOP_COUNTRIES = 5; // manje od bar charta (8) za bolju čitljivost
const SKIP_YEARS = new Set<number>([2020]); // Eurovision 2020 otkazan (COVID)
const DNQ_PAD = 2; // koliko jedinica ispod maxPlace rezerviramo za "drugo" red

const color = d3.scaleOrdinal<string>(d3.schemeTableau10);

type NodeKind = 'qualified' | 'dnq' | 'absent';
interface SeriesNode {
  year: number;
  kind: NodeKind;
  entry?: Entry;
}
interface Series {
  countryCode: string;
  country: string;
  nodes: SeriesNode[];
}

interface PointDatum {
  countryCode: string;
  country: string;
  year: number;
  place: number;
  points: number | null;
  performer: string | null;
  song: string | null;
}

interface MissDatum {
  countryCode: string;
  country: string;
  year: number;
  kind: NodeKind;
  performer: string | null;
  song: string | null;
}

/**
 * Linijski prikaz plasmana kroz godine za top N zemalja (po istoj metrici
 * kao bar). DNQ / nesudjelovanje se crta u "drugo" redu unutar y-skale.
 */
export function createLine(container: HTMLElement, ctx: ChartContext): ChartHandle {
  const { entries } = ctx;

  container.style.display = 'flex';
  container.style.flexDirection = 'column';

  const svgWrap = document.createElement('div');
  svgWrap.className = 'line-svg-wrap';
  svgWrap.style.flex = '1';
  svgWrap.style.minHeight = '0';
  svgWrap.style.position = 'relative';
  container.appendChild(svgWrap);

  const legendEl = document.createElement('div');
  legendEl.className = 'line-legend-chips';
  container.appendChild(legendEl);

  const svg = d3
    .select(svgWrap)
    .append('svg')
    .attr('role', 'img')
    .attr('aria-label', 'Linijski dijagram plasmana zemalja kroz godine')
    .style('display', 'block')
    .style('width', '100%')
    .style('height', '100%');

  const g = svg.append('g');
  const gXAxis = g.append('g').attr('class', 'axis x-axis');
  const gYAxis = g.append('g').attr('class', 'axis y-axis');
  const gGrid = g.append('g').attr('class', 'gridline');
  const gLines = g.append('g').attr('class', 'lines');
  const gPoints = g.append('g').attr('class', 'points');
  const gMissing = g.append('g').attr('class', 'missing');

  let size = measure();
  let currentState: AppState | null = null;

  const ro = new ResizeObserver(() => {
    size = measure();
    if (currentState) update(currentState);
  });
  ro.observe(svgWrap);

  function measure() {
    const r = svgWrap.getBoundingClientRect();
    return { width: r.width, height: r.height };
  }

  function update(state: AppState): void {
    currentState = state;
    renderLines(state);
  }

  function renderLines(state: AppState): void {
    if (state.yearFrom == null || state.yearTo == null) return;

    const rangeEntries = entries.filter(
      (e) => e.year >= state.yearFrom! && e.year <= state.yearTo!,
    );
    const qualifiedInRange = rangeEntries.filter((e) => e.qualified !== false);

    const metric = AGGREGATE_METRICS[state.metric];
    let topCodes: Set<string>;
    if (state.lineOnlySelected && state.selectedCountries.size > 0) {
      topCodes = new Set(state.selectedCountries);
    } else {
      const byCountry = aggregateByCountry(qualifiedInRange, state.metric);
      const ranked = [...byCountry.values()]
        .filter((d) => Number.isFinite(d.value))
        .sort((a, b) =>
          metric.higherIsBetter
            ? d3.descending(a.value, b.value)
            : d3.ascending(a.value, b.value),
        );
      topCodes = new Set(ranked.slice(0, TOP_COUNTRIES).map((d) => d.countryCode));
      for (const c of state.selectedCountries) topCodes.add(c);
    }

    const yearsAll = d3
      .range(state.yearFrom, state.yearTo + 1)
      .filter((y) => !SKIP_YEARS.has(y));
    const nameByCode = new Map(entries.map((e) => [e.countryCode, e.country]));

    const entryByCY = new Map<string, Entry>();
    for (const e of rangeEntries) entryByCY.set(`${e.countryCode}-${e.year}`, e);

    const series: Series[] = [];
    for (const code of topCodes) {
      const countryName = nameByCode.get(code) ?? code;
      const nodes: SeriesNode[] = yearsAll.map((y) => {
        const e = entryByCY.get(`${code}-${y}`);
        if (e && e.qualified) return { year: y, kind: 'qualified', entry: e };
        if (e) return { year: y, kind: 'dnq', entry: e };
        return { year: y, kind: 'absent' };
      });
      series.push({ countryCode: code, country: countryName, nodes });
    }

    const W = size.width;
    const H = size.height;
    const innerW = W - MARGIN.left - MARGIN.right;
    const innerH = H - MARGIN.top - MARGIN.bottom;
    svg.attr('viewBox', `0 0 ${W} ${H}`);
    g.attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

    const x = d3
      .scaleLinear()
      .domain([state.yearFrom, state.yearTo])
      .range([0, innerW]);
    const maxPlace = d3.max(qualifiedInRange, (e) => e.place ?? 0) ?? 26;
    // y-skala uključuje "drugo" red ispod maxPlace
    const dnqRow = maxPlace + DNQ_PAD;
    const y = d3.scaleLinear().domain([1, dnqRow]).range([0, innerH]);
    const dnqY = y(dnqRow);

    const nodeY = (node: SeriesNode): number =>
      node.kind === 'qualified' && node.entry?.place != null
        ? y(node.entry.place)
        : dnqY;

    gXAxis
      .attr('transform', `translate(0,${innerH})`)
      .transition()
      .duration(400)
      .call(
        d3.axisBottom(x).tickValues(yearsAll).tickFormat(d3.format('d')) as never,
      );

    // Standardni y tick values + posebni "drugo" tick za DNQ red
    const stdTicks = d3
      .range(5, maxPlace + 1, 5)
      .concat(maxPlace > 1 ? [1] : [])
      .sort((a, b) => a - b);
    const yTickValues = [...stdTicks, dnqRow];

    gYAxis
      .transition()
      .duration(400)
      .call(
        d3
          .axisLeft(y)
          .tickValues(yTickValues)
          .tickFormat((d) => (+d === dnqRow ? 'drugo' : `${d}.`)) as never,
      );

    // Grid linije — bez linije za "drugo" red da ne sugerira da je to plasman
    gGrid
      .transition()
      .duration(400)
      .call(
        d3
          .axisLeft(y)
          .tickValues(stdTicks)
          .tickSize(-innerW)
          .tickFormat(() => '') as never,
      );

    const line = d3
      .line<SeriesNode>()
      .x((d) => x(d.year))
      .y((d) => nodeY(d));

    const POINT_REVEAL_MS = 380;
    const LINE_DELAY_MS = 320;
    const LINE_DRAW_MS = 1300;

    const lines = gLines
      .selectAll<SVGPathElement, Series>('path.line')
      .data(series, (d) => d.countryCode);
    lines.exit().remove();
    const linesEnter = lines
      .enter()
      .append('path')
      .attr('class', 'line')
      .attr('fill', 'none');

    const hasSelection = state.selectedCountries.size > 0;

    // Enter i update tretiramo identično da se sve linije uvijek re-animiraju
    const allLines = linesEnter.merge(lines);

    allLines
      .attr('stroke', (d) => color(d.countryCode))
      .classed('selected', (d) => state.selectedCountries.has(d.countryCode))
      .classed(
        'dim',
        (d) => hasSelection && !state.selectedCountries.has(d.countryCode),
      )
      .attr('d', (d) => line(d.nodes))
      .each(function () {
        const len = this.getTotalLength();
        const sel = d3.select(this);
        // interrupt() poništava in-flight tranziciju (brza promjena metrike)
        sel
          .interrupt('line-draw')
          .attr('stroke-dasharray', `${len} ${len}`)
          .attr('stroke-dashoffset', len)
          .transition('line-draw')
          .delay(LINE_DELAY_MS)
          .duration(LINE_DRAW_MS)
          .ease(d3.easeCubicOut)
          .attr('stroke-dashoffset', 0);
        setTimeout(
          () => sel.attr('stroke-dasharray', null),
          LINE_DELAY_MS + LINE_DRAW_MS + 50,
        );
      });

    const allPoints: PointDatum[] = series.flatMap((s) =>
      s.nodes
        .filter((n): n is SeriesNode & { kind: 'qualified'; entry: Entry } =>
          n.kind === 'qualified' && n.entry != null && n.entry.place != null,
        )
        .map((n) => ({
          countryCode: s.countryCode,
          country: s.country,
          year: n.year,
          place: n.entry.place as number,
          points: n.entry.points,
          performer: n.entry.performer,
          song: n.entry.song,
        })),
    );

    const missing: MissDatum[] = series.flatMap((s) =>
      s.nodes
        .filter((n) => n.kind !== 'qualified')
        .map((n) => ({
          countryCode: s.countryCode,
          country: s.country,
          year: n.year,
          kind: n.kind,
          performer: n.entry?.performer ?? null,
          song: n.entry?.song ?? null,
        })),
    );

    const pts = gPoints
      .selectAll<SVGCircleElement, PointDatum>('circle.pt')
      .data(allPoints, (d) => `${d.countryCode}-${d.year}`);
    pts.exit().remove();
    const ptsEnter = pts
      .enter()
      .append('circle')
      .attr('class', 'pt')
      .attr('r', 0)
      .on('mousemove', onPointHover)
      .on('mouseleave', () => hideTooltip())
      .on('click', (_event: MouseEvent, d: PointDatum) =>
        setState({ selectedCountries: toggleSelected(d.countryCode) }),
      );

    ptsEnter
      .merge(pts)
      .attr('fill', (d) => color(d.countryCode))
      .classed('selected', (d) => state.selectedCountries.has(d.countryCode))
      .classed(
        'dim',
        (d) => hasSelection && !state.selectedCountries.has(d.countryCode),
      )
      .style('pointer-events', (d) =>
        hasSelection && !state.selectedCountries.has(d.countryCode) ? 'none' : 'auto',
      )
      .transition()
      .duration(POINT_REVEAL_MS)
      .ease(d3.easeCubicOut)
      .attr('cx', (d) => x(d.year))
      .attr('cy', (d) => y(d.place))
      .attr('r', 3.5);

    const miss = gMissing
      .selectAll<SVGCircleElement, MissDatum>('circle.miss')
      .data(missing, (d) => `${d.countryCode}-${d.year}`);
    miss.exit().remove();
    const missEnter = miss
      .enter()
      .append('circle')
      .attr('class', 'miss')
      .attr('r', 0)
      .on('mousemove', onMissHover)
      .on('mouseleave', () => hideTooltip())
      .on('click', (_event: MouseEvent, d: MissDatum) =>
        setState({ selectedCountries: toggleSelected(d.countryCode) }),
      );

    missEnter
      .merge(miss)
      .attr('fill', (d) =>
        state.selectedCountries.has(d.countryCode)
          ? color(d.countryCode)
          : 'var(--no-data)',
      )
      .classed('selected', (d) => state.selectedCountries.has(d.countryCode))
      .style('pointer-events', (d) =>
        hasSelection && !state.selectedCountries.has(d.countryCode) ? 'none' : 'auto',
      )
      .style('opacity', (d) => {
        if (hasSelection && !state.selectedCountries.has(d.countryCode)) return 0.12;
        return state.selectedCountries.has(d.countryCode) ? 0.85 : 0.45;
      })
      .transition()
      .duration(400)
      .attr('cx', (d) => x(d.year))
      .attr('cy', dnqY)
      .attr('r', 3);

    renderLegend(series, state);
  }

  function renderLegend(series: Series[], state: AppState): void {
    const hasSelection = state.selectedCountries.size > 0;
    legendEl.innerHTML = series
      .map(
        (s) => `
        <span class="line-chip${state.selectedCountries.has(s.countryCode) ? ' selected' : ''}${hasSelection && !state.selectedCountries.has(s.countryCode) ? ' dim' : ''}"
              data-code="${s.countryCode}">
          <span class="dot" style="background:${color(s.countryCode)}"></span>
          ${s.country}
        </span>`,
      )
      .join('');
  }

  legendEl.addEventListener('click', (e) => {
    const target = e.target as HTMLElement | null;
    const chip = target?.closest('.line-chip') as HTMLElement | null;
    if (!chip) return;
    const code = chip.dataset.code;
    if (code) setState({ selectedCountries: toggleSelected(code) });
  });

  function onMissHover(event: MouseEvent, d: MissDatum): void {
    let body: string;
    if (d.kind === 'absent') {
      body = '<span style="color: var(--muted)">Nije sudjelovala te godine</span>';
    } else {
      const songLine =
        d.performer || d.song
          ? `${d.performer ?? ''}${d.performer && d.song ? ' — ' : ''}<em>${d.song ?? ''}</em><br/>`
          : '';
      body = `${songLine}<span style="color: var(--muted)">Nije prošla polufinale</span>`;
    }
    showTooltip(`<strong>${d.country} &mdash; ${d.year}</strong><br/>${body}`, event);
  }

  function onPointHover(event: MouseEvent, d: PointDatum): void {
    showTooltip(
      `<strong>${d.country} &mdash; ${d.year}</strong><br/>` +
        `${d.performer ?? ''}<br/>` +
        `<em>${d.song ?? ''}</em><br/>` +
        `Plasman: <strong>${d.place}.</strong> &middot; Bodovi: <strong>${d.points ?? '–'}</strong>`,
      event,
    );
  }

  return { update };
}
