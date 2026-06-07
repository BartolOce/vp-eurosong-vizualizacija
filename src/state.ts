// Reaktivni store. setState patcha stanje, listener-i dobivaju (state, patch).
// selectedCountries je Set — za detekciju promjene se uspoređuje sadržaj
// (uvijek se stvara novi Set u setState).

import type { AppState, StatePatch, StateListener } from './types.js';

const listeners = new Set<StateListener>();

const state: AppState = {
  yearFrom: null,
  yearTo: null,
  metric: 'totalPoints',
  selectedCountries: new Set<string>(),
  lineOnlySelected: false,
  scatterMode: 'jt',
};

/** Vraća referencu na aktualno stanje (read-only — promjene idu kroz setState). */
export function getState(): AppState {
  return state;
}

/**
 * Patch-update aplikacijskog stanja. Listener-i se zovu samo ako se nešto
 * stvarno promijenilo (plitka usporedba; za Set-ove se uspoređuje sadržaj).
 */
export function setState(patch: StatePatch): void {
  let changed = false;
  const stateRec = state as unknown as Record<string, unknown>;
  const patchRec = patch as unknown as Record<string, unknown>;
  for (const k in patchRec) {
    const next = patchRec[k];
    const prev = stateRec[k];
    if (prev instanceof Set && next instanceof Set) {
      if (!setEq(prev, next)) {
        stateRec[k] = next;
        changed = true;
      }
    } else if (prev !== next) {
      stateRec[k] = next;
      changed = true;
    }
  }
  if (changed) {
    for (const l of listeners) l(state, patch);
  }
}

/** Pretplata na promjene state-a. Vraća unsubscribe funkciju. */
export function subscribe(fn: StateListener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function setEq(a: Set<unknown>, b: Set<unknown>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

/** Vraća novi Set s/bez datog country code-a (immutable toggle). */
export function toggleSelected(code: string): Set<string> {
  const next = new Set(state.selectedCountries);
  if (next.has(code)) next.delete(code);
  else next.add(code);
  return next;
}
