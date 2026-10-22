/**
 * **The buckler task's cases**: the Duellist with sword and buckler stands where it is ordered to,
 * facing `angle` degrees off the line to its attacker (positive to its right), and covers by the
 * subject's cover; with `own`, it also throws its own actions at the attacker as it stands. The
 * attacker is the blade task's striker (`bladeStriker`) with a sword alone, whose only blow is its
 * sword hand's swing at `at`: a mark (`high`, `middle`) or a segment of the defender's (its sword
 * arm, `upperArm.right`). Each of the attacker's swings that touches the defender is read from its
 * commitment to its end: whether the buckler met the blade before any of the defender's body did,
 * and the wound the defender took.
 */
import { levelSpawn } from "../../arena/levels.ts";
import { DUELLIST, type BehavioursConfig, type FighterConfig, type MindConfig } from "../../core/mind/config.ts";
import { cos, sin } from "../../core/math/real.ts";
import type { BodyModel } from "../../core/models.ts";
import { deepFreeze } from "../../core/state.ts";
import { PHYSICS_HZ } from "../../core/world.ts";
import { bladeStriker } from "../blade/cases.ts";
import type { Cases, Json } from "../evaluation.ts";

/** The defender: the Duellist standing to its orders and covering by `cover`, throwing its own actions at its foe with `own`. */
function defender(own: boolean, cover: Json): MindConfig {
  return deepFreeze({ ...DUELLIST, tactics: { ...(DUELLIST.tactics as BehavioursConfig), list: [{ kind: "follow-orders" }, ...(own ? [{ kind: "attack" }] : []), cover] },
    executors: own ? DUELLIST.executors : [], actions: own ? DUELLIST.actions : [] }) as unknown as FighterConfig;
}

/**
 * The protocol: the defenders' bodies, the angles they face off the line, where they are struck,
 * and whether they throw their own; how far apart the two start, m (a step inside the swing's
 * reach); how long the attacker strikes and how long the task runs on for the swing under way to
 * end, s; how fast the defender is asked to sidestep while it turns, m/s, and for how long, s.
 * A change here is a new protocol.
 */
const BUCKLER = deepFreeze({
  models: ["workshop-fighter", "workshop-rogue"] as BodyModel[],
  angles: [-45, 0, 45],
  at: ["high", "middle", "upperArm.right"],
  own: [false, true],
  gap: 1.6, seconds: 20, return: 2, sidestep: .05, turning: 2,
});

/** One case's conditions: the defender's body, its angle off the line, degrees, where it is struck, and whether it throws its own. */
export type BucklerCondition = { readonly model: BodyModel; readonly angle: number; readonly at: string; readonly own: boolean };

/** One of the attacker's swings: when it committed and ended, s; whether it touched the defender, the buckler first, what first, and the wound, HP. */
export type BucklerSwing = {
  readonly committed: number; readonly ended: number; readonly touched: boolean; readonly met: boolean;
  readonly first: string | null; readonly wound: number;
};

/** What a case came to: the attacker's swings, and whether the defender ended down. */
export type BucklerReading = { readonly seconds: number; readonly swings: readonly BucklerSwing[]; readonly down: boolean };

/** The marks a swing is aimed at by name; anything else is a segment of the defender's. */
const MARKS = new Set(["high", "middle", "legs"]);

function bucklerCases(protocol: typeof BUCKLER): Cases<BucklerCondition, BucklerReading> {
  const conditions: BucklerCondition[] = [];
  for (const own of protocol.own) for (const model of protocol.models) for (const angle of protocol.angles) for (const at of protocol.at) conditions.push({ model, angle, at, own });
  return {
    arity: 1,
    play: protocol as unknown as Json,
    conditions,
    seconds: protocol.seconds + protocol.return,
    faults: (value) => value !== null && typeof value === "object" && !Array.isArray(value) && (value as { kind?: unknown }).kind === "cover" ? [] : ["a cover is a behaviour of kind cover"],
    world: ([cover], { model, angle, at, own }, engine) => {
      const attacker = MARKS.has(at) ? bladeStriker("swing", at as "high" | "middle" | "legs") : (() => {
        const striker = bladeStriker("swing", "middle") as FighterConfig;
        return deepFreeze({ ...striker, actions: striker.actions.map((action) => ({ ...action, regions: [{ kind: "segment", segment: at }] })) }) as unknown as MindConfig;
      })();
      // Facing `angle` off the line from its spawn to the attacker's, turned to the right for a positive
      // angle; a standing body turns only as it steps, so it sidesteps a little while it turns, then stops.
      const from = levelSpawn("open", "right", protocol.gap).position, to = levelSpawn("open", "left", protocol.gap).position;
      const dx = to[0] - from[0], dz = to[2] - from[2], length = Math.sqrt(dx * dx + dz * dz);
      const turn = angle * Math.PI / 180, c = cos(turn), s = sin(turn), face = { x: (dx * c + dz * s) / length, z: (dz * c - dx * s) / length };
      const foe = own ? { foe: "left" } : {};
      return { kind: "bout", engine,
        tape: [{ step: 0, side: "right", orders: { move: { kind: "direct", direction: { x: protocol.sidestep * face.z, z: -protocol.sidestep * face.x } }, face, ...foe } },
          { step: Math.round(protocol.turning * PHYSICS_HZ.value), side: "right", orders: { move: null, face, ...foe } }],
        // A task, not a fight: the defender need throw nothing, so the bout asks no attack of either side (`EntryRule`).
        recipe: { left: "workshop-fighter", right: model, gap: protocol.gap, capSeconds: protocol.seconds + protocol.return + 1, recoverySeconds: null, entry: [],
          loadouts: { left: { left: "empty", right: "sword" }, right: { left: "buckler", right: "sword" } }, minds: { left: attacker, right: defender(own, cover) } } };
    },
    read({ world, duel }) {
      const striking = duel.duelists.left, standing = duel.duelists.right, skills = striking.minded.skills;
      if (!skills) throw new Error("the attacker runs no skills");
      const commits = new Map<number, number>();
      let stop: number | null = null;
      return {
        afterStep() {
          for (const action of skills.report.actions) if (action.phase === "commit" && !commits.has(action.id)) commits.set(action.id, world.time);
          if (stop === null && (world.time >= protocol.seconds || duel.verdict)) stop = world.time + protocol.return;
        },
        get ended() { return stop !== null && (world.time >= stop || skills.report.actions.length === 0); },
        reading() {
          const swings = skills.report.ledger.filter((record) => commits.has(record.id)).map((record) => {
            const contacts = duel.blows.filter((blow) => blow.time >= commits.get(record.id)! && blow.time <= record.ended
              && blow.sides.some((side) => side.fighter === "left" && side.item === "short sword") && blow.sides.some((side) => side.fighter === "right"));
            const first = contacts[0]?.sides.find((side) => side.fighter === "right") ?? null;
            return { committed: commits.get(record.id)!, ended: record.ended, touched: first !== null, met: first?.item === "buckler",
              first: first ? first.item ?? first.segment : null, wound: contacts.reduce((sum, blow) => sum + (blow.sides.find((side) => side.fighter === "right")?.damage ?? 0), 0) };
          });
          return { seconds: world.time, swings, down: standing.body.down };
        },
      };
    },
  };
}

/** Every protocol the buckler task may be played on, by name. */
export const BUCKLER_CASES: Readonly<Record<string, Cases<BucklerCondition, BucklerReading>>> = Object.freeze({ standard: bucklerCases(BUCKLER) });
