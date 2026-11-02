/**
 * **The table's cells**: every body by loadout by skill Option Mind is asked to do, each with the
 * drill readings that judge it against its bar (`Skill.bar`, in words). A loadout is a record of
 * slots (`Loadout`, today the two hands), so a slot added to it (a worn piece) adds to the loadout
 * axis without reshaping a cell. A skill has a cell where its body does it (`Skill.bodies`) and the
 * loadout leaves it the limb it uses (`Skill.limbs`).
 */
import { loadoutKey, REPRESENTATIVE, type Held, type Loadout } from "../../core/items/held.ts";
import type { HumanoidModel } from "../../core/models.ts";
import { STRIKE_CASES } from "../strike/cases.ts";

/** The bodies the table reads: the toed Warrior, the Rogue and the Skeleton. */
export const TABLE_BODIES: readonly HumanoidModel[] = Object.freeze(["workshop-fighter", "workshop-rogue", "crypt-skeleton"]);

/** The loadouts the table reads: the five minds are rated on (`REPRESENTATIVE`). */
export const TABLE_LOADOUTS: readonly Loadout[] = REPRESENTATIVE;

/** The mind every cell reads: Option Mind's preset. */
export const TABLE_MIND = "option";

/**
 * **How a reading is judged** (`verdictOf`): a strike rung by its share landed of those thrown
 * (`landed`), or of those that met the body past its arms (`on-body`, a fight's), with none fallen;
 * the owner's target's gates on one group of sixteen falls (`target`), or at least 15 of them
 * stood (`stood`); none fallen across a walk's trials (`walk`); the run's bar on every run trial
 * (`run`); the buckler first on 4 of 5 blows that touch the body (`buckler`).
 */
export type Judge = "landed" | "on-body" | "target" | "stood" | "walk" | "run" | "buckler";

/**
 * **One drill reading of a cell**: the evaluation, its protocol and the subject it reads, how its
 * rows on the cell's body are judged, and whether only the rows on the cell's loadout are, where
 * the drill lays its trials out by loadout rather than by subject (`byLoadout`).
 */
export interface Reading {
  readonly drill: string;
  readonly protocol: string;
  readonly subject: string;
  readonly judge: Judge;
  readonly byLoadout?: true;
}

/** A cell: its body, loadout, skill and the readings that judge it, all of which must meet its bar. */
export interface Cell {
  readonly body: HumanoidModel;
  readonly loadout: Loadout;
  readonly skill: string;
  readonly bar: string;
  readonly readings: readonly Reading[];
}

/** Whether a hand of `loadout` holds `held`. */
const holds = (loadout: Loadout, held: Held): boolean => loadout.left === held || loadout.right === held;

/** The Strike drill's subject for `action` with the striker holding `loadout`: none named for empty hands. */
const strikeSubject = (action: string, loadout: Loadout): string =>
  `${TABLE_MIND}/${action}${loadout.left === "empty" && loadout.right === "empty" ? "" : `@${loadoutKey(loadout)}`}`;

/** The Strike drill's protocol that throws `rung` from `body`: the rung's own, or its `-bodies` for a body its own leaves out. */
const strikeProtocol = (rung: string, body: HumanoidModel): string =>
  STRIKE_CASES[rung]!.conditions.some((condition) => condition.model === body) ? rung : `${rung}-bodies`;

/** A strike rung's reading of `action` thrown from `body` holding `loadout`. */
const strikeRung = (rung: string, judge: Judge, action: string, body: HumanoidModel, loadout: Loadout): Reading =>
  ({ drill: "strike", protocol: strikeProtocol(rung, body), subject: strikeSubject(action, loadout), judge });

/** A blow's rungs: the Strike drill's still, walk and fight. */
const blowRungs = (action: string, body: HumanoidModel, loadout: Loadout): readonly Reading[] =>
  [strikeRung("still", "landed", action, body, loadout), strikeRung("walk", "landed", action, body, loadout), strikeRung("fight", "on-body", action, body, loadout)];

/** Whether `loadout` is the owner's target's: empty hands or the club alone in the right (`risingJobs`, `target`). */
const onTarget = (loadout: Loadout): boolean => loadout.left === "empty" && (loadout.right === "empty" || loadout.right === "club");

/**
 * The stand-up's reading on `body` holding `loadout`: the owner's target where it plays them,
 * else the target's shoves on every body and loadout (`equipped-rise`, `every`), the Skeleton
 * judged by its falls stood.
 */
function standUp(body: HumanoidModel, loadout: Loadout): Reading {
  if (body !== "crypt-skeleton" && onTarget(loadout)) return { drill: "rising-target", protocol: "standard", subject: "game", judge: "target", byLoadout: true };
  return { drill: "equipped-rise", protocol: "every", subject: TABLE_MIND, judge: body === "crypt-skeleton" ? "stood" : "target", byLoadout: true };
}

/**
 * **A skill**: its name, its bar in words, the bodies that do it, the limbs a loadout must leave
 * it (none for the whole body's), and its readings on a body holding a loadout.
 */
interface Skill {
  readonly name: string;
  readonly bar: string;
  readonly bodies: readonly HumanoidModel[];
  readonly limbs: (loadout: Loadout) => boolean;
  readonly readings: (body: HumanoidModel, loadout: Loadout) => readonly Reading[];
}

const always = () => true;

/** **Every skill the table reads**, in the order it prints them. */
export const TABLE_SKILLS: readonly Skill[] = Object.freeze([
  { name: "stand-up", bodies: TABLE_BODIES, limbs: always, readings: (body, loadout) => [standUp(body, loadout)],
    bar: "the owner's target's gates on each group of 16 (Warrior, Rogue); at least 15 of 16 stood, the time read (Skeleton)" },
  { name: "walk", bodies: TABLE_BODIES, limbs: always, readings: () => [{ drill: "locomotion", protocol: "every", subject: TABLE_MIND, judge: "walk", byLoadout: true }],
    bar: "the Locomotion screen, its walks in the gusts, none fallen; the forward pace read beside it" },
  { name: "run", bodies: ["workshop-fighter", "workshop-rogue"], limbs: always,
    readings: () => [{ drill: "locomotion", protocol: "run", subject: TABLE_MIND, judge: "run", byLoadout: true }],
    bar: "3 m/s held 10 s; turns at 1 rad/s at 2 m/s; a stop from 3 m/s within 1.5 s; calm and gusts, seeds 1 to 4, none fallen" },
  { name: "punch", bodies: TABLE_BODIES, limbs: (loadout) => holds(loadout, "empty"), readings: (body, loadout) => blowRungs("straight-punch", body, loadout),
    bar: "90 % landed at the body's scaled punch bar (`BAR`, `barOf`), none fallen" },
  { name: "stomp", bodies: TABLE_BODIES, limbs: always, readings: (body, loadout) => [strikeRung("stomping", "landed", "stomp", body, loadout)],
    bar: "90 % landed at the foot's 3 m/s into the contact (Oudshoorn 2018, less one SD), none fallen" },
  { name: "club-blow", bodies: TABLE_BODIES, limbs: (loadout) => holds(loadout, "club"), readings: (body, loadout) => blowRungs("club-blow", body, loadout),
    bar: "90 % landed at 64.8 J (`BAR.held`), met blunt, none fallen" },
  { name: "cut", bodies: TABLE_BODIES, limbs: (loadout) => holds(loadout, "sword"), readings: (body, loadout) => blowRungs("sword-cut", body, loadout),
    bar: "90 % landed at the blade's far end's 18.5 m/s (Muggenthaler 2018, less one SD from Trinh 2018's range), met with the edge, none fallen" },
  { name: "thrust", bodies: TABLE_BODIES, limbs: (loadout) => holds(loadout, "sword"), readings: (body, loadout) => blowRungs("sword-thrust", body, loadout),
    bar: "90 % landed at the point's 4.6 m/s (Horsfall 1999 less one SD), met with the point, none fallen" },
  { name: "buckler-cover", bodies: TABLE_BODIES, limbs: (loadout) => holds(loadout, "buckler"),
    readings: () => [{ drill: "cover", protocol: "club", subject: TABLE_MIND, judge: "buckler", byLoadout: true },
      { drill: "cover", protocol: "sword", subject: TABLE_MIND, judge: "buckler", byLoadout: true }],
    bar: "against a club and a sword on a rhythm, the buckler meets 4 of 5 blows that touch the body first, none fallen" },
] satisfies readonly Skill[]);

/** **Every cell** of the table: body by loadout by skill, where the body does the skill and the loadout leaves it its limb. */
export const tableCells = (): readonly Cell[] => TABLE_BODIES.flatMap((body) => TABLE_LOADOUTS.flatMap((loadout) => TABLE_SKILLS
  .filter((skill) => skill.bodies.includes(body) && skill.limbs(loadout))
  .map((skill): Cell => ({ body, loadout, skill: skill.name, bar: skill.bar, readings: skill.readings(body, loadout) }))));
