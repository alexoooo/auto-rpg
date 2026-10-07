import type { SubMindConfig } from "./config.ts";

/** A value a field may take, as a link writes it, and its name on the page. */
type Option<V extends string> = readonly [value: V, name: string];

interface Field<C> {
  /** The key a link writes it under, after its side: `&left.<key>=`. */
  readonly key: string;
  readonly label: string;
  /** Its value in `config`, as a link writes it. */
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
 * **A setting a person may change** on a controller's config (`Controller.fields`): a player's
 * field, never an experiment's `tuning`. The Arena's panel shows it and a link carries it.
 */
export type ControllerField<C> = ChoiceField<C> | NumberField<C>;

/** The string-valued field `key` of a config, from `options`. */
export function choice<C, K extends keyof C & string>(key: K, label: string, options: readonly Option<C[K] & string>[]): ChoiceField<C> {
  return {
    kind: "choice", key, label, options,
    read: (config) => String(config[key]),
    write: (config, text) => options.some(([value]) => value === text) ? { ...config, [key]: text } : null,
  };
}

const YES_NO: readonly Option<"yes" | "no">[] = [["yes", "Yes"], ["no", "No"]];

/** The boolean field `key` of a config, written `yes` or `no`. */
export function toggle<C, K extends keyof C & string>(key: K, label: string): ChoiceField<C> {
  return {
    kind: "choice", key, label, options: YES_NO,
    read: (config) => config[key] ? "yes" : "no",
    write: (config, text) => text === "yes" || text === "no" ? { ...config, [key]: text === "yes" } : null,
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

const DOWN: readonly Option<SubMindConfig["kind"]>[] = [["lie", "Lie still"], ["staged-rise", "Rise by stages"], ["support-recovery", "Rise, then steady"]];

/** What a fighter does when it is down: the one sub-mind its config hands its body to (`subs`). */
export function down<C extends { readonly subs: readonly SubMindConfig[] }>(): ChoiceField<C> {
  return {
    kind: "choice", key: "down", label: "When down", options: DOWN,
    read: (config) => config.subs.map((sub) => sub.kind).join("+"),
    write: (config, text) => {
      const kind = DOWN.find(([value]) => value === text)?.[0];
      return kind ? { ...config, subs: [{ kind }] } : null;
    },
  };
}
