/**
 * **Everything a spec's numbers rest on.** A `Quantity` taken from a source names one of these
 * (`src/core/spec/quantity.ts`); `tests/core-spec.test.mjs` checks that each file a source names
 * exists, and reads an asset's number back from the asset.
 *
 * - `literature`: a published measurement, cited so it can be found.
 * - `decision`: the owner's choice, with the date and the record that holds it. A design target is
 *   a decision, not a measurement, and is said to be one.
 * - `asset`: a file in this repository; `where` is a JSON pointer into it.
 * - `measurement`: a number measured from an asset or a run, with how and where the table is.
 */
export type Source =
  | { readonly kind: "literature"; readonly cite: string; readonly link: string }
  | { readonly kind: "decision"; readonly date: string; readonly decided: string; readonly record: string }
  | { readonly kind: "asset"; readonly file: string; readonly what: string }
  | { readonly kind: "measurement"; readonly how: string; readonly record: string };

export const SOURCES = Object.freeze({
  "de-leva-1996": {
    kind: "literature",
    cite: "de Leva P (1996). Adjustments to Zatsiorsky-Seluyanov's segment inertia parameters. "
      + "J Biomech 29(9):1223-1230.",
    link: "https://doi.org/10.1016/0021-9290(95)00178-6",
  },
  "winter-table-4-1": {
    kind: "literature",
    cite: "Winter DA. Biomechanics and Motor Control of Human Movement, Table 4.1 (anthropometric data; "
      + "segment densities from Dempster 1955 via Miller & Nelson 1973 and Plagenhoef 1971).",
    link: "https://courses.grainger.illinois.edu/me481/sp2021/Anthro-Winter.pdf",
  },
  "workshop-envelope": {
    kind: "measurement",
    how: "scripts/core/workshop-envelope.mjs on public/assets/humanoid/workshop-*.glb: the extents of the "
      + "clothed envelope's vertices that the named bones weigh most on, glTF frame, authored size, "
      + "rounded to 0.1 mm. tests/core-human.test.mjs measures them again.",
    record: "scripts/core/workshop-envelope.mjs",
  },
  "workshop-fighter-rig": {
    kind: "asset", file: "assets/humanoid/workshop-fighter.json",
    what: "The Warrior's rig: bone heads and tails, Blender's frame, metres at the authored size, "
      + "exported from the model's Blender file by scripts/humanoid/export-workshop.py.",
  },
  "workshop-rogue-rig": {
    kind: "asset", file: "assets/humanoid/workshop-rogue.json",
    what: "The Rogue's rig, as the Warrior's.",
  },
  "workshop-fighter-glb": {
    kind: "asset", file: "public/assets/humanoid/workshop-fighter.glb",
    what: "The Warrior's model; a pointer is into its glTF JSON chunk.",
  },
  "workshop-rogue-glb": {
    kind: "asset", file: "public/assets/humanoid/workshop-rogue.glb",
    what: "The Rogue's model; a pointer is into its glTF JSON chunk.",
  },
  "owner-typical-adult": {
    kind: "decision", date: "2026-09-27",
    decided: "A human at x1 is a typical adult, about 1.76-1.78 m and 78-80 kg for a man; the Rogue "
      + "keeps its own proportions and its size against the Warrior's.",
    record: "docs/plans/2026-09-27-warrior-rogue-reptile.md",
  },
  "cgpm-1901": {
    kind: "literature",
    cite: "3rd General Conference on Weights and Measures (CGPM), 1901: Declaration on the unit of mass "
      + "and on the definition of weight; conventional value of gn, 980.665 cm/s2.",
    link: "https://www.bipm.org/en/committees/cg/cgpm/3-1901/resolution-",
  },
  "owner-physics-rate": {
    kind: "decision", date: "2026-09-25",
    decided: "Physics and control run at 120 Hz, from the release of 2026-09-25.",
    record: "docs/history.md#h66",
  },
  "workshop-volumes": {
    kind: "measurement",
    how: "Each model's skin, feet, jacket, trousers, collar and belt, closed by voxel flood fill in the "
      + "bind pose and extrapolated to a zero voxel from grids of 4.5 to 8 mm, at the authored size.",
    record: "docs/analysis/2026-09-27-human-strike-reference.md#8-the-workshop-models",
  },
} as const satisfies Readonly<Record<string, Source>>);

export type SourceKey = keyof typeof SOURCES;
