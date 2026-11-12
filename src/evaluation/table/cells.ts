/**
 * **The table's cells**: every body by loadout by skill Option Mind is asked to do, each with the
 * drill readings that value it in the game's own terms (`Judge`), read against the cell's baseline.
 * A cell reads its skill on its own merit, in a drill built for it, and never in a fight.
 * A loadout is a record of slots (`Loadout`, the two hands), so a slot added to
 * it (a worn piece) adds to the loadout axis without reshaping a cell. A skill has a cell on a body
 * holding a loadout where it is done there (`Skill.has`): a blow, where the table's mind offers it
 * (`strikesBy`), so the table lists no blow its mind does not have.
 */
import { loadoutKey, type Held, type Loadout } from "../../core/bodies/items/held.ts";
import { REPRESENTATIVE } from "../loadouts.ts";
import type { HumanoidModel } from "../../core/bodies/models.ts";
import { createStrikeCases } from "../strike/cases.ts";
import { type GameContext } from "../../game/arena/context.ts";

/** The bodies the table reads: the toed Warrior, the Rogue and the Skeleton. */
export const TABLE_BODIES: readonly HumanoidModel[] = Object.freeze(["workshop-fighter", "workshop-rogue", "crypt-skeleton"]);

/** The loadouts the table reads: the five minds are rated on (`REPRESENTATIVE`). */
export const TABLE_LOADOUTS: readonly Loadout[] = REPRESENTATIVE;

/** The mind every cell reads: the drills' Option Mind (`option-drill`), so no profile and no tree search decides what it does in a cell. */
const TABLE_MIND = "option-drill";

/**
 * **How a reading is valued** (`trialValue`): a fall's time to stand (`stand`); a move's seconds
 * lost against its orders (`orders`); a blow's life traded a second of its cycle (`strike`); a
 * cover's life lost to the opponent's blows (`cover`).
 */
export type Judge = "stand" | "orders" | "strike" | "cover";

/**
 * **What a strike's figure reads of its hit** (`StrikeHit`), beside its value: a fist's speed over
 * its last run in (`fist`), a foot's (`foot`), a held blow's energy (`energy`), a point's closing
 * speed (`point`), an edge's far end's speed (`edge`); the person's figure for each is `BAR`'s
 * (`personOf`).
 */
export type HitFigure = "fist" | "foot" | "energy" | "point" | "edge";

/**
 * **One drill reading of a cell**: the evaluation, its protocol and the subject it reads, how its
 * trials are valued, and whether only the rows on the cell's loadout are read, where the drill lays
 * its trials out by loadout rather than by subject (`byLoadout`); a strike's, what its figure reads
 * of the hit.
 */
export type Reading = {
  readonly drill: string;
  readonly protocol: string;
  readonly subject: string;
  readonly byLoadout?: true;
} & ({ readonly judge: "strike"; readonly hit: HitFigure } | { readonly judge: Exclude<Judge, "strike"> });

/** **A cell**: its body, loadout and skill, what its value is in words (`value`), and its readings. */
export type Cell = { readonly body: HumanoidModel; readonly loadout: Loadout; readonly skill: string; readonly value: string; readonly readings: readonly Reading[] };

/** Whether a hand of `loadout` holds `held`. */
const holds = (loadout: Loadout, held: Held): boolean => loadout.left === held || loadout.right === held;

/** The Strike drill's subject for `action` with the striker holding `loadout`: none named for empty hands. */
const strikeSubject = (action: string, loadout: Loadout): string =>
  `${TABLE_MIND}/${action}${loadout.left === "empty" && loadout.right === "empty" ? "" : `@${loadoutKey(loadout)}`}`;

/** The stand-up's reading: the stand-up target's falls of the body holding the loadout, risen by the table's mind; its value is what a fall costs every other cell. */
export const STAND_UP: Reading = Object.freeze({ drill: "rising-target", protocol: "standard", subject: TABLE_MIND, judge: "stand", byLoadout: true });

/**
 * **A skill**: its name, what its value is in words, whether a body holding a loadout does it
 * (`has`), and its readings there.
 */
type Skill = { readonly name: string; readonly value: string; readonly has: (body: HumanoidModel, loadout: Loadout) => boolean;
  readonly readings: (body: HumanoidModel, loadout: Loadout) => readonly Reading[] };

const always = () => true;

/** The bodies with a run to read: the Warrior's Travel drill and the Rogue's Locomotion runs. */
const RUNNERS: readonly HumanoidModel[] = Object.freeze(["workshop-fighter", "workshop-rogue"]);

/** What a blow's value is, in words. */
const BLOW = "the life each trial took from the target less the life it cost, a second of the action's cycle, a fall adding its body's time to stand, a blow not begun worth 0";

/** What a move's value is, in words. */
const MOVE = "the seconds each trial lost against its orders, a trial ended down charged the rest of its body's time to stand";

export function createTableCells(context: GameContext) {
  const { STRIKE_CASES, strikesBy } = createStrikeCases(context);

  /** Whether the table's mind strikes by `action` on a body holding a loadout (`strikesBy`): where a blow has a cell. */
  const struck = (action: string) => (body: HumanoidModel, loadout: Loadout): boolean => strikesBy(context.catalog.minds[TABLE_MIND]!.config, action, body, loadout);

  /** The Strike drill's protocol that throws `rung` from `body`: the rung's own, or its `-bodies` for a body its own leaves out. */
  const strikeProtocol = (rung: string, body: HumanoidModel): string =>
    STRIKE_CASES[rung]!.conditions.some((condition) => condition.model === body) ? rung : `${rung}-bodies`;

  /** A strike rung's reading of `action` thrown from `body` holding `loadout`, its hit's `hit` beside its value. */
  const strikeRung = (rung: string, hit: HitFigure, action: string, body: HumanoidModel, loadout: Loadout): Reading =>
    ({ drill: "strike", protocol: strikeProtocol(rung, body), subject: strikeSubject(action, loadout), judge: "strike", hit });

  /**
   * A blow's rungs: the Strike drill's still and walk, a target that lets the blow happen. A cell
   * reads a skill on its own merit; what a blow brings in a fight is its profile's, read in fights
   * (`fights`) and never in a cell.
   */
  const blowRungs = (action: string, hit: HitFigure, body: HumanoidModel, loadout: Loadout): readonly Reading[] =>
    ["still", "walk"].map((rung) => strikeRung(rung, hit, action, body, loadout));

  /** **Every skill the table reads**, in the order it prints them. */
  const TABLE_SKILLS: readonly Skill[] = Object.freeze([
    { name: "stand-up", has: always, readings: () => [STAND_UP],
      value: "the seconds from each fall made to a verified stand, a fall not stood at the cap, on the body's sixteen falls holding the loadout" },
    { name: "walk", has: always, readings: () => [{ drill: "locomotion", protocol: "every", subject: TABLE_MIND, judge: "orders", byLoadout: true }],
      value: `${MOVE}: the Locomotion screen's walks, runs, turns and shoves, its walks again in the gusts` },
    { name: "run", has: (body) => RUNNERS.includes(body),
      readings: body => body === "workshop-fighter"
        ? [{ drill: "travel", protocol: "confirmation", subject: TABLE_MIND, judge: "orders", byLoadout: true }]
        : [{ drill: "locomotion", protocol: "run", subject: TABLE_MIND, judge: "orders", byLoadout: true }],
      value: `${MOVE}: Warrior, the Travel drill's forward, directional, steering, corner, reversal and stop orders; Rogue, the Locomotion runs; calm and gusts, seeds 1 to 4` },
    { name: "punch", has: struck("straight-punch"), readings: (body, loadout) => blowRungs("straight-punch", "fist", body, loadout),
      value: `${BLOW}; the fist's speed over its last 0.1 m beside it` },
    { name: "stomp", has: struck("stomp"), readings: (body, loadout) => [strikeRung("stomping", "foot", "stomp", body, loadout)],
      value: `${BLOW}; the foot's speed into the contact beside it` },
    { name: "bonk", has: struck("bonk"),
      readings: (body, loadout) => [strikeRung("bonk", "energy", "bonk", body, loadout)],
      value: `${BLOW}; the blow's energy on the head beside it` },
    { name: "cut", has: struck("cut"), readings: (body, loadout) => blowRungs("cut", "edge", body, loadout),
      value: `${BLOW}; the blade's far end's speed into the contact beside it` },
    { name: "thrust", has: struck("sword-thrust"), readings: (body, loadout) => blowRungs("sword-thrust", "point", body, loadout),
      value: `${BLOW}; the point's closing speed at the contact beside it` },
    { name: "buckler-cover", has: (_body, loadout) => holds(loadout, "buckler"),
      readings: () => [{ drill: "cover", protocol: "club", subject: TABLE_MIND, judge: "cover", byLoadout: true },
        { drill: "cover", protocol: "sword", subject: TABLE_MIND, judge: "cover", byLoadout: true }],
      value: "against a club and a sword on a rhythm, the life each trial lost to the opponent's blows; the share the buckler met first beside it" },
  ] satisfies readonly Skill[]);

  /** **Every cell** of the table: body by loadout by skill, where the body holding the loadout does the skill (`Skill.has`). */
  const tableCells = (): readonly Cell[] => TABLE_BODIES.flatMap((body) => TABLE_LOADOUTS.flatMap((loadout) => TABLE_SKILLS
    .filter((skill) => skill.has(body, loadout))
    .map((skill): Cell => ({ body, loadout, skill: skill.name, value: skill.value, readings: skill.readings(body, loadout) }))));

  return { TABLE_SKILLS, tableCells };
}
