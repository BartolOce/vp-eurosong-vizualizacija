import * as d3 from 'd3';
import type { Entry } from './types.js';

// Jedinstvena, stabilna boja po zemlji — ista u svim prikazima (linijski
// dijagram, dijagram raspršenja, oznake). Zemlje se poredaju po ukupnoj
// istaknutosti (zbroj bodova) pa najistaknutije — one koje se najčešće
// prikazuju zajedno — dobivaju prvih 10 pomno odabranih, dobro razmaknutih
// Tableau boja. Za ostale se generiraju dodatne jasno razdvojene nijanse
// (raspored po zlatnom kutu) tako da svaka zemlja ima svoju boju.

const BASE = d3.schemeTableau10; // 10 perceptivno različitih osnovnih boja
let colorByCode = new Map<string, string>();

/** Dodatne, međusobno razmaknute nijanse za zemlje izvan osnovne palete. */
function extraColor(i: number): string {
  const hue = (i * 137.508 + 18) % 360; // zlatni kut → maksimalno razmaknute
  const light = i % 2 === 0 ? 0.48 : 0.6; // izmjena svjetline za dodatni kontrast
  return d3.hsl(hue, 0.6, light).formatHex();
}

/** Inicijalizira stabilnu boju za svaku zemlju iz svih podataka. */
export function initCountryColors(entries: Entry[]): void {
  const totals = d3.rollup(
    entries,
    (v) => d3.sum(v, (e) => e.points ?? 0),
    (e) => e.countryCode,
  );
  const codes = [...totals.keys()].sort(
    (a, b) => (totals.get(b) ?? 0) - (totals.get(a) ?? 0),
  );
  colorByCode = new Map(
    codes.map((code, i) => [
      code,
      i < BASE.length ? BASE[i] : extraColor(i - BASE.length),
    ]),
  );
}

/** Vraća stalnu, jedinstvenu boju za danu ISO Alpha-2 oznaku zemlje. */
export function countryColor(code: string): string {
  return colorByCode.get(code) ?? '#9aa0a6';
}
