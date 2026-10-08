/**
 * The physique grid: which physiques (`Physique`, `src/core/human/physique.ts`) a run measures
 * each body at. The ranges are the owner's (`docs/reference/competencies.md#physiques`); a run
 * overrides any axis without an edit here (`control-foundation.mjs --size ...`).
 */
import { PHYSIQUE_ATTRIBUTES } from "../src/core/human/physique.ts";

/** Each attribute's factors besides 1, the owner's ranges; 1 is always measured too. */
export const PHYSIQUE_GRID = Object.freeze({
  size: Object.freeze([0.9, 1.18]),
  weight: Object.freeze([0.85, 1.25]),
  strength: Object.freeze([0.8, 1.25]),
  speed: Object.freeze([0.85, 1.15]),
});

/** How the grid's physiques are made of its axes. */
export const PHYSIQUE_DESIGNS = Object.freeze(["axes", "full"]);

/** `grid` with each of `overrides`' axes in place of its own; every axis checked. */
export function physiqueRanges(overrides = {}, grid = PHYSIQUE_GRID) {
  const ranges = { ...grid, ...overrides };
  for (const [attribute, values] of Object.entries(ranges)) {
    if (!PHYSIQUE_ATTRIBUTES.includes(attribute)) throw new Error(`no physique attribute ${attribute}`);
    if (!Array.isArray(values) || values.some((v) => !(Number.isFinite(v) && v > 0))) throw new Error(`a physique's ${attribute} takes positive factors`);
  }
  return Object.fromEntries(PHYSIQUE_ATTRIBUTES.filter((a) => a in ranges).map((a) => [a, [...new Set(ranges[a])].sort((x, y) => x - y)]));
}

/**
 * The physiques of `ranges` (`physiqueRanges`), the default `{}` first, each naming only the
 * attributes it changes: by `"axes"`, each axis's factors with the others at 1; in `"full"`,
 * every combination of the axes' factors and 1.
 */
export function physiqueGrid(ranges = physiqueRanges(), design = "axes") {
  const axes = Object.entries(physiqueRanges(ranges, {})).map(([attribute, values]) => [attribute, values.filter((v) => v !== 1)]);
  switch (design) {
    case "axes": return [{}, ...axes.flatMap(([attribute, values]) => values.map((v) => ({ [attribute]: v })))];
    case "full": {
      let physiques = [{}];
      for (const [attribute, values] of axes) physiques = physiques.flatMap((p) => [p, ...values.map((v) => ({ ...p, [attribute]: v }))]);
      return physiques;
    }
    default: throw new Error(`no physique design ${design}`);
  }
}

/** A physique's name in a cell: "default", or its attributes and factors. */
export const physiqueLabel = (physique = {}) => Object.keys(physique).length
  ? PHYSIQUE_ATTRIBUTES.filter((a) => a in physique).map((a) => `${a}=${physique[a]}`).join(",") : "default";
