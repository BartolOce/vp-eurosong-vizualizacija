import * as d3 from 'd3';
import * as topojson from 'topojson-client';
import { setState, toggleSelected } from '../state.js';
import { AGGREGATE_METRICS, aggregateByCountry, filterByYears } from '../metrics.js';
import { showTooltip, hideTooltip } from '../tooltip.js';
import type {
  AggregateMetric,
  AppState,
  ChartContext,
  ChartHandle,
  CountryAggregate,
} from '../types.js';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { GeometryCollection, Topology } from 'topojson-specification';

type CountryFeature = Feature<Geometry, { NAME: string }> & { id: string };
type LegendArgs = [
  d3.ScaleSequential<string>,
  [number, number] | [undefined, undefined],
  AggregateMetric,
];

/**
 * Choropleth karta Europe — boja zemlje skalirana po odabranoj metrici.
 * Klik na zemlju s podacima toggla selekciju (sve preko zajedničkog state-a).
 */
export function createMap(container: HTMLElement, ctx: ChartContext): ChartHandle {
  const { entries, topology } = ctx;
  const topo = topology as unknown as Topology;
  const featureCollection = topojson.feature(
    topo,
    topo.objects.europe as GeometryCollection,
  ) as unknown as FeatureCollection<Geometry, { NAME: string }>;

  const svg = d3
    .select(container)
    .append('svg')
    .attr('class', 'map-svg')
    .attr('role', 'img')
    .attr('aria-label', 'Karta Europe — choropleth po odabranoj metrici')
    .style('display', 'block')
    .style('width', '100%')
    .style('height', '100%');

  const gCountries = svg.append('g').attr('class', 'countries');
  const gLegend = svg.append('g').attr('class', 'legend');

  let size = measure();
  const projection = d3.geoMercator();
  let path = d3.geoPath(projection);

  fitProjection();
  draw();

  const ro = new ResizeObserver(() => {
    size = measure();
    if (size.width === 0 || size.height === 0) return;
    fitProjection();
    redraw();
  });
  ro.observe(container);

  let currentState: AppState | null = null;
  let lastLegend: LegendArgs | null = null;

  function fitProjection(): void {
    projection.fitSize([size.width, size.height], featureCollection);
    path = d3.geoPath(projection);
  }

  function measure() {
    const r = container.getBoundingClientRect();
    return { width: r.width, height: r.height };
  }

  function draw(): void {
    svg.attr('viewBox', `0 0 ${size.width} ${size.height}`);
    const sel = gCountries
      .selectAll<SVGPathElement, CountryFeature>('path.country')
      .data(featureCollection.features as CountryFeature[], (d) => d.id);

    // Stagger reveal: zapad→istok prema centroidu zemlje
    sel
      .enter()
      .append('path')
      .attr('class', 'country')
      .attr('d', (d) => path(d) ?? '')
      .style('opacity', 0)
      .on('mousemove', onHover)
      .on('mouseleave', onLeave)
      .on('click', onClick)
      .transition()
      .delay((d) => {
        const c = path.centroid(d);
        return Number.isFinite(c[0]) ? Math.min(800, c[0] * 1.6) : 0;
      })
      .duration(500)
      .ease(d3.easeCubicOut)
      .style('opacity', 1);

    sel.attr('d', (d) => path(d) ?? '');
  }

  function redraw(): void {
    gCountries
      .selectAll<SVGPathElement, CountryFeature>('path.country')
      .attr('d', (d) => path(d) ?? '');
    if (lastLegend) drawLegend(...lastLegend);
  }

  function update(state: AppState): void {
    currentState = state;
    const filtered = filterByYears(entries, state);
    const metric = AGGREGATE_METRICS[state.metric];
    const byCountry = aggregateByCountry(filtered, state.metric);

    const values = [...byCountry.values()].map((d) => d.value).filter(Number.isFinite);
    const extent = d3.extent(values) as [number, number] | [undefined, undefined];
    // OrRd: bež → tamno crvena (jaki low-end na svijetloj pozadini)
    const color = metric.higherIsBetter
      ? d3.scaleSequential(d3.interpolateOrRd).domain(extent as [number, number])
      : d3
          .scaleSequential(d3.interpolateOrRd)
          .domain([extent[1] as number, extent[0] as number]);

    const countries = gCountries.selectAll<SVGPathElement, CountryFeature>(
      'path.country',
    );
    countries
      .classed('no-data', (d) => !byCountry.has(d.id))
      .classed('selected', (d) => state.selectedCountries.has(d.id))
      .each(function (d) {
        (this as PathEl).__rowData = byCountry.get(d.id) ?? null;
        (this as PathEl).__metric = metric;
      });

    countries
      .transition('fill')
      .duration(500)
      .ease(d3.easeCubicOut)
      .attr('fill', (d) => {
        const row = byCountry.get(d.id);
        return row ? color(row.value) : null;
      });

    lastLegend = [color, extent, metric];
    drawLegend(color, extent, metric);
  }

  function drawLegend(
    color: d3.ScaleSequential<string>,
    extent: [number, number] | [undefined, undefined],
    metric: AggregateMetric,
  ): void {
    gLegend.selectAll('*').remove();
    if (!color || !metric || extent[0] == null) return;

    const lw = Math.min(220, size.width - 24);
    const lh = 8;
    const x = 12;
    const y = size.height - 28;

    const defs = svg.select<SVGDefsElement>('defs').empty()
      ? svg.append('defs')
      : svg.select<SVGDefsElement>('defs');
    defs.selectAll('#map-grad').remove();
    const grad = defs
      .append('linearGradient')
      .attr('id', 'map-grad')
      .attr('x1', '0%')
      .attr('x2', '100%');
    const stops = 8;
    const [lo, hi] = color.domain();
    for (let i = 0; i <= stops; i++) {
      const t = i / stops;
      grad
        .append('stop')
        .attr('offset', `${t * 100}%`)
        .attr('stop-color', color(lo + (hi - lo) * t));
    }

    gLegend
      .append('rect')
      .attr('x', x)
      .attr('y', y)
      .attr('width', lw)
      .attr('height', lh)
      .attr('fill', 'url(#map-grad)')
      .attr('rx', 2);

    gLegend
      .append('text')
      .attr('x', x)
      .attr('y', y - 4)
      .attr('fill', 'var(--muted)')
      .style('font-size', '11px')
      .text(metric.label);

    gLegend
      .append('text')
      .attr('x', x)
      .attr('y', y + lh + 12)
      .attr('fill', 'var(--muted)')
      .style('font-size', '10px')
      .text(metric.format(extent[0] as number));

    gLegend
      .append('text')
      .attr('x', x + lw)
      .attr('y', y + lh + 12)
      .attr('text-anchor', 'end')
      .attr('fill', 'var(--muted)')
      .style('font-size', '10px')
      .text(metric.format(extent[1] as number));
  }

  function onHover(this: SVGPathElement, event: MouseEvent, d: CountryFeature): void {
    const row = (this as PathEl).__rowData;
    const metric = (this as PathEl).__metric;
    const title = row ? row.country : d.properties.NAME;
    const value =
      row && metric
        ? `<br/><strong>${metric.label}:</strong> ${metric.format(row.value)}`
        : '<br/><span style="color: var(--muted)">nema podataka u rasponu</span>';
    showTooltip(`<strong>${title}</strong>${value}`, event);
  }

  function onLeave(): void {
    hideTooltip();
  }

  function onClick(
    this: SVGPathElement,
    _event: MouseEvent,
    d: CountryFeature,
  ): void {
    if (!currentState) return;
    if (!(this as PathEl).__rowData) return;
    setState({ selectedCountries: toggleSelected(d.id) });
  }

  return { update };
}

// Lokalni alias za augmentirane DOM elemente s našim atributima
type PathEl = SVGPathElement & {
  __rowData?: CountryAggregate | null;
  __metric?: AggregateMetric;
};
