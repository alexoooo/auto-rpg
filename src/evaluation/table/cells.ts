/**
 * **The table's cells**: every body by loadout by skill Option Mind is asked to do, each with the
 * drill readings that judge it: stand-up and the run met or short on their definitions, every
 * other skill scored against its baseline (`Skill.kind`). A loadout is a record of slots
 * (`Loadout`, the two hands), so a slot added to it (a worn piece) adds to the loadout axis without
 * reshaping a cell. A skill has a cell where its body does it (`Skill.bodies`) and the loadout
 * leaves it the limb it uses (`Skill.limbs`).
 */
import stompMeta from "../../../assets/skills/strikes/stomp/stomp.meta.json" with { type: "json" };
import { loadoutKey, type Held, type Loadout } from "../../core/bodies/items/held.ts";
import { REPRESENTATIVE } from "../loadouts.ts";
import { modelSpec, type HumanoidModel } from "../../core/bodies/models.ts";
import { bodyKey } from "../../core/bodies/spec/body.ts";
import { createStrikeCases } from "../strike/cases.ts";
import { type GameContext } from "../../game/arena/context.ts";

/** The bodies the table reads: the toed Warrior, the Rogue and the Skeleton. */
export const TABLE_BODIES: readonly HumanoidModel[] = Object.freeze(["workshop-fighter", "workshop-rogue", "crypt-skeleton"]);

/** The loadouts the table reads: the five minds are rated on (`REPRESENTATIVE`). */
export const TABLE_LOADOUTS: readonly Loadout[] = REPRESENTATIVE;

/** The mind every cell reads: Option Mind's preset. */
export const TABLE_MIND = "option";

/**
 * **How a reading is judged**: met or short (`verdictOf`): the stand-up target's gates on one body
 * and loadout's sixteen falls (`target`); the run's bar on every run trial (`run`). Scored
 * (`scoreOf`): a strike rung by its hit's figure (`HitFigure`) over the trials begun (`landed`),
 * a fight's the same (`on-body`); a walk's trials by the share not fallen (`walk`); the Cover drill
 * by the share of blows that touch the body the buckler meets first (`buckler`).
 */
export type MetJudge = "target" | "run" | "travel";

export type ScoreJudge = "landed" | "on-body" | "walk" | "buckler";

/**
 * **What a strike's score reads of its hit** (`StrikeHit`): a fist's speed over its last run in
 * (`fist`), a foot's (`foot`), a held blow's energy (`energy`), a point's closing speed (`point`), an
 * edge's far end's speed (`edge`); the person's figure for each is `BAR`'s (`personOf`).
 */
export type HitFigure = "fist" | "foot" | "energy" | "point" | "edge";

/**
 * **One drill reading of a cell**: the evaluation, its protocol and the subject it reads, how its
 * rows on the cell's body are judged, and whether only the rows on the cell's loadout are, where
 * the drill lays its trials out by loadout rather than by subject (`byLoadout`); a strike's, what
 * its score reads of the hit.
 */
interface ReadingOf<J> {
  readonly drill: string;
  readonly protocol: string;
  readonly subject: string;
  readonly judge: J;
  readonly byLoadout?: true;
}

export type MetReading = ReadingOf<MetJudge>;

export type ScoreReading = (ReadingOf<"landed" | "on-body"> & { readonly hit: HitFigure }) | ReadingOf<"walk" | "buckler">;

export type Reading = MetReading | ScoreReading;

/**
 * **A cell**: its body, loadout and skill; met or short on its readings' bars (`met`, `bar` in
 * words), or its best effort, each reading scored against its baseline (`best`, `bar` the score).
 */
export type Cell = { readonly body: HumanoidModel; readonly loadout: Loadout; readonly skill: string; readonly bar: string }
  & ({ readonly kind: "met"; readonly readings: readonly MetReading[] } | { readonly kind: "best"; readonly readings: readonly ScoreReading[] });

/** Whether a hand of `loadout` holds `held`. */
const holds = (loadout: Loadout, held: Held): boolean => loadout.left === held || loadout.right === held;

/** The Strike drill's subject for `action` with the striker holding `loadout`: none named for empty hands. */
const strikeSubject = (action: string, loadout: Loadout): string =>
  `${TABLE_MIND}/${action}${loadout.left === "empty" && loadout.right === "empty" ? "" : `@${loadoutKey(loadout)}`}`;

/** The stand-up's reading: the stand-up target's falls of the body holding the loadout, risen by the table's mind. */
const STAND_UP: MetReading = Object.freeze({ drill: "rising-target", protocol: "standard", subject: TABLE_MIND, judge: "target", byLoadout: true });

/** The bodies with a stomp record (`assets/skills/strikes/stomp/stomp.json`): the stomp's fit refuses the rest. */
const STOMPERS: readonly HumanoidModel[] = Object.freeze(TABLE_BODIES.filter((body) => stompMeta.bodies.includes(bodyKey(modelSpec(body)))));

/**
 * **A skill**: its name, the bodies that do it, the limbs a loadout must leave it (none for the
 * whole body's), and its readings on a body holding a loadout: met or short on bars in words
 * (`met`), or scored, each reading against its baseline (`best`, `bar` what the score is).
 */
type Skill = { readonly name: string; readonly bar: string; readonly bodies: readonly HumanoidModel[]; readonly limbs: (loadout: Loadout) => boolean }
  & ({ readonly kind: "met"; readonly readings: (body: HumanoidModel, loadout: Loadout) => readonly MetReading[] }
    | { readonly kind: "best"; readonly readings: (body: HumanoidModel, loadout: Loadout) => readonly ScoreReading[] });

const always = () => true;

/** What a strike's score is, in words. */
const BLOW = "the median over the trials begun of the hit's figure on the mark, a trial with none at 0";

export function createTableCells(context: GameContext) {
  const { STRIKE_CASES } = createStrikeCases(context);

  /** The Strike drill's protocol that throws `rung` from `body`: the rung's own, or its `-bodies` for a body its own leaves out. */
  const strikeProtocol = (rung: string, body: HumanoidModel): string =>
    STRIKE_CASES[rung]!.conditions.some((condition) => condition.model === body) ? rung : `${rung}-bodies`;

  /** A strike rung's reading of `action` thrown from `body` holding `loadout`, scored by its hit's `hit`. */
  const strikeRung = (rung: string, judge: "landed" | "on-body", hit: HitFigure, action: string, body: HumanoidModel, loadout: Loadout): ScoreReading =>
    ({ drill: "strike", protocol: strikeProtocol(rung, body), subject: strikeSubject(action, loadout), judge, hit });

  /** A blow's rungs: the Strike drill's still, walk and fight. */
  const blowRungs = (action: string, hit: HitFigure, body: HumanoidModel, loadout: Loadout): readonly ScoreReading[] =>
    [strikeRung("still", "landed", hit, action, body, loadout), strikeRung("walk", "landed", hit, action, body, loadout), strikeRung("fight", "on-body", hit, action, body, loadout)];

  /** **Every skill the table reads**, in the order it prints them. */
  const TABLE_SKILLS: readonly Skill[] = Object.freeze([
    { name: "stand-up", kind: "met", bodies: TABLE_BODIES, limbs: always, readings: () => [STAND_UP],
      bar: "the stand-up target's gates on the body's sixteen falls holding the loadout (`targetGates`)" },
    { name: "walk", kind: "best", bodies: TABLE_BODIES, limbs: always, readings: () => [{ drill: "locomotion", protocol: "every", subject: TABLE_MIND, judge: "walk", byLoadout: true }],
      bar: "the share of the Locomotion screen's trials not fallen, its walks in the gusts; the forward pace read beside it" },
    { name: "run", kind: "met", bodies: ["workshop-fighter", "workshop-rogue"], limbs: always,
      readings: body => body === "workshop-fighter"
        ? [{ drill: "travel", protocol: "confirmation", subject: TABLE_MIND, judge: "travel", byLoadout: true }]
        : [{ drill: "locomotion", protocol: "run", subject: TABLE_MIND, judge: "run", byLoadout: true }],
      bar: "Warrior: 4 m/s forward, directional travel, steering, corners, reversals and stops, both first legs; Rogue: the Locomotion run bar; calm and gusts, seeds 1 to 4" },
    { name: "punch", kind: "best", bodies: TABLE_BODIES, limbs: (loadout) => holds(loadout, "empty"), readings: (body, loadout) => blowRungs("straight-punch", "fist", body, loadout),
      bar: `the fist's speed over its last 0.1 m, ${BLOW}` },
    { name: "stomp", kind: "best", bodies: STOMPERS, limbs: always, readings: (body, loadout) => [strikeRung("stomping", "landed", "foot", "stomp", body, loadout)],
      bar: `the foot's speed into the contact, ${BLOW}` },
    { name: "club-blow", kind: "best", bodies: TABLE_BODIES, limbs: (loadout) => holds(loadout, "club"), readings: (body, loadout) => blowRungs("club-blow", "energy", body, loadout),
      bar: `the blow's energy, ${BLOW}` },
    { name: "cut", kind: "best", bodies: TABLE_BODIES, limbs: (loadout) => holds(loadout, "sword"), readings: (body, loadout) => blowRungs("cut", "edge", body, loadout),
      bar: `the blade's far end's speed into the contact, ${BLOW}` },
    { name: "thrust", kind: "best", bodies: TABLE_BODIES, limbs: (loadout) => holds(loadout, "sword"), readings: (body, loadout) => blowRungs("sword-thrust", "point", body, loadout),
      bar: `the point's closing speed at the contact, ${BLOW}` },
    { name: "buckler-cover", kind: "best", bodies: TABLE_BODIES, limbs: (loadout) => holds(loadout, "buckler"),
      readings: () => [{ drill: "cover", protocol: "club", subject: TABLE_MIND, judge: "buckler", byLoadout: true },
        { drill: "cover", protocol: "sword", subject: TABLE_MIND, judge: "buckler", byLoadout: true }],
      bar: "against a club and a sword on a rhythm, the share of the blows that touch the body the buckler meets first" },
  ] satisfies readonly Skill[]);

  /** **Every cell** of the table: body by loadout by skill, where the body does the skill and the loadout leaves it its limb. */
  const tableCells = (): readonly Cell[] => TABLE_BODIES.flatMap((body) => TABLE_LOADOUTS.flatMap((loadout) => TABLE_SKILLS
    .filter((skill) => skill.bodies.includes(body) && skill.limbs(loadout))
    .map((skill): Cell => skill.kind === "met" ? { body, loadout, skill: skill.name, bar: skill.bar, kind: "met", readings: skill.readings(body, loadout) }
      : { body, loadout, skill: skill.name, bar: skill.bar, kind: "best", readings: skill.readings(body, loadout) })));

  return { TABLE_SKILLS, tableCells };
}
