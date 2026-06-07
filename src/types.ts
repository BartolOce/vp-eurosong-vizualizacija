// Centralne tipske definicije za domenu projekta.

// Jedan nastup iz public/data/entries.json
export interface Entry {
  year: number;
  countryCode: string; // ISO Alpha-2 uppercase (npr. "HR")
  iso3: string | null; // ISO Alpha-3 (može biti null za nepoznate kodove)
  country: string;
  performer: string | null;
  song: string | null;
  qualified: boolean; // false = ispao u polufinalu
  place: number | null; // plasman u finalu, null ako nije prošao
  placeSf: number | null; // plasman u polufinalu (može biti null za big-5/host)
  points: number | null;
  pointsJury: number | null;
  pointsTele: number | null;
  runningOrder: number | null;
  youtubeUrl: string | null;
  youtubeViews: number | null;
}

// Ključevi agregiranih metrika (mapa + bar + line ranking)
export type MetricKey =
  | 'totalPoints'
  | 'avgPlace'
  | 'wins'
  | 'top5'
  | 'appearances';

// Ključevi po-nastupnih polja (scatter konfiguracija)
export type EntryKey =
  | 'place'
  | 'points'
  | 'pointsJury'
  | 'pointsTele'
  | 'runningOrder'
  | 'year'
  | 'youtubeViews';

// Mod scatter charta: jury vs tele, ili YouTube vs plasman
export type ScatterMode = 'jt' | 'yt';

// Aplikacijsko stanje
export interface AppState {
  yearFrom: number | null;
  yearTo: number | null;
  metric: MetricKey;
  selectedCountries: Set<string>;
  lineOnlySelected: boolean;
  scatterMode: ScatterMode;
}

// Patch koji se prosljeđuje u setState — sva polja opcionalna
export type StatePatch = Partial<AppState>;

// Listener funkcija za store
export type StateListener = (state: AppState, patch: StatePatch) => void;

// Definicija agregirane metrike (iz metrics.ts)
export interface AggregateMetric {
  key: MetricKey;
  label: string;
  short: string;
  higherIsBetter: boolean;
  minSamples?: number;
  // Apsolutna granica skale za "lower is better" metrike. Koristi se u
  // bar chartu da širina = scaleMax - value, što daje proporcionalne
  // bar duljine umjesto da najgori uvijek ima 0px širinu.
  scaleMax?: number;
  compute: (entries: Entry[]) => number;
  format: (v: number) => string;
}

// Agregirana vrijednost po zemlji (iz aggregateByCountry)
export interface CountryAggregate {
  countryCode: string;
  country: string;
  entries: Entry[];
  value: number;
}

// TopoJSON Europe geometrije (id je countryCode kao u entries.json)
export interface EuropeTopology {
  type: 'Topology';
  objects: {
    europe: {
      type: 'GeometryCollection';
      geometries: Array<{
        type: string;
        id: string;
        properties: { NAME: string };
        arcs: unknown;
      }>;
    };
  };
  arcs: unknown;
}

// Konfiguracija scatter chart-a (mode toggle)
export interface ScatterConfig {
  xKey: EntryKey;
  yKey: EntryKey;
  xLabel: string;
  yLabel: string;
  xLog?: boolean;
  yLog?: boolean;
  xInvert?: boolean;
  yInvert?: boolean;
}

// Kontekst za chart factory funkcije
export interface ChartContext {
  entries: Entry[];
  topology: EuropeTopology;
}

// Što chart factory vraća — svaki chart reagira na state.update
export interface ChartHandle {
  update: (state: AppState) => void;
}
