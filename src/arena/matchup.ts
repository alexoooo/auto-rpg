import { BODY_MODELS, modelHolds, modelSupportsMind, type BodyModel } from "../core/models.ts";
import { FIGHTER, type RecipeFighterConfig, type MindConfig } from "../core/mind/config.ts";
import { CONTROLLERS } from "../core/mind/controllers.ts";
import { isOrders } from "../core/mind/orders.ts";
import { balanceFrom } from "../core/rules/rulebook.ts";
import { DUEL_HELD, type OrdersEntry } from "./duel.ts";
import { appearanceFor, type Appearance } from "../render/appearance.ts";
import type { Side } from "../core/spec/body.ts";

/** The arena link's parameter: `?matchup=left,right`, each a core model. */
export const MATCHUP_PARAM = "matchup";

export type Matchup = Readonly<Record<Side, BodyModel>>;

/** The Warrior against the Rogue unless a link or a person picks another pair. */
export const DEFAULT_MATCHUP: Matchup = Object.freeze({ left: "workshop-fighter", right: "workshop-rogue" });

/** What each model is called on the page. */

const isModel = (text: string | undefined): text is BodyModel => BODY_MODELS.includes(text as BodyModel);

/** The matchup an address names; a side it does not name, or names wrongly, is the default's. */
export function readMatchup(search: string): Matchup {
  const [left, right] = (new URLSearchParams(search).get(MATCHUP_PARAM) ?? "").split(",");
  return { left: isModel(left) ? left : DEFAULT_MATCHUP.left, right: isModel(right) ? right : DEFAULT_MATCHUP.right };
}

/** `search` with its matchup replaced by `matchup`. */
export function matchupSearch(search: string, matchup: Matchup): string {
  const query = new URLSearchParams(search);
  query.set(MATCHUP_PARAM, `${matchup.left},${matchup.right}`);
  return `?${query.toString().replace(/%2C/g, ",")}`;
}

/** Each side's cosmetic choice, independent of the bout's recipe and orders. */
export function readAppearances(search: string, matchup: Matchup): Readonly<Record<Side, Appearance>> {
  const [left, right] = (new URLSearchParams(search).get("appearance") ?? "").split(",");
  return { left: appearanceFor(matchup.left, left), right: appearanceFor(matchup.right, right) };
}

/** Keep compatible appearances in a shareable address; an ordinary pair needs no extra parameter. */
export function appearanceSearch(search: string, matchup: Matchup, appearances: Readonly<Record<Side, Appearance>>): string {
  const query = new URLSearchParams(search), left = appearanceFor(matchup.left, appearances.left), right = appearanceFor(matchup.right, appearances.right);
  if (left === "default" && right === "default") query.delete("appearance");
  else query.set("appearance", `${left},${right}`);
  return `?${query.toString().replace(/%2C/g, ",")}`;
}

/** The arena link's parameter for the side a person fights: `&you=left` or `&you=right`. */
const YOU_PARAM = "you";

/** The side an address says the person fights; null, nobody, for anything else. */
export function readYou(search: string): Side | null {
  const you = new URLSearchParams(search).get(YOU_PARAM);
  return you === "left" || you === "right" ? you : null;
}

/** `search` with the side the person fights set to `you`, or with none. */
export function youSearch(search: string, you: Side | null): string {
  const query = new URLSearchParams(search);
  if (you) query.set(YOU_PARAM, you); else query.delete(YOU_PARAM);
  return `?${query.toString().replace(/%2C/g, ",")}`;
}

/** The arena link's parameter for each side's balance, per cent of its weight: `&balance=left,right`, or one number for both. */
const BALANCE_PARAM = "balance";

/**
 * The balance an address gives each side (`DuelRecipe.balance`): two numbers (`balanceFrom`),
 * left then right, or one number for both; undefined for anything else, and each side's
 * is then its character's.
 */
export function readBalance(search: string): Readonly<Record<Side, number>> | undefined {
  const text = new URLSearchParams(search).get(BALANCE_PARAM);
  if (text === null) return undefined;
  const parts = text.split(","), given = parts.map(balanceFrom).filter((p) => p !== null);
  if (parts.length > 2 || given.length !== parts.length) return undefined;
  return { left: given[0]!, right: given[given.length - 1]! };
}

/** The arena link's parameter for what each side's right hand holds: `&held=left,right`, or one word for both, each of `DUEL_HELD`. */
const HELD_PARAM = "held";

/**
 * What an address has each side's right hand hold (`DuelRecipe.held`): two of `DUEL_HELD`, left
 * then right, or one for both; undefined for anything else, and each then holds the club.
 */
export function readHeld(search: string): Readonly<Record<Side, (typeof DUEL_HELD)[number]>> | undefined {
  const text = new URLSearchParams(search).get(HELD_PARAM);
  if (text === null) return undefined;
  const parts = text.split(","), given = parts.flatMap((part) => DUEL_HELD.filter((held) => held === part.trim()));
  if (parts.length > 2 || given.length !== parts.length) return undefined;
  const models = readMatchup(search);
  return { left: modelHolds(models.left) ? given[0]! : "empty", right: modelHolds(models.right) ? given[given.length - 1]! : "empty" };
}

/** The arena link's parameter for how both sides' hands guard while they do not attack: `&guard=cover` or `&guard=pose`. */
const GUARD_PARAM = "guard";

/**
 * The minds an address gives both sides (`DuelRecipe.minds`): the fighter (`FIGHTER`) guarding
 * as it names (`RecipeFighterConfig.guard`); undefined for anything else, and each side's mind is
 * then the bout's own.
 */
export function readGuard(search: string): Readonly<Record<Side, RecipeFighterConfig>> | undefined {
  const guard = new URLSearchParams(search).get(GUARD_PARAM);
  if (guard !== "cover" && guard !== "pose") return undefined;
  const mind: RecipeFighterConfig = { ...FIGHTER, guard };
  return { left: mind, right: mind };
}

/**
 * The gap, m, and the cap, s, a link may ask for (`DuelRecipe.gap`, `.capSeconds`), a numeric setting:
 * from the two all but touching to the arena's floor, and from a second to ten minutes.
 */
const LINK_RANGE = { gap: [1, 8], cap: [1, 600] } as const;

/** The number an address gives `key`, if it is one from `least` to `most`; undefined for anything else. */
function readWithin(search: string, key: string, [least, most]: readonly [number, number]): number | undefined {
  const text = new URLSearchParams(search).get(key);
  const value = text === null || text.trim() === "" ? NaN : Number(text);
  return Number.isFinite(value) && value >= least && value <= most ? value : undefined;
}

/** How far apart an address stands the two, m: `&gap=`; undefined, and the bout's own, for anything else. */
export const readGap = (search: string): number | undefined => readWithin(search, "gap", LINK_RANGE.gap);

/** How long an address lets the bout run, s: `&cap=`; undefined, and the bout's own, for anything else. */
export const readCap = (search: string): number | undefined => readWithin(search, "cap", LINK_RANGE.cap);

/** A bout's tape in a link's fragment, which no server is sent: `#tape=<the tape's JSON, URI-encoded>`. */
const TAPE_KEY = "tape";

const isEntry = (entry: unknown): entry is OrdersEntry => {
  if (typeof entry !== "object" || entry === null) return false;
  const { step, side, orders } = entry as Record<string, unknown>;
  return Number.isInteger(step) && (step as number) >= 0 && (side === "left" || side === "right") && (orders === null || isOrders(orders));
};

/**
 * The tape `hash` carries; none if it carries none, or one that is not an array of entries. A
 * tape is of one recipe: the link names the matchup, the gap, the cap, each side's balance, what it holds and how it guards with it.
 */
export function readTape(hash: string): OrdersEntry[] {
  const text = new URLSearchParams(hash.replace(/^#/, "")).get(TAPE_KEY);
  if (!text) return [];
  try {
    const tape: unknown = JSON.parse(text);
    return Array.isArray(tape) && tape.every(isEntry) ? tape : [];
  } catch { return []; }
}

/** The fragment that carries `tape` (`readTape`). */
export const tapeHash = (tape: readonly OrdersEntry[]): string => `#${TAPE_KEY}=${encodeURIComponent(JSON.stringify(tape))}`;

/** Every controller's presets by id (`Controller.presets`): a side's choice, separate from anatomy, equipment and appearance. */
const PRESETS: Readonly<Record<string, { readonly label: string; readonly config: MindConfig }>> =
  Object.freeze(Object.assign({}, ...Object.values(CONTROLLERS).map((controller) => controller.presets)));
type Control = string;

/** The selectable controllers' names on the page, by id. */
export const CONTROLS: Readonly<Record<Control, string>> = Object.freeze(Object.fromEntries(Object.entries(PRESETS).map(([id, preset]) => [id, preset.label])));

/** Per-side controller choices in a shareable arena recipe. */
export function readControls(search: string): Readonly<Record<Side, Control>> {
  const parts = (new URLSearchParams(search).get("control") ?? "").split(",");
  const models = readMatchup(search);
  const read = (s: string | undefined, model: BodyModel): Control => {
    const choices = controlsFor(model);
    return s !== undefined && choices.includes(s) ? s : choices.includes("classic") ? "classic" : choices[0]!;
  };
  return { left: read(parts[0], models.left), right: read(parts[1] ?? parts[0], models.right) };
}

/** Pickers and links accept the same model/controller pairs. */
export function controlsFor(model: BodyModel): readonly Control[] {
  return Object.keys(PRESETS).filter((control) => modelSupportsMind(model, PRESETS[control]!.config));
}

/** The selected controllers' presets, a recipe fighter guarding as `&guard=` names (`readGuard`). */
export function readMinds(search: string): Readonly<Record<Side, MindConfig>> {
  const controls = readControls(search), guards = readGuard(search);
  const mind = (side: Side): MindConfig => {
    const config = PRESETS[controls[side]]!.config;
    return config.kind === "recipe-fighter" && guards ? { ...config, guard: guards[side].guard } : config;
  };
  return { left: mind("left"), right: mind("right") };
}

/** Optional continuous-down allowance, in seconds, for recovery bouts. */
export const readRecovery = (search: string): number | null | undefined =>
  new URLSearchParams(search).get("recovery") === "continue" ? null : readWithin(search, "recovery", [0, 60]);
