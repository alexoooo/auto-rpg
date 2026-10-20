import { BODY_MODELS, modelHastes, modelHolding, modelHolds, modelInfo, modelSupportsMind, type BodyModel } from "../core/models.ts";
import { hasteFrom } from "../core/human/attributes.ts";
import type { MindConfig } from "../core/mind/config.ts";
import { MINDS } from "../core/mind/controllers.ts";
import { isOrders } from "../core/mind/orders.ts";
import { balanceFrom } from "../core/rules/rulebook.ts";
import { SIDES, type OrdersEntry } from "./duel.ts";
import { EMPTY_LOADOUT, HELD, type Loadout } from "../core/items/held.ts";
import { appearanceFor, type Appearance } from "../render/appearance.ts";
import type { Side } from "../core/spec/body.ts";
import { parseMind, writeMind, type LinkedMind } from "../ui/mind-link.ts";

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

/** The arena link's parameter for each side's haste, per cent over a person's speed in its legs: `&haste=left,right`, or one number for both. */
const HASTE_PARAM = "haste";

/**
 * The haste an address gives each side (`DuelRecipe.haste`): two per cents over a person's (`hasteFrom`), left then right,
 * or one for both, given to a side whose model takes one (`modelHastes`); undefined for anything
 * else, and each side's is then its character's.
 */
export function readHaste(search: string): Readonly<Partial<Record<Side, number>>> | undefined {
  const text = new URLSearchParams(search).get(HASTE_PARAM);
  if (text === null) return undefined;
  const parts = text.split(","), given = parts.map(hasteFrom).filter((p) => p !== null);
  if (parts.length > 2 || given.length !== parts.length) return undefined;
  const models = readMatchup(search);
  return { ...(modelHastes(models.left) ? { left: given[0]! } : {}), ...(modelHastes(models.right) ? { right: given[given.length - 1]! } : {}) };
}

/** Each fighter's two hands: `left.loadout=leftHand,rightHand`, and `right.loadout` alike. */
export function readLoadouts(search: string): Readonly<Record<Side, Loadout>> | undefined {
  const query = new URLSearchParams(search);
  if (!SIDES.some((side) => query.has(`${side}.loadout`))) return undefined;
  const models = readMatchup(search), loadouts = {} as Record<Side, Loadout>;
  for (const side of SIDES) {
    const text = query.get(`${side}.loadout`);
    if (text === null) { loadouts[side] = EMPTY_LOADOUT; continue; }
    const parts = text.split(",").map((part) => part.trim());
    if (parts.length !== 2 || parts.some((part) => !HELD.includes(part as typeof HELD[number]))) return undefined;
    loadouts[side] = modelHolds(models[side]) ? { left: parts[0] as typeof HELD[number], right: parts[1] as typeof HELD[number] } : EMPTY_LOADOUT;
  }
  return loadouts;
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
 * tape is of one recipe: the link names the matchup, the gap, the cap, each side's balance and haste, what it holds and how it guards with it.
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

/** A side's choice of mind (`MINDS`), separate from anatomy, equipment and appearance. */
type Control = string;

/** The selectable controllers' names on the page, by id. */
export const CONTROLS: Readonly<Record<Control, string>> = Object.freeze(Object.fromEntries(Object.entries(MINDS).map(([id, mind]) => [id, mind.label])));

/** Both fighters' hands, empty unless the link assigns them. */
const loadoutsOf = (search: string): Readonly<Record<Side, Loadout>> => readLoadouts(search) ?? { left: EMPTY_LOADOUT, right: EMPTY_LOADOUT };

/** Per-side controller choices in a shareable arena recipe: each one its side's body and loadout are offered (`controlsFor`). */
export function readControls(search: string): Readonly<Record<Side, Control>> {
  const parts = (new URLSearchParams(search).get("control") ?? "").split(",");
  const models = readMatchup(search), loadouts = loadoutsOf(search);
  const read = (s: string | undefined, side: Side): Control => {
    const choices = controlsFor(models[side], loadouts[side]);
    return s !== undefined && choices.includes(s) ? s : defaultControl(models[side], loadouts[side]);
  };
  return { left: read(parts[0], "left"), right: read(parts[1] ?? parts[0], "right") };
}

/**
 * Pickers and links accept the same choices: the minds a body of `model` carrying `loadout` can carry
 * out (`modelSupportsMind`), so a mind that works with one loadout is offered with no other.
 */
export function controlsFor(model: BodyModel, loadout: Loadout = EMPTY_LOADOUT): readonly Control[] {
  return Object.keys(MINDS).filter((control) => modelSupportsMind(model, MINDS[control]!.config, loadout));
}

/** The choice a side starts on: its model's own mind (`modelInfo`) where it is offered, else the first offered. */
export function defaultControl(model: BodyModel, loadout: Loadout = EMPTY_LOADOUT): Control {
  const choices = controlsFor(model, loadout);
  return choices.find((control) => MINDS[control]!.config === modelInfo(model).mind) ?? choices[0]!;
}

/** The link's key for `side`'s mind once a person has changed it from its preset: its whole tree (`writeMind`). */
const mindKey = (side: Side): string => `${side}.mind`;

/**
 * `side`'s mind as `search` carries it, faults and all (`parseMind`): what its panel shows. The
 * preset `control=` names, unless the link carries the side's own tree.
 */
export function linkedMind(search: string, side: Side): LinkedMind {
  const preset = MINDS[readControls(search)[side]]!.config;
  return parseMind(new URLSearchParams(search).get(mindKey(side)), modelHolding(readMatchup(search)[side], loadoutsOf(search)[side])) ?? { config: preset, faults: [] };
}

/** The sides' minds as `search` carries them (`linkedMind`); a side whose tree has a fault plays its preset whole. */
export function readMinds(search: string): Readonly<Record<Side, MindConfig>> {
  const controls = readControls(search), read = (side: Side) => {
    const { config, faults } = linkedMind(search, side);
    return faults.length > 0 ? MINDS[controls[side]]!.config : config;
  };
  return { left: read("left"), right: read("right") };
}

/** `search` with each side's mind written where it differs from its preset (`writeMind`), and no other. */
export function mindsSearch(search: string, minds: Readonly<Record<Side, MindConfig>>): string {
  const query = new URLSearchParams(search), controls = readControls(search);
  for (const side of SIDES) {
    const text = writeMind(minds[side]);
    query.delete(mindKey(side));
    if (text !== writeMind(MINDS[controls[side]]!.config)) query.set(mindKey(side), text);
  }
  return `?${query}`;
}

/** What a mind of `config`, chosen from `control`'s preset, is called: the preset's name, or custom where it is the preset's no longer. */
export function controlName(control: Control, config: MindConfig): string {
  return JSON.stringify(config) === JSON.stringify(MINDS[control]!.config) ? CONTROLS[control] : `Custom (from ${CONTROLS[control]})`;
}

/** What the bout calls a side's controller (`controlName`), by the mind its address carries. */
export function controllerLabel(search: string, side: Side): string {
  return controlName(readControls(search)[side], readMinds(search)[side]);
}

/** Optional continuous-down allowance, in seconds, for recovery bouts. */
export const readRecovery = (search: string): number | null | undefined =>
  new URLSearchParams(search).get("recovery") === "continue" ? null : readWithin(search, "recovery", [0, 60]);
