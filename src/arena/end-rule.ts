/**
 * **A bout's end rules** (`DuelRecipe.ends`): each says whether a side is out, and how, as the
 * verdict names it; the first rule of the recipe's list that puts a side out says how. A rule is
 * a part of its own kind (`END_RULES`, `ends.ts`), chosen by the recipe alone, its settings the
 * recipe's over its defaults; the clock's rule, the lives at the cap, is the bout's own
 * (`Verdict.ending` `time`).
 */
import type { PhysicalBody } from "../core/physical-body.ts";
import type { BuiltBody } from "../core/build/build-body.ts";
import type { Pool } from "../core/rules/pool.ts";
import { deepFreeze } from "../core/state.ts";
import { END_RULES } from "./ends.ts";
import type { DuelRecipe } from "./duel.ts";

/** An end rule as a recipe names it: its kind (`END_RULES`) and its settings, plain data. */
export interface EndRuleConfig { readonly kind: string }

/** A side as an end rule reads it: its pool, its life (`Duel.life`), its body, and how long it has been down without a break, s (0 where the bout keeps no such count). */
export interface EndContestant {
  readonly pool: Pool;
  readonly life: number;
  readonly body: PhysicalBody;
  readonly built: BuiltBody;
  readonly downFor: number;
}

/** **An end rule**: its label, its defaults, how a side is out by it now, and what a person is told of each ending it names. */
export interface EndRule<C extends EndRuleConfig = EndRuleConfig> {
  readonly label: string;
  readonly defaults: C;
  /** How `one` is out by this rule under `recipe`, as the verdict names it (a key of `endings`), or null where it is not. */
  out(one: EndContestant, config: C, recipe: DuelRecipe): string | null;
  /** The share of every side's full life it has taken `seconds` into the bout; none unless it says. */
  drained?(seconds: number, config: C): number;
  /** How far into the bout it has taken every side's full life, s: where it drains (`drained`). */
  drainedBy?(config: C): number;
  /** What a person is told of a bout a side lost so, by ending: "by a fall". */
  readonly endings: Readonly<Record<string, string>>;
}

/**
 * **The game's end rules, the owner's verdict**: a side is out by its pool's ending, then by the
 * drain (`DRAIN_END`): from the first minute each loses a sixtieth of its full life a second, so
 * every bout ends by two minutes. A fall ends nothing.
 */
export const GAME_ENDS: readonly EndRuleConfig[] = deepFreeze([{ kind: "damage" }, { kind: "drain" }]);

/** The end rule of `config`'s kind; an error for a kind none is. */
export function endRuleOf(config: EndRuleConfig): EndRule {
  const rule = Object.hasOwn(END_RULES, config.kind) ? (END_RULES as unknown as Readonly<Record<string, EndRule>>)[config.kind] : undefined;
  if (!rule) throw new Error(`no end rule ${JSON.stringify(config.kind)}: one of ${Object.keys(END_RULES).join(", ")}`);
  return rule;
}

/** What a person is told of `ending`: the bell's, or the text of the end rule that names it; the ending's own name for one none names. */
export function endingText(ending: string): string {
  if (ending === "time") return "on life at the bell";
  for (const rule of Object.values(END_RULES as unknown as Readonly<Record<string, EndRule>>)) if (Object.hasOwn(rule.endings, ending)) return rule.endings[ending]!;
  return `by ${ending}`;
}
