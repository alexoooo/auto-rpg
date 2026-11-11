/** A value a field may take, as text, and its name on the page. */
type Option<V extends string> = readonly [value: V, name: string];

interface Field<C> {
  /** Its key in the config. */
  readonly key: string;
  readonly label: string;
  /** Its value in `config`, as text. */
  read(config: C): string;
  /** `config` with `text` for its value; null for text this field does not take. */
  write(config: C, text: string): C | null;
}

/** A setting chosen from a list. */
interface ChoiceField<C> extends Field<C> {
  readonly kind: "choice";
  readonly options: readonly Option<string>[];
}

/** A number from `least` to `most`, offered at `step`. */
interface NumberField<C> extends Field<C> {
  readonly kind: "number";
  readonly least: number;
  readonly most: number;
  readonly step: number;
  readonly unit: string;
}

/**
 * **A setting a person may change** on a part's config (`Edited.fields`): a player's field, never an
 * experiment's `tuning`. The mind editor shows it (`src/app/browser/ui/mind-editor.ts`).
 */
export type PartField<C> = ChoiceField<C> | NumberField<C> | (Field<C> & { readonly kind: "text" })
  | (Field<C> & { readonly kind: "json"; readonly editor?: string });

/**
 * **What the mind editor shows of a kind of part** (`Part`) beside its label and its slots: the
 * settings a person may change, and whether it is offered for a new selection.
 */
export interface Edited<C> {
  readonly fields: readonly PartField<C>[];
  /** False: omitted from new selections; existing configurations remain visible. */
  readonly offered?: false;
}

/** Whether a part is offered for a new selection. */
export const partOffered = (part: { readonly offered?: false }): boolean => part.offered !== false;

/** A structured setting whose implementation validates its meaning; unknown editors use JSON. */
export function json<C, K extends keyof C & string>(key: K, label: string, editor?: string): PartField<C> {
  return { kind: "json", key, label, ...(editor ? { editor } : {}), read: config => JSON.stringify(config[key] ?? null),
    write(config, text) {
      let value: unknown;
      try { value = JSON.parse(text); } catch { return null; }
      return { ...config, [key]: value };
    } };
}

/** The string-valued field `key` of a config, from `options`. */
export function choice<C, K extends keyof C & string>(key: K, label: string, options: readonly Option<C[K] & string>[]): ChoiceField<C> {
  return {
    kind: "choice", key, label, options,
    read: (config) => String(config[key]),
    write: (config, text) => options.some(([value]) => value === text) ? { ...config, [key]: text } : null,
  };
}

/** The string-valued field `key` of a config that may leave it out, from `options`, or `none`, named as given, where it does. */
export function optionalChoice<C, K extends keyof C & string>(key: K, label: string, none: string, options: readonly Option<NonNullable<C[K]> & string>[]): ChoiceField<C> {
  return {
    kind: "choice", key, label, options: [["", none], ...options],
    read: (config) => config[key] === undefined ? "" : String(config[key]),
    write: (config, text) => {
      if (text !== "") return options.some(([value]) => value === text) ? { ...config, [key]: text } : null;
      const { [key]: _, ...rest } = config;
      return rest as C;
    },
  };
}

/** The numeric field `key` of a config, from `least` to `most`. */
export function number<C, K extends keyof C & string>(key: K, label: string, least: number, most: number, step: number, unit: string): NumberField<C> {
  return {
    kind: "number", key, label, least, most, step, unit,
    read: (config) => String(config[key]),
    write: (config, text) => {
      const value = text.trim() === "" ? NaN : Number(text);
      return Number.isFinite(value) && value >= least && value <= most ? { ...config, [key]: value } : null;
    },
  };
}
