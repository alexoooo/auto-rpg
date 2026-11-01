/**
 * **The table's cells**: every body by loadout by skill Option Mind is asked to do, each with the
 * drill readings that judge it against its bar (`Skill.bar`, in words). A loadout is a record of slots (`Loadout`, today the two hands), so a slot added to
 * it (a worn piece) adds to the loadout axis without reshaping a cell. A skill has a cell where the
 * loadout leaves it the limb it uses (`Skill.limbs`).
 */
import { loadoutKey, REPRESENTATIVE, type Held, type Loadout } from "../../core/items/held.ts";
import type { HumanoidModel } from "../../core/models.ts";
import type { Side } from "../../core/spec/body.ts";

/** The bodies the table reads: the toed Warrior, the Rogue and the Skeleton. */
export const TABLE_BODIES: readonly HumanoidModel[] = Object.freeze(["workshop-fighter", "workshop-rogue", "crypt-skeleton"]);

/** The loadouts the table reads: the five minds are rated on (`REPRESENTATIVE`). */
export const TABLE_LOADOUTS: readonly Loadout[] = REPRESENTATIVE;

/** The mind every cell reads: Option Mind's preset. */
export const TABLE_MIND = "option";

/**
 * **How a reading is judged**: a strike rung by its share landed of those thrown (`landed`), or of
 * those that met the body past its arms (`on-body`, a fight's), with none fallen; the owner's
 * target's gates on one group of sixteen falls (`target`); none fallen across a walk's trials
 * (`walk`).
 */
export type Judge = "landed" | "on-body" | "target" | "walk";

/**
 * **One drill reading of a cell**: the evaluation, its protocol and the subject it reads, and how
 * its rows on the cell's body are judged; or, where no protocol plays the cell, what one must play
 * (`missing`).
 */
export type Reading =
  | { readonly drill: string; readonly protocol: string; readonly subject: string; readonly judge: Judge; readonly loadout?: Loadout }
  | { readonly drill: string; readonly missing: string };

/** A cell: its body, loadout, skill and the readings that judge it, all of which must meet its bar. */
export interface Cell {
  readonly body: HumanoidModel;
  readonly loadout: Loadout;
  readonly skill: string;
  readonly bar: string;
  readonly readings: readonly Reading[];
}

/** Which hands of `loadout` hold `held`. */
const handsHolding = (loadout: Loadout, held: Held): readonly Side[] => (["left", "right"] as const).filter((hand) => loadout[hand] === held);

/** The Strike drill's subject for `action` with the striker holding `loadout`: none named for empty hands. */
const strikeSubject = (action: string, loadout: Loadout): string =>
  `${TABLE_MIND}/${action}${loadout.left === "empty" && loadout.right === "empty" ? "" : `@${loadoutKey(loadout)}`}`;

/** Whether the Strike drill's protocol plays `body`: its `models` (`src/evaluation/strike/cases.ts`). */
const STRIKE_BODIES: Readonly<Record<string, readonly HumanoidModel[]>> = Object.freeze({
  still: ["workshop-fighter", "workshop-rogue"], walk: ["workshop-fighter"], fight: ["workshop-fighter"],
  stomping: ["workshop-fighter"], kicking: ["workshop-fighter", "crypt-skeleton"],
});

/** A strike rung's reading of `action` on `body` holding `loadout`, or what is missing where the rung does not play the body. */
function strikeRung(protocol: string, judge: Judge, action: string, body: HumanoidModel, loadout: Loadout): Reading {
  return STRIKE_BODIES[protocol]!.includes(body) ? { drill: "strike", protocol, subject: strikeSubject(action, loadout), judge }
    : { drill: "strike", missing: `the ${protocol} rung on ${body}` };
}

/** A blow's rungs: the Strike drill's still, walk and fight (the plan's bar). */
const blowRungs = (action: string, body: HumanoidModel, loadout: Loadout): readonly Reading[] =>
  [strikeRung("still", "landed", action, body, loadout), strikeRung("walk", "landed", action, body, loadout), strikeRung("fight", "on-body", action, body, loadout)];

/** Whether `loadout` is the target's: empty hands or the club alone in the right (`risingJobs`, `target`). */
const onTarget = (loadout: Loadout): boolean => loadout.left === "empty" && (loadout.right === "empty" || loadout.right === "club");

/** The equipped falls' loadouts (`src/evaluation/equipped-rise/cases.ts`). */
const EQUIPPED = ["buckler,sword", "empty,club", "buckler,club"];

/** The stand-up's reading on `body` holding `loadout`: the owner's target or the equipped falls, where either plays it. */
function standUp(body: HumanoidModel, loadout: Loadout): Reading {
  const humans = body === "workshop-fighter" || body === "workshop-rogue";
  if (humans && onTarget(loadout)) return { drill: "rising-target", protocol: "standard", subject: "game", judge: "target", loadout };
  if (humans && EQUIPPED.includes(loadoutKey(loadout))) return { drill: "equipped-rise", protocol: "standard", subject: TABLE_MIND, judge: "target", loadout };
  return { drill: "rising-target", missing: `the target's sixteen shoves on ${body} holding ${loadoutKey(loadout)}` };
}

/**
 * **A skill**: its name, its bar in words, the limbs a loadout must leave it (none for the whole
 * body's), and its readings on a body holding a loadout.
 */
interface Skill {
  readonly name: string;
  readonly bar: string;
  readonly limbs: (loadout: Loadout) => boolean;
  readonly readings: (body: HumanoidModel, loadout: Loadout) => readonly Reading[];
}

const always = () => true;

/** **Every skill the table reads**, in the order it prints them. */
export const TABLE_SKILLS: readonly Skill[] = Object.freeze([
  { name: "stand-up", limbs: always, readings: (body, loadout) => [standUp(body, loadout)],
    bar: "the owner's target's gates on each group of 16 (Warrior, Rogue); at least 15 of 16 stood (Skeleton)" },
  { name: "walk", limbs: always,
    readings: (body, loadout) => body !== "crypt-skeleton" && loadoutKey(loadout) === "empty,empty" ? [{ drill: "locomotion", protocol: "screen", subject: TABLE_MIND, judge: "walk" }]
      : [{ drill: "locomotion", missing: `the screen on ${body} holding ${loadoutKey(loadout)}` }],
    bar: "the Locomotion screen, shoves and gusts, none fallen, the forward pace no less than today's" },
  { name: "run", limbs: always, readings: () => [{ drill: "locomotion", missing: "the run's bar: 3 m/s held 10 s, turns at 1 rad/s at 2 m/s, a stop from 3 m/s within 1.5 s" }],
    bar: "3 m/s held 10 s, turns at 1 rad/s at 2 m/s, a stop from 3 m/s in 1.5 s, calm and gusts, seeds 1 to 4, none fallen" },
  { name: "punch", limbs: (loadout) => handsHolding(loadout, "empty").length > 0, readings: (body, loadout) => blowRungs("straight-punch", body, loadout),
    bar: "90 % landed at the body's scaled punch bar (`BAR`, `barOf`), none fallen" },
  { name: "stomp", limbs: always, readings: (body, loadout) => [strikeRung("stomping", "landed", "stomp", body, loadout)],
    bar: "90 % landed, none fallen; its human figure is a force (Schirmer 2016), no speed bar yet" },
  { name: "front-kick", limbs: always, readings: (body, loadout) => [strikeRung("kicking", "landed", "low-kick", body, loadout)],
    bar: "90 % landed at the ankle's 6.4 m/s (Landeo & McIntosh 2007, less one SD), none fallen" },
  { name: "club-blow", limbs: (loadout) => handsHolding(loadout, "club").length > 0, readings: (body, loadout) => blowRungs("club-blow", body, loadout),
    bar: "90 % landed at 64.8 J (`BAR.held`), met blunt, none fallen" },
  { name: "cut", limbs: (loadout) => handsHolding(loadout, "sword").length > 0, readings: (body, loadout) => blowRungs("sword-cut", body, loadout),
    bar: "90 % landed at the edge's speed (Muggenthaler 2018 less one SD), met with the edge, none fallen" },
  { name: "thrust", limbs: (loadout) => handsHolding(loadout, "sword").length > 0, readings: (body, loadout) => blowRungs("sword-thrust", body, loadout),
    bar: "90 % landed at the point's 4.6 m/s (Horsfall 1999 less one SD), met with the point, none fallen" },
  { name: "buckler-cover", limbs: (loadout) => handsHolding(loadout, "buckler").length > 0,
    readings: () => [{ drill: "cover", missing: "a rung against a weapon" }],
    bar: "the buckler meets 4 of 5 blows that reach the body, before the body does" },
] satisfies readonly Skill[]);

/** **Every cell** of the table: body by loadout by skill, where the loadout leaves the skill its limb. */
export const tableCells = (): readonly Cell[] => TABLE_BODIES.flatMap((body) => TABLE_LOADOUTS.flatMap((loadout) => TABLE_SKILLS
  .filter((skill) => skill.limbs(loadout)).map((skill): Cell => ({ body, loadout, skill: skill.name, bar: skill.bar, readings: skill.readings(body, loadout) }))));
