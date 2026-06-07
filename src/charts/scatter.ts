import * as d3 from 'd3';
import { showTooltip, hideTooltip } from '../tooltip.js';
import { setState, toggleSelected } from '../state.js';
import type {
  AppState,
  ChartContext,
  ChartHandle,
  Entry,
  EntryKey,
  ScatterConfig,
  ScatterMode,
} from '../types.js';

const MARGIN = { top: 12, right: 14, bottom: 36, left: 50 };

// Modovi rada — scatter chart sam zna kako mu izgleda kad je u nekom modu.
// Tab gumbi u UI-u samo postave state.scatterMode pa update() odlučuje.
const MODES: Record<ScatterMode, ScatterConfig> = {
  jt: {
    xKey: 'pointsJury',
    yKey: 'pointsTele',
    xLabel: 'Bodovi žirija',
    yLabel: 'Bodovi televotea',
  },
  yt: {
    xKey: 'youtubeViews',
    yKey: 'place',
    xLabel: 'YouTube pregledi',
    yLabel: 'Plasman u finalu',
    xLog: true,
    yInvert: true,
  },
};

interface ScatterDatum {
  e: Entry;
  x: number;
  y: number;
}

/**
 * Scatter chart s dva moda (žiri vs televote, YT pregledi vs plasman).
 * Mod se prebacuje promjenom `state.scatterMode` — chart se sam pretkonfigurira.
 */
export function createScatter(container: HTMLElement, ctx: ChartContext): ChartHandle {
  const { entries } = ctx;
  let cfg: ScatterConfig = resolveConfig('jt');

  const color = d3.scaleOrdinal<string>(d3.schemeTableau10);

  const svg = d3
    .select(container)
    .append('svg')
    .attr('role', 'img')
    .attr('aria-label', 'Scatter plot usporedba dvije metrike')
    .style('display', 'block')
    .style('width', '100%')
    .style('height', '100%');

  const g = svg.append('g');
  const gXAxis = g.append('g').attr('class', 'axis x-axis');
  const gYAxis = g.append('g').attr('class', 'axis y-axis');
  const gXLabel = g.append('text').attr('class', 'axis-label');
  const gYLabel = g.append('text').attr('class', 'axis-label');
  const gDots = g.append('g').attr('class', 'dots');
  const gMessage = g.append('g').attr('class', 'message');

  let size = measure();
  let currentState: AppState | null = null;

  const ro = new ResizeObserver(() => {
    size = measure();
    if (currentState) update(currentState);
  });
  ro.observe(container);

  function measure() {
    const r = container.getBoundingClientRect();
    return { width: r.width, height: r.height };
  }

  // Sastavi pun config iz mode-key-a, garantirajući da bool flagovi ne
  // "iscure" iz prethodnog moda (default na false pa MODES nadjača).
  function resolveConfig(mode: ScatterMode): ScatterConfig {
    return {
      xLog: false,
      yLog: false,
      xInvert: false,
      yInvert: false,
      ...MODES[mode],
    };
  }

  function update(state: AppState): void {
    currentState = state;
    // Reagiraj na promjenu moda iz state-a (single source of truth)
    cfg = resolveConfig(state.scatterMode);
    const { xKey, yKey, xLabel, yLabel, xLog, yLog, xInvert, yInvert } = cfg;
    if (state.yearFrom == null || state.yearTo == null) return;

    const data: ScatterDatum[] = entries
      .filter(
        (e) =>
          e.qualified !== false &&
          e.year >= state.yearFrom! &&
          e.year <= state.yearTo!,
      )
      .map((e) => ({
        e,
        x: (e as unknown as Record<EntryKey, number | null>)[xKey] as number,
        y: (e as unknown as Record<EntryKey, number | null>)[yKey] as number,
      }))
      .filter(
        (d) =>
          d.x != null &&
          d.y != null &&
          Number.isFinite(d.x) &&
          Number.isFinite(d.y) &&
          (!xLog || d.x > 0) &&
          (!yLog || d.y > 0),
      );

    const W = size.width;
    const H = size.height;
    const innerW = W - MARGIN.left - MARGIN.right;
    const innerH = H - MARGIN.top - MARGIN.bottom;
    svg.attr('viewBox', `0 0 ${W} ${H}`);
    g.attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

    if (data.length === 0) {
      gXAxis.selectAll('*').remove();
      gYAxis.selectAll('*').remove();
      gDots.selectAll('*').remove();
      gMessage.selectAll('*').remove();
      gMessage
        .append('text')
        .attr('x', innerW / 2)
        .attr('y', innerH / 2)
        .attr('text-anchor', 'middle')
        .style('fill', 'var(--muted)')
        .style('font-size', '12px')
        .text('Nema podataka za odabrani raspon.');
      gXLabel.text('');
      gYLabel.text('');
      return;
    }
    gMessage.selectAll('*').remove();

    const xDomain = d3.extent(data, (d) => d.x) as [number, number];
    const yDomain = d3.extent(data, (d) => d.y) as [number, number];

    const xScale = (
      xLog
        ? d3.scaleLog().domain([Math.max(1, xDomain[0]), xDomain[1]])
        : d3.scaleLinear().domain(xDomain).nice()
    ).range(xInvert ? [innerW, 0] : [0, innerW]);

    const yScale = (
      yLog
        ? d3.scaleLog().domain([Math.max(1, yDomain[0]), yDomain[1]])
        : d3.scaleLinear().domain(yDomain).nice()
    ).range(yInvert ? [0, innerH] : [innerH, 0]);

    const xAxisGen = d3.axisBottom(xScale).ticks(5, xLog ? '~s' : undefined);
    gXAxis
      .attr('transform', `translate(0,${innerH})`)
      .transition()
      .duration(300)
      .call(xAxisGen as never);

    const yAxisGen = d3.axisLeft(yScale).ticks(5);
    gYAxis.transition().duration(300).call(yAxisGen as never);

    gXLabel
      .attr('x', innerW / 2)
      .attr('y', innerH + 30)
      .attr('text-anchor', 'middle')
      .style('fill', 'var(--muted)')
      .style('font-size', '11px')
      .text(xLabel);

    gYLabel
      .attr('transform', `translate(-38, ${innerH / 2}) rotate(-90)`)
      .attr('text-anchor', 'middle')
      .style('fill', 'var(--muted)')
      .style('font-size', '11px')
      .text(yLabel);

    const hasSelection = state.selectedCountries.size > 0;

    const dots = gDots
      .selectAll<SVGCircleElement, ScatterDatum>('circle.dot')
      .data(data, (d) => `${d.e.year}-${d.e.countryCode}`);

    dots.exit().transition().duration(200).attr('r', 0).remove();

    const dotsEnter = dots
      .enter()
      .append('circle')
      .attr('class', 'dot')
      .attr('r', 0)
      .on('mousemove', onHover)
      .on('mouseleave', () => hideTooltip())
      .on('click', (_event: MouseEvent, d: ScatterDatum) =>
        setState({ selectedCountries: toggleSelected(d.e.countryCode) }),
      );

    dotsEnter
      .merge(dots)
      .attr('fill', (d) => color(d.e.countryCode))
      .classed('selected', (d) => state.selectedCountries.has(d.e.countryCode))
      .classed(
        'dim',
        (d) => hasSelection && !state.selectedCountries.has(d.e.countryCode),
      )
      .style('pointer-events', (d) =>
        hasSelection && !state.selectedCountries.has(d.e.countryCode) ? 'none' : 'auto',
      )
      .transition()
      .duration(500)
      .ease(d3.easeCubicOut)
      .delay((_d, i) => Math.min(i * 4, 400))
      .attr('cx', (d) => xScale(d.x))
      .attr('cy', (d) => yScale(d.y))
      .attr('r', (d) => (state.selectedCountries.has(d.e.countryCode) ? 6 : 4));
  }

  function onHover(event: MouseEvent, d: ScatterDatum): void {
    const { xKey, yKey, xLabel, yLabel } = cfg;
    showTooltip(
      `<strong>${d.e.country} &mdash; ${d.e.year}</strong><br/>` +
        `${d.e.performer ?? ''}<br/>` +
        `<em>${d.e.song ?? ''}</em><br/>` +
        `${xLabel}: <strong>${formatVal(xKey, d.x)}</strong><br/>` +
        `${yLabel}: <strong>${formatVal(yKey, d.y)}</strong>`,
      event,
    );
  }

  function formatVal(key: EntryKey, v: number | null): string {
    if (v == null) return '–';
    if (key === 'youtubeViews') return v.toLocaleString('hr-HR');
    if (key === 'place') return `${v}.`;
    return `${v}`;
  }

  return { update };
}
