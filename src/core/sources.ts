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
} as const satisfies Readonly<Record<string, Source>>);

export type SourceKey = keyof typeof SOURCES;
