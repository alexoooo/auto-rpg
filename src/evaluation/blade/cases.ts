/**
 * **The blade task's cases**: a standing striker with sword and buckler whose only blow is one
 * action of its sword hand at one mark (`high`, `middle`, `legs`): the blade's cut or thrust,
 * against a standing Warrior with empty hands that only
 * stands, on the open stage, for the protocol's seconds, and on until the swing under way has
 * returned if a blow ended the fight. Each blow of the striker's blade on the target's body is
 * read: the closing speed at contact (driven, before the contact's own impulse), the energy and
 * wound the rules give, the region and mechanism; each action, when it committed and released, how
 * it ended and how long its return took; and whether the striker was down within `felled` s of a
 * blow. The subject is the striker's executor tuning, over the executor's defaults.
 */
import type { MindConfig } from "../../core/mind/config.ts";
import { BEHAVIOURS } from "../../entrants/classic/presets.ts";
import { FIGHTING } from "../../core/tactics/config.ts";
import { STANDS } from "../drill-opponents.ts";
import type { BodyModel } from "../../core/models.ts";
import { deepFreeze } from "../../core/state.ts";
import type { Cases, Json } from "../evaluation.ts";

/** The executor each style is thrown by. */
const KINDS = Object.freeze({ cut: "blade-cut", thrust: "blade-thrust" });

type BladeStyle = keyof typeof KINDS;
export type Mark = "high" | "middle" | "legs";

/** A striker whose only blow is `style` (`KINDS`) at `mark`, with the executor's `tuning` over its defaults. */
export function bladeStriker(style: BladeStyle, mark: Mark, tuning?: Json): MindConfig {
  const kind = KINDS[style];
  if (!kind) throw new Error(`no style ${style}: one of ${Object.keys(KINDS).join(", ")}`);
  return deepFreeze({ ...BEHAVIOURS, tactics: { ...FIGHTING, choose: { kind: "rotate", rethink: .2, patience: 2 }, list: [{ kind: "attack" }, { kind: "approach" }, { kind: "cover", guard: "cover" }] },
    executors: [{ kind, name: kind, ...(tuning ? { tuning } : {}) }],
    actions: [{ name: style, executor: kind, effectors: ["hand.right"], regions: [{ kind: "mark", mark }], aim: { kind: "centre", lead: 0 } }] });
}

/**
 * The protocol: the strikers' bodies, styles and marks; how far apart the two start, m (a step
 * inside the blade's reach, so the striker steps in to its window); how long it strikes, how long
 * after a blow the striker counts as felled by it, and how long the task runs on for the swing
 * under way to return, s. A change here is a new protocol.
 */
export const BLADE = deepFreeze({
  models: ["workshop-fighter", "workshop-rogue"] as BodyModel[],
  styles: ["cut", "thrust"] as BladeStyle[],
  marks: ["high", "middle"] as Mark[],
  gap: 1.4, seconds: 12, felled: 2, return: 2,
});

/** One case's conditions: the striker's body, the style of its blow and the mark it aims at. */
export type BladeCondition = { readonly model: BodyModel; readonly style: BladeStyle; readonly mark: Mark };

/** A blow of the striker's blade on the target's body. */
type BladeBlow = {
  readonly time: number; readonly closing: number; readonly energy: number; readonly region: string | null;
  readonly segment: string; readonly mechanism: string; readonly damage: number; readonly felled: boolean;
};

/** One of the striker's actions: how it ended, and when it began, committed, released and ended, s. */
type BladeAction = {
  readonly ending: string; readonly committed: number | null; readonly released: number | null;
  readonly began: number; readonly ended: number; readonly returned: number | null;
};

/** What a case came to: its blows and actions, whether the striker ended down, and the mechanism a cut is read by. */
export type BladeReading = {
  readonly seconds: number;
  readonly mechanism: "edge" | "point";
  readonly blows: readonly BladeBlow[];
  readonly actions: readonly BladeAction[];
  readonly down: boolean;
};

/** A subject's tuning as the striker's executor takes it: none for an empty one. */
const tuningOf = (value: Json): Json | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length > 0 ? value : undefined;

/** The blade task's cases on `protocol` (`BLADE` or another of its shape): a search plays its own (`research/skill-search.mjs`). */
export function bladeCases(protocol: Omit<typeof BLADE, "gap"> & { readonly gap: number }): Cases<BladeCondition, BladeReading> {
  const conditions: BladeCondition[] = [];
  for (const model of protocol.models) for (const style of protocol.styles) for (const mark of protocol.marks) conditions.push({ model, style, mark });
  return {
    arity: 1,
    play: protocol as unknown as Json,
    conditions,
    seconds: protocol.seconds + protocol.return,
    faults: (value) => value !== null && typeof value === "object" && !Array.isArray(value) ? [] : ["a tuning is an object of the executor's fields"],
    world: ([tuning], { model, style, mark }, engine) => ({
      kind: "bout", engine, tape: [],
      // A task, not a fight: the target throws nothing, so the bout asks no attack of either side (`EntryRule`).
      recipe: { left: model, right: "workshop-fighter", gap: protocol.gap, capSeconds: protocol.seconds + 1, recoverySeconds: null, entry: [],
        loadouts: { left: { left: "buckler", right: "sword" }, right: { left: "empty", right: "empty" } },
        minds: { left: bladeStriker(style, mark, tuningOf(tuning)), right: STANDS } },
    }),
    read({ world, duel }, { style }) {
      const striker = duel.duelists.left, skills = striker.minded.skills;
      if (!skills) throw new Error("the striker runs no skills");
      const commits = new Map<number, number>(), releases = new Map<number, number>(), downs: number[] = [];
      let stop: number | null = null;
      return {
        afterStep() {
          for (const action of skills.report.actions) {
            if (action.phase === "commit" && !commits.has(action.id)) commits.set(action.id, world.time);
            if (action.phase === "release" && !releases.has(action.id)) releases.set(action.id, world.time);
          }
          if (striker.body.down) downs.push(world.time);
          if (stop === null && (world.time >= protocol.seconds || duel.verdict)) stop = world.time + protocol.return;
        },
        get ended() { return stop !== null && (world.time >= stop || skills.report.actions.length === 0); },
        reading() {
          const blows = duel.blows.filter((blow): blow is Extract<typeof blow, { kind: "impact" }> => blow.kind === "impact" && blow.sides.some((side) => side.fighter === "left" && side.item === "short sword")
            && blow.sides.some((side) => side.fighter === "right" && side.item === null)).map((blow) => {
            const blade = blow.sides.find((side) => side.fighter === "left")!, body = blow.sides.find((side) => side.fighter === "right")!;
            return { time: blow.time, closing: blow.closing, energy: blow.energy, region: blade.region ?? null, segment: body.segment, mechanism: body.mechanism ?? "blunt",
              damage: body.damage, felled: downs.some((t) => t >= blow.time && t <= blow.time + protocol.felled) };
          });
          const actions = skills.report.ledger.map((record) => ({ ending: record.ending.kind, committed: commits.get(record.id) ?? null, released: releases.get(record.id) ?? null,
            began: record.began, ended: record.ended, returned: releases.has(record.id) ? record.ended - releases.get(record.id)! : null }));
          return { seconds: world.time, mechanism: style === "thrust" ? "point" : "edge", blows, actions, down: striker.body.down };
        },
      };
    },
  };
}

/** Every protocol the blade task may be played on, by name. */
export const BLADE_CASES: Readonly<Record<string, Cases<BladeCondition, BladeReading>>> = Object.freeze({ standard: bladeCases(BLADE) });
