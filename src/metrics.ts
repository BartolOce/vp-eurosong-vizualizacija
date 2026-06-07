import * as d3 from 'd3';
import type {
  AggregateMetric,
  AppState,
  CountryAggregate,
  Entry,
  MetricKey,
} from './types.js';

// Agregirane metrike — računaju se nad skupom nastupa zemlje u rasponu godina.
// Koriste se na karti i u stupčastom dijagramu.
export const AGGREGATE_METRICS: Record<MetricKey, AggregateMetric> = {
  totalPoints: {
    key: 'totalPoints',
    label: 'Ukupno bodova',
    short: 'bodovi',
    higherIsBetter: true,
    compute: (es) => d3.sum(es, (e) => e.points ?? 0),
    format: (v) => d3.format(',')(Math.round(v)),
  },
  avgPlace: {
    key: 'avgPlace',
    label: 'Prosječni plasman',
    short: 'pros. plasman',
    higherIsBetter: false,
    // Zemlje s manje od 3 nastupa se isključuju iz prosjeka (inače dominiraju
    // jednokratni outlieri).
    minSamples: 3,
    // Worst mogući plasman u finalu = 26; bar chart ga koristi kao anchor
    // tako da bar širine ostanu proporcionalne stvarnoj razlici.
    scaleMax: 26,
    compute: (es) => d3.mean(es, (e) => e.place ?? undefined) ?? 0,
    format: (v) => (v == null ? '–' : v.toFixed(1)),
  },
  wins: {
    key: 'wins',
    label: 'Broj pobjeda',
    short: 'pobjede',
    higherIsBetter: true,
    compute: (es) => es.filter((e) => e.place === 1).length,
    format: (v) => `${v}`,
  },
  top5: {
    key: 'top5',
    label: 'Top-5 plasmana',
    short: 'top-5',
    higherIsBetter: true,
    compute: (es) => es.filter((e) => e.place != null && e.place <= 5).length,
    format: (v) => `${v}`,
  },
  appearances: {
    key: 'appearances',
    label: 'Broj nastupa u finalu',
    short: 'nastupi',
    higherIsBetter: true,
    compute: (es) => es.length,
    format: (v) => `${v}`,
  },
};

/** Filtrira nastupe na raspon godina iz state-a. */
export function filterByYears(entries: Entry[], state: AppState): Entry[] {
  return entries.filter(
    (e) =>
      state.yearFrom != null &&
      state.yearTo != null &&
      e.year >= state.yearFrom &&
      e.year <= state.yearTo,
  );
}

/**
 * Agregira nastupe po zemlji i izračuna vrijednost metrike. Računa SAMO
 * qualified=true (finalisti). Line chart koristi sirovi `entries` izvor
 * jer treba prikazati i polufinaliste (DNQ "drugo" red).
 */
export function aggregateByCountry(
  entries: Entry[],
  metricKey: MetricKey,
): Map<string, CountryAggregate> {
  const metric = AGGREGATE_METRICS[metricKey];
  const qualified = entries.filter((e) => e.qualified !== false);
  const groups = d3.group(qualified, (e) => e.countryCode);
  const result = new Map<string, CountryAggregate>();
  for (const [code, es] of groups) {
    if (metric.minSamples && es.length < metric.minSamples) continue;
    result.set(code, {
      countryCode: code,
      country: es[0].country,
      entries: es,
      value: metric.compute(es),
    });
  }
  return result;
}
