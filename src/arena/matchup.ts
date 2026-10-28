import { BODY_MODELS, modelHastes, modelHolding, modelHolds, modelInfo, modelRefusal, type BodyModel } from "../core/models.ts";
import { FIGHT_ENTRY } from "../core/mind/catalog.ts";
import { hasteFrom } from "../core/human/attributes.ts";
import type { MindConfig } from "../core/mind/config.ts";
import { MINDS } from "../core/mind/controllers.ts";
import { presetFitsModel } from "../core/mind/controller.ts";
import { balanceFrom } from "../core/rules/rulebook.ts";
import { SIDES, type DuelRecipe } from "./duel.ts";
import { EMPTY_LOADOUT, HELD, type Loadout } from "../core/items/held.ts";
import { appearanceFor, type Appearance } from "../render/appearance.ts";
import type { Side } from "../core/spec/body.ts";
import { parseMind, writeMind, type LinkedMind } from "../ui/mind-link.ts";
import { legacyAttributes, readAttributes } from "../ui/attribute-link.ts";
import type { AttributeOverrides } from "../core/character-attributes.ts";
import { gapFits, LEVELS, type ArenaLevel } from "./levels.ts";

/** A link chooses a named stage; malformed UI input starts on the open stage. */
export function readLevel(search: string): ArenaLevel {
  const level = new URLSearchParams(search).get("level") ?? "open";
  return Object.hasOwn(LEVELS, level) ? level as ArenaLevel : "open";
}

/** The arena link's parameter: `?matchup=left,right`, each a core model. */
export const MATCHUP_PARAM = "matchup";

export type Matchup = Readonly<Record<Side, BodyModel>>;

/** Each contender's attributes, including existing flat Balance/Haste links. */
export function arenaAttributes(search: string): Readonly<Record<Side, AttributeOverrides>> {
  const query = new URLSearchParams(search);
  return { left: readAttributes(query, "left", legacyAttributes(query, 0)), right: readAttributes(query, "right", legacyAttributes(query, 1)) };
}

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

/** The cap, s, a link may ask for (`DuelRecipe.capSeconds`): from a second to ten minutes. */
const CAP_RANGE = [1, 600] as const;

/** The number an address gives `key`, if it is one from `least` to `most`; undefined for anything else. */
function readWithin(search: string, key: string, [least, most]: readonly [number, number]): number | undefined {
  const text = new URLSearchParams(search).get(key);
  const value = text === null || text.trim() === "" ? NaN : Number(text);
  return Number.isFinite(value) && value >= least && value <= most ? value : undefined;
}

/** How far apart an address stands the two on `level`, m: `&gap=` where the level lets them (`gapFits`); undefined, and the level's own, for anything else. */
export function readGap(search: string, level: ArenaLevel): number | undefined {
  const gap = readWithin(search, "gap", [-Infinity, Infinity]);
  return gap !== undefined && gapFits(level, gap) ? gap : undefined;
}

/** How long an address lets the bout run, s: `&cap=`; undefined, and the bout's own, for anything else. */
export const readCap = (search: string): number | undefined => readWithin(search, "cap", CAP_RANGE);

/** A side's choice of mind (`MINDS`), separate from anatomy, equipment and appearance. */
type Control = string;

/** The selectable controllers' names on the page, by id. */
export const CONTROLS: Readonly<Record<Control, string>> = Object.freeze(Object.fromEntries(Object.entries(MINDS).map(([id, mind]) => [id, mind.label])));

/** Both fighters' hands, empty unless the link assigns them. */
const loadoutsOf = (search: string): Readonly<Record<Side, Loadout>> => readLoadouts(search) ?? { left: EMPTY_LOADOUT, right: EMPTY_LOADOUT };

/** Per-side controller choices in a shareable arena recipe: each one its side's body and loadout are offered (`controlsFor`). */
export function readControls(search: string): Readonly<Record<Side, Control>> {
  const parts = (new URLSearchParams(search).get("control") ?? "").split(",");
  const models = readMatchup(search), loadouts = loadoutsOf(search), attributes = arenaAttributes(search);
  const read = (s: string | undefined, side: Side): Control => {
    let choices: readonly Control[];
    try { choices = controlsFor(models[side], loadouts[side], attributes[side]); }
    catch { choices = controlsFor(models[side], loadouts[side]); }
    return s !== undefined && choices.includes(s) ? s : choices.find(c => MINDS[c]!.config === modelInfo(models[side]).mind) ?? choices[0]!;
  };
  return { left: read(parts[0], "left"), right: read(parts[1] ?? parts[0], "right") };
}

/** A side's character under `control`: the preset's (`MindPreset.character`), and over it the attributes a person or a link sets. */
export const controlCharacter = (control: Control, attributes: AttributeOverrides = {}): AttributeOverrides =>
  ({ ...MINDS[control]?.character, ...attributes });

/**
 * Pickers and links accept the same choices: the minds a body of `model` carrying `loadout`, its
 * character as each mind would play it (`controlCharacter`), can carry out (`modelRefusal`, a
 * fight's entry rules), so a mind that works with one loadout is offered with no other.
 */
export function controlsFor(model: BodyModel, loadout: Loadout = EMPTY_LOADOUT, attributes?: AttributeOverrides): readonly Control[] {
  return Object.keys(MINDS).filter((control) => presetFitsModel(MINDS[control]!, model)
    && modelRefusal(model, MINDS[control]!.config, loadout, FIGHT_ENTRY, controlCharacter(control, attributes)) === null);
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
  const control = readControls(search)[side], preset = MINDS[control]!.config;
  const model = readMatchup(search)[side], loadout = loadoutsOf(search)[side];
  let spec;
  try { spec = modelHolding(model, loadout, controlCharacter(control, arenaAttributes(search)[side])); }
  catch { spec = modelHolding(model, loadout, controlCharacter(control)); }
  return parseMind(new URLSearchParams(search).get(mindKey(side)), spec, FIGHT_ENTRY) ?? { config: preset, faults: [] };
}

/**
 * What `search` carries for a side's mind that is no tree of a mind this build has (`parseMind`),
 * a sentence a side: its panel shows its preset instead, and the page says so.
 */
export function unreadMinds(search: string): string[] {
  const query = new URLSearchParams(search);
  return SIDES.flatMap((side) => {
    const text = query.get(mindKey(side));
    return text !== null && parseMind(text, modelHolding(readMatchup(search)[side], EMPTY_LOADOUT), []) === null
      ? [`The link's ${side} mind is no mind this build has; its preset is shown.`] : [];
  });
}

/** The sides' minds as `search` carries them (`linkedMind`), faults and all: a mind with one is refused where it is built, never replaced. */
export function readMinds(search: string): Readonly<Record<Side, MindConfig>> {
  return { left: linkedMind(search, "left").config, right: linkedMind(search, "right").config };
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

/** How old what each side sees of the other is, s: `&senseDelay=`, up to a second; undefined, and the rulebook's reaction time, for anything else. */
export const readSenseDelay = (search: string): number | undefined => readWithin(search, "senseDelay", [0, 1]);

/** The bout's seed: `&seed=`, a 32-bit word; undefined, and 0, for anything else. */
export function readSeed(search: string): number | undefined {
  const seed = readWithin(search, "seed", [0, 0xffffffff]);
  return seed !== undefined && Number.isInteger(seed) ? seed : undefined;
}

/** The bout `search` asks for on `level`, each side's attributes as the page holds them over its mind's character (`controlCharacter`). */
export function recipeOf(search: string, attributes: Readonly<Record<Side, AttributeOverrides>>, level: ArenaLevel): DuelRecipe {
  const matchup = readMatchup(search), gap = readGap(search, level), capSeconds = readCap(search), loadouts = readLoadouts(search), controls = readControls(search);
  const senseDelay = readSenseDelay(search), seed = readSeed(search);
  return {
    left: matchup.left, right: matchup.right, level, minds: readMinds(search),
    attributes: { left: controlCharacter(controls.left, attributes.left), right: controlCharacter(controls.right, attributes.right) },
    ...(gap !== undefined ? { gap } : {}), ...(capSeconds !== undefined ? { capSeconds } : {}), ...(loadouts ? { loadouts } : {}),
    ...(senseDelay !== undefined ? { senseDelay } : {}), ...(seed !== undefined ? { seed } : {}),
  };
}
