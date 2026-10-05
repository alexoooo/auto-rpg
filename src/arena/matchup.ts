import { BODY_MODELS, type BodyModel } from "../core/human/spec.ts";
import { FIGHTER, POINT_FIGHTER, type MindConfig } from "../core/mind/config.ts";
import { isOrders } from "../core/mind/orders.ts";
import { balanceFrom } from "../core/rules/rulebook.ts";
import { DUEL_HELD, type OrdersEntry, type Side } from "./duel.ts";
import { appearanceFor, type Appearance } from "../render/appearance.ts";

/** The arena link's parameter: `?matchup=left,right`, each a core model. */
export const MATCHUP_PARAM = "matchup";

export type Matchup = Readonly<Record<Side, BodyModel>>;

/** The Warrior against the Rogue unless a link or a person picks another pair. */
export const DEFAULT_MATCHUP: Matchup = Object.freeze({ left: "workshop-fighter", right: "workshop-rogue" });

/** What each model is called on the page. */
export const MODEL_LABELS: Readonly<Record<BodyModel, string>> = Object.freeze({
  "workshop-fighter": "Warrior", "workshop-rogue": "Rogue", "crypt-skeleton": "Skeleton",
});

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
  return { left: given[0]!, right: given[given.length - 1]! };
}

/** The arena link's parameter for how both sides' hands guard while they do not attack: `&guard=cover` or `&guard=pose`. */
const GUARD_PARAM = "guard";

/**
 * The minds an address gives both sides (`DuelRecipe.minds`): the fighter (`FIGHTER`) guarding
 * as it names (`FighterMindConfig.guard`); undefined for anything else, and each side's mind is
 * then the bout's own.
 */
export function readGuard(search: string): Readonly<Record<Side, MindConfig>> | undefined {
  const guard = new URLSearchParams(search).get(GUARD_PARAM);
  if (guard !== "cover" && guard !== "pose") return undefined;
  const mind: MindConfig = { ...FIGHTER, guard };
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

/** Selectable controllers; separate from anatomy, equipment and appearance. */
export const CONTROLS = Object.freeze({ classic: "Classic fighter", "point-right": "Point control: right hand",
  "point-left": "Point control: left hand", "point-alternate": "Point control: alternate hands" });
type Control = keyof typeof CONTROLS;

/** Per-side controller choices in a shareable arena recipe. */
export function readControls(search: string): Readonly<Record<Side, Control>> {
  const parts = (new URLSearchParams(search).get("control") ?? "").split(",");
  const read = (s: string | undefined): Control => s && Object.hasOwn(CONTROLS, s) ? s as Control : "classic";
  return { left: read(parts[0]), right: read(parts[1] ?? parts[0]) };
}

/** The selected controllers, retaining the classic fighter's guard option. */
export function readMinds(search: string): Readonly<Record<Side, MindConfig>> {
  const controls = readControls(search), guards = readGuard(search);
  const mind = (side: Side): MindConfig => {
    const control = controls[side];
    switch (control) {
      case "classic": return guards?.[side] ?? FIGHTER;
      case "point-right": return POINT_FIGHTER;
      case "point-left": return { ...POINT_FIGHTER, hand: "left" };
      case "point-alternate": return { ...POINT_FIGHTER, hand: "alternate" };
      default: { const never: never = control; throw new Error(`unknown controller ${never}`); }
    }
  };
  return { left: mind("left"), right: mind("right") };
}

/** Optional continuous-down allowance, in seconds, for recovery bouts. */
export const readRecovery = (search: string): number | undefined => readWithin(search, "recovery", [0, 60]);
