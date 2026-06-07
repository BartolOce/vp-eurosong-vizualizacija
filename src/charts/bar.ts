import * as d3 from 'd3';
import { setState, toggleSelected } from '../state.js';
import { AGGREGATE_METRICS, aggregateByCountry, filterByYears } from '../metrics.js';
import { showTooltip, hideTooltip } from '../tooltip.js';
import type { AppState, ChartContext, ChartHandle, CountryAggregate } from '../types.js';

const TOP_N = 8;
const MARGIN = { top: 10, right: 60, bottom: 20, left: 130 };

/**
 * Stupčasti dijagram top N zemalja po odabranoj metrici.
 * Označene zemlje koje nisu u top N se dodaju na dno (sortirane po metrici).
 */
export function createBar(container: HTMLElement, ctx: ChartContext): ChartHandle {
  const { entries } = ctx;

  const svg = d3
    .select(container)
    .append('svg')
    .attr('role', 'img')
    .attr('aria-label', 'Stupčasti dijagram top zemalja')
    .style('display', 'block')
    .style('width', '100%')
    .style('height', '100%');

  const g = svg.append('g');
  const gBars = g.append('g').attr('class', 'bars');
  const gYAxis = g.append('g').attr('class', 'axis y-axis');
  const gXAxis = g.append('g').attr('class', 'axis x-axis');

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

  function update(state: AppState): void {
    currentState = state;
    const filtered = filterByYears(entries, state);
    const metric = AGGREGATE_METRICS[state.metric];
    const byCountry = aggregateByCountry(filtered, state.metric);

    const allSorted = [...byCountry.values()]
      .filter((d) => Number.isFinite(d.value))
      .sort((a, b) =>
        metric.higherIsBetter
          ? d3.descending(a.value, b.value)
          : d3.ascending(a.value, b.value),
      );

    // Top N + označene zemlje izvan top N (sortirane po istoj metrici)
    const sorted = allSorted.slice(0, TOP_N);
    const inSorted = new Set(sorted.map((d) => d.countryCode));
    const extras: CountryAggregate[] = [];
    for (const code of state.selectedCountries) {
      if (inSorted.has(code)) continue;
      const extra = allSorted.find((d) => d.countryCode === code);
      if (extra) extras.push(extra);
    }
    extras.sort((a, b) =>
      metric.higherIsBetter
        ? d3.descending(a.value, b.value)
        : d3.ascending(a.value, b.value),
    );
    sorted.push(...extras);

    const W = size.width;
    const H = size.height;
    const innerW = W - MARGIN.left - MARGIN.right;
    const innerH = H - MARGIN.top - MARGIN.bottom;

    svg.attr('viewBox', `0 0 ${W} ${H}`);
    g.attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

    const xMax = d3.max(sorted, (d) => d.value) ?? 1;

    // Za "manje = bolje" metrike koristimo apsolutni worst (scaleMax) kao
    // anchor da širine ostanu proporcionalne stvarnoj razlici.
    const refMax = metric.scaleMax ?? xMax;
    const x = metric.higherIsBetter
      ? d3.scaleLinear().domain([0, xMax]).nice().range([0, innerW])
      : d3.scaleLinear().domain([0, refMax]).range([0, innerW]);
    const barLen = (v: number): number =>
      metric.higherIsBetter ? x(v) : Math.max(2, x(refMax - v));

    const y = d3
      .scaleBand<string>()
      .domain(sorted.map((d) => d.countryCode))
      .range([0, innerH])
      .padding(0.18);

    if (metric.higherIsBetter) {
      gXAxis
        .attr('transform', `translate(0,${innerH})`)
        .transition()
        .duration(400)
        .call(d3.axisBottom(x).ticks(4).tickSize(-innerH) as never);
    } else {
      gXAxis
        .attr('transform', `translate(0,${innerH})`)
        .transition()
        .duration(400)
        .call(d3.axisBottom(x).ticks(0).tickSize(0) as never);
    }

    gYAxis
      .transition()
      .duration(400)
      .call(
        d3.axisLeft(y).tickFormat((code) => {
          const row = sorted.find((d) => d.countryCode === code);
          return row ? row.country : (code as string);
        }) as never,
      );

    gYAxis
      .selectAll('.tick text')
      .style('cursor', 'pointer')
      .on('click', (_event: MouseEvent, code: unknown) => {
        setState({ selectedCountries: toggleSelected(code as string) });
      });

    const bars = gBars
      .selectAll<SVGRectElement, CountryAggregate>('rect.bar')
      .data(sorted, (d) => d.countryCode);

    bars.exit().transition().duration(300).attr('width', 0).remove();

    const barsEnter = bars
      .enter()
      .append('rect')
      .attr('class', 'bar')
      .attr('x', 0)
      .attr('y', (d) => y(d.countryCode) ?? 0)
      .attr('height', y.bandwidth())
      .attr('width', 0)
      .on('mousemove', onHover)
      .on('mouseleave', onLeave)
      .on('click', onClick);

    barsEnter
      .merge(bars)
      .classed('selected', (d) => state.selectedCountries.has(d.countryCode))
      .transition()
      .duration(500)
      .ease(d3.easeCubicOut)
      .delay((_d, i) => i * 35)
      .attr('y', (d) => y(d.countryCode) ?? 0)
      .attr('height', y.bandwidth())
      .attr('width', (d) => barLen(d.value));

    const labels = gBars
      .selectAll<SVGTextElement, CountryAggregate>('text.value')
      .data(sorted, (d) => d.countryCode);

    labels.exit().remove();

    const labelsEnter = labels
      .enter()
      .append('text')
      .attr('class', 'value')
      .attr('x', 0)
      .attr('y', (d) => (y(d.countryCode) ?? 0) + y.bandwidth() / 2)
      .attr('dy', '0.35em')
      .attr('dx', 6)
      .style('fill', 'var(--text)')
      .style('font-size', '11px');

    labelsEnter
      .merge(labels)
      .text((d) => metric.format(d.value))
      .transition()
      .duration(500)
      .ease(d3.easeCubicOut)
      .delay((_d, i) => i * 35)
      .attr('x', (d) => barLen(d.value))
      .attr('y', (d) => (y(d.countryCode) ?? 0) + y.bandwidth() / 2);
  }

  function onHover(event: MouseEvent, d: CountryAggregate): void {
    if (!currentState) return;
    const metric = AGGREGATE_METRICS[currentState.metric];
    showTooltip(
      `<strong>${d.country}</strong><br/>${metric.label}: <strong>${metric.format(d.value)}</strong><br/>` +
        `Nastupa u rasponu: ${d.entries.length}`,
      event,
    );
  }

  function onLeave(): void {
    hideTooltip();
  }

  function onClick(_event: MouseEvent, d: CountryAggregate): void {
    setState({ selectedCountries: toggleSelected(d.countryCode) });
  }

  return { update };
}
