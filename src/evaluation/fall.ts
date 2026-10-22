/**
 * **A fall as a case**: one body, any model under any mind, in a world of its own with the arena's
 * solids. A fighter on a body the command layers read falls on the Lab's stand bed: shoved, dropped
 * or placed on the ground of the Stand-up mode (`startGround`, `src/lab/ground-mode.ts`), its stand
 * verified as the Lab verifies it; the rising bed (`rising.ts`) and the fall evaluations play it.
 * Any other falls on the lone-body bed (`buildLoneFall`): built standing as a fight builds it,
 * shoved, and read by the fight's down rule. It is not bit-equal between JavaScript engines: the starts and the shove
 * (`src/lab/ground-starts.ts`, `stance-mode.ts`) use arithmetic each engine rounds its own way.
 */
import type { BodyOptions } from "../core/body.ts";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { addArenaSolids } from "../arena/room.ts";
import { buildBody, type BuiltBody } from "../core/build/build-body.ts";
import { loadEngine, type EngineName } from "../core/engine/engines.ts";
import { loadoutFaults, type Held, type Loadout } from "../core/items/held.ts";
import { isFighter, type FighterConfig, type MindConfig } from "../core/mind/config.ts";
import { modelHolding, modelSpec, type BodyModel, type HumanoidModel } from "../core/models.ts";
import { commandable } from "../core/body.ts";
import { enlist } from "../core/combatant.ts";
import { createSenses } from "../core/mind/senses.ts";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { balanceCeiling, balancePercent, rulebook } from "../core/rules/rulebook.ts";
import type { BodySpec } from "../core/spec/body.ts";
import { createWorld, type World } from "../core/world.ts";
import { labActor, type Actor } from "../lab/actor.ts";
import { groundPlacement } from "../lab/ground-starts.ts";
import { groundShove, startGround, targetImpulse } from "../lab/ground-mode.ts";
import type { GroundLevel } from "../lab/ground-environment.ts";
import { loadoutSpec } from "../lab/loadout.ts";
import { labAddress, type LabAddress } from "../lab/scenarios.ts";
import type { Cases, Json, Reader } from "./evaluation.ts";

/**
 * One fall, as plain data: the body (a model with an item in its right hand, or a loadout), the start and its seed, the level, the assists, and the riser's mind in full. `target`,
 * `obstacle` and `equipped` read the stand by its verification (`STAND_CHECK`) and shove by the
 * target's impulse; otherwise by the mind's hand-back. `factor` raises every muscle's peak torques
 * (`strengthSpec`), a research experiment's, never the game's. `cap` is the recovery's, s.
 */
export interface FallCase {
  readonly model: BodyModel;
  readonly held?: Held;
  readonly loadout?: Loadout;
  readonly seed: number;
  readonly start: "shoved" | "dropped" | "placed";
  readonly degrees?: number | null;
  readonly posture?: LabAddress["ground"]["posture"];
  readonly level?: GroundLevel;
  readonly impulse?: number | null;
  readonly gusts?: boolean;
  readonly balance?: number;
  readonly grit?: number;
  readonly factor?: number;
  readonly cap?: number;
  readonly target?: boolean;
  readonly obstacle?: boolean;
  readonly equipped?: boolean;
  readonly mind: MindConfig;
}

/** Whether `fall` is played on the Lab's stand bed: a fighter, whose tactics take the Lab's script, on a body the command layers read; otherwise on the lone-body bed. */
export const onStandBed = (fall: Pick<FallCase, "model" | "mind">): boolean => isFighter(fall.mind) && commandable(modelSpec(fall.model));

/** The longest recovery a fall is given, s, and how long past it a fall may run. */
export const FALL_CAP = 30, FALL_AFTER = 4;

/** What a fall came to: its verdict, the meter's times and trail (`groundMeter`), and the verification's. */
export type FallReading = {
  readonly status: "stood" | "landed standing" | "no takeover" | "fell after verification" | "failed";
  readonly stood: boolean;
  readonly handback: number | null;
  readonly handBackReason: string | null;
  readonly takeover: number | null;
  readonly verified: number | null;
  readonly walked: number | null;
  readonly trail: Json;
  readonly attempts: Json;
  readonly phases: Json;
  readonly assist: Json;
};

/** `spec` with every muscle's peak torques scaled by `factor`: a search's raised ceilings, never the game's. */
export function strengthSpec(spec: BodySpec, factor: number): BodySpec {
  if (factor === 1) return spec;
  return { ...spec, joints: spec.joints.map(joint => ({ ...joint, dofs: joint.dofs.map(dof => ({ ...dof,
    muscle: { ...dof.muscle, peakPositive: { ...dof.muscle.peakPositive, value: dof.muscle.peakPositive.value * factor },
      peakNegative: { ...dof.muscle.peakNegative, value: dof.muscle.peakNegative.value * factor } } })) })) };
}

/** Throws for a fall the bed does not play: a loadout on the target or one that does not fit, Grit, or the target off the open floor. */
export function checkFall(fall: Pick<FallCase, "target" | "loadout" | "grit" | "level">): void {
  if (fall.target && fall.loadout !== undefined) throw new Error("the owner target fixes its loadouts");
  if (fall.loadout !== undefined) {
    const faults = loadoutFaults(fall.loadout);
    if (faults.length) throw new Error(faults.join("; "));
  }
  if (fall.grit !== undefined && fall.grit !== 0) throw new Error("the unassisted rising bed fixes Grit 0");
  if (fall.target && fall.level && fall.level !== "open") throw new Error("the owner's target fixes the open floor");
}

/** Where a fall starts: its address in the Lab, its body and its placement; throws for a fall the bed does not play (`checkFall`) or a start it refuses. */
export function fallStart(fall: FallCase): { address: LabAddress; spec: BodySpec; placement: ReturnType<typeof groundPlacement> } {
  checkFall(fall);
  const defaults = labAddress("?scenario=ground"), balance = fall.balance ?? 0;
  if (!onStandBed(fall)) throw new Error("the Lab's stand bed drives a fighter on a body the command layers read");
  const address: LabAddress = { ...defaults, model: fall.model as HumanoidModel, right: fall.loadout?.right ?? fall.held ?? "empty", left: fall.loadout?.left ?? "empty", balance, seed: fall.seed,
    ground: { ...defaults.ground, level: fall.level ?? "open", start: fall.start, posture: fall.posture ?? "back", degrees: fall.degrees ?? null,
      impulse: fall.impulse ?? null, gusts: fall.gusts ?? false } };
  const factor = fall.factor ?? 1;
  if (!Number.isFinite(factor) || factor < 1 || factor > 2) throw new Error("research strength factor stays between 1 and 2");
  const spec = strengthSpec(loadoutSpec(address), factor);
  return { address, spec, placement: groundPlacement(spec, address) };
}

/** A fall's world, played a step at a time: after each step `afterStep`, until `ended`; then its `reading`. */
export interface BuiltFall {
  readonly world: World;
  readonly body: BuiltBody;
  /** The Lab's actor on the stand bed; null on the lone-body bed. */
  readonly actor: Actor | null;
  readonly ended: boolean;
  afterStep(): void;
  reading(): FallReading;
  dispose(): void;
}

/**
 * `fall`'s world on `engine`, from its start (`fallStart`'s, unless given): the body built in its
 * placement, its mind hosted as the Lab hosts it (`subs` in place of the config's sub-minds, an
 * experiment's) with its balance's assist, and the Stand-up mode started. It ends once the stand is
 * verified or failed (`target`, `obstacle`, `equipped`), else at hand-back or when the run stops;
 * at `FALL_AFTER` s past the cap in any case.
 */
export async function buildFall(fall: FallCase, engine: EngineName, given: {
  start?: ReturnType<typeof fallStart>; subs?: BodyOptions["subs"];
} = {}): Promise<BuiltFall> {
  if (!onStandBed(fall)) return buildLoneFall(fall, engine);
  const { start = fallStart(fall), subs } = given;
  const { spec, placement } = start, balance = fall.balance ?? 0, verifying = Boolean(fall.target || fall.obstacle || fall.equipped);
  const babylon = new NullEngine(), scene = new Scene(babylon);
  const world = createWorld(scene, await loadEngine(engine));
  addArenaSolids(world.physics);
  const body = buildBody(spec, world, placement);
  const address = verifying ? { ...start.address, ground: { ...start.address.ground, impulse: targetImpulse(body) } } : start.address;
  // On the stand bed the mind is a fighter's (`onStandBed`).
  const actor = labActor(body, world, { mind: fall.mind as FighterConfig, ...(subs ? { subs } : {}),
    assist: balanceCeiling(balance, balancePercent(rulebook("arena"))) });
  const cap = Math.min(FALL_CAP, fall.cap ?? FALL_CAP);
  const run = startGround(actor, address, { cap }), check = run.check.state;
  let stood = false, ended = false, read: FallReading | null = null;
  return {
    world, body, actor,
    get ended() { return ended; },
    afterStep() {
      if (verifying) {
        if (run.check.done()) { stood = check.stage === "stood"; ended = true; }
        else if (check.takeover === null && world.time >= 4) ended = true;
      } else if (run.meter.state.handback !== null) { stood = true; ended = true; }
      else if (run.state.status !== "running"
        || run.meter.state.from !== null && world.time - run.meter.state.from >= cap
        || run.meter.state.from === null && world.time >= 4) ended = true;
      if (world.time >= cap + FALL_AFTER) ended = true;
    },
    reading() {
      if (read) return read;
      if (!stood) run.meter.cap();
      const frame = run.frame();
      read = { status: stood ? "stood" : run.state.status === "landed standing" ? "landed standing"
        : check.takeover === null && fall.start === "shoved" ? "no takeover" : check.stage === "fell after verification" ? "fell after verification" : "failed",
        stood, handback: frame.handback, handBackReason: frame.handBackReason, takeover: check.takeover, verified: check.verified, walked: check.walked,
        trail: frame.trail as unknown as Json, attempts: frame.attempts as unknown as Json, phases: frame.phases as unknown as Json, assist: frame.assist as unknown as Json };
      return read;
    },
    dispose() { run.dispose(); body.dispose(); world.dispose(); scene.dispose(); babylon.dispose(); },
  };
}

/** Why the lone-body bed cannot play `fall`, each a sentence: a start other than a shove, or a stand verification. */
function loneFaults(fall: Pick<FallCase, "start" | "target" | "obstacle" | "equipped">): readonly string[] {
  return [...fall.start !== "shoved" ? [`a ${fall.start} start is installed for the humanoid's postures: the lone-body bed shoves`] : [],
    ...fall.target || fall.obstacle || fall.equipped ? ["the stand verification walks the command layers' stand: the lone-body bed reads the fight's down rule"] : []];
}

/** How long a body on the lone-body bed stays up after it was down before it has stood, s. */
const LONE_STOOD = 1;

/**
 * **The lone-body bed**: `fall`'s body built standing in its mind's posture and enlisted as a fight
 * enlists it (`enlist`), alone, with no orders; at 1 s its root is shoved by the fall's impulse
 * (the Lab's draw from its seed, unless given) at its degrees from +z. Taken over when it is first
 * down by the fight's rule (`PhysicalBody.down`), it has stood once it has been up `LONE_STOOD` s
 * since. It ends as the stand bed's does. Only a shove: a dropped or placed start is installed for
 * the humanoid's postures, and the stand verification walks the command layers' stand.
 */
export async function buildLoneFall(fall: FallCase, engine: EngineName): Promise<BuiltFall> {
  checkFall(fall);
  const refused = loneFaults(fall)[0];
  if (refused) throw new Error(refused);
  const factor = fall.factor ?? 1;
  if (!Number.isFinite(factor) || factor < 1 || factor > 2) throw new Error("research strength factor stays between 1 and 2");
  const spec = strengthSpec(modelHolding(fall.model, fall.loadout ?? { left: "empty", right: fall.held ?? "empty" }), factor);
  const babylon = new NullEngine(), scene = new Scene(babylon);
  const world = createWorld(scene, await loadEngine(engine));
  addArenaSolids(world.physics);
  const fighter = enlist(world, { id: "fall", side: "fall", name: "fall", spec, rules: rulebook("arena"), mind: fall.mind, at: [0, 0, 0],
    senses: createSenses(world), out: () => false, orders: () => null, balance: fall.balance ?? 0 });
  const defaults = labAddress("?scenario=ground");
  const { impulse, degrees } = groundShove({ seed: fall.seed, ground: { ...defaults.ground, degrees: fall.degrees ?? null, impulse: fall.impulse ?? null } });
  const root = fighter.built.segments.get(spec.segments.find((segment) => !spec.joints.some((joint) => joint.child === segment.name))!.name)!;
  const cap = Math.min(FALL_CAP, fall.cap ?? FALL_CAP), at = new Vector3(), turn = new Quaternion();
  const state = { shoved: false, takeover: null as number | null, up: null as number | null, stood: null as number | null, ended: false };
  // After the body's control, before the solver: the bed's hand on the world, at the root's centre of mass.
  const shoving = world.beforeStep(() => {
    if (state.shoved || world.time < 1) return;
    state.shoved = true;
    const a = degrees * Math.PI / 180, centre = root.rigid.centre, origin = root.frame.origin;
    root.node.rotationQuaternion!.multiplyToRef(Quaternion.Inverse(root.rest), turn);
    at.set(centre[0] - origin[0], centre[1] - origin[1], centre[2] - origin[2]).applyRotationQuaternionToRef(turn, at).addInPlace(root.node.position);
    root.body.applyImpulse(new Vector3(impulse * Math.sin(a), 0, impulse * Math.cos(a)), at);
  });
  return {
    world, body: fighter.built, actor: null,
    get ended() { return state.ended; },
    afterStep() {
      const down = fighter.body.down;
      if (state.shoved && state.takeover === null && down) state.takeover = world.time;
      if (state.takeover !== null && state.stood === null) {
        if (down) state.up = null;
        else if ((state.up ??= world.time) <= world.time - LONE_STOOD) state.stood = state.up;
      }
      if (state.stood !== null || state.takeover === null && world.time >= 4
        || state.takeover !== null && world.time - state.takeover >= cap || world.time >= cap + FALL_AFTER) state.ended = true;
    },
    reading: () => ({ status: state.stood !== null ? "stood" : state.takeover === null ? "no takeover" : "failed", stood: state.stood !== null,
      handback: state.stood === null || state.takeover === null ? null : state.stood - state.takeover, handBackReason: null, takeover: state.takeover,
      verified: null, walked: null, trail: [], attempts: [], phases: {}, assist: null }),
    dispose() { shoving.dispose(); fighter.body.dispose(); fighter.built.dispose(); world.dispose(); scene.dispose(); babylon.dispose(); },
  };
}

/** A fall's reader: the fall's own ending, and its reading. */
export function readFall(built: BuiltFall): Reader<FallReading> {
  return { afterStep: () => built.afterStep(), get ended() { return built.ended; }, reading: () => built.reading() };
}

/**
 * A suite of falls as a protocol: each fall a condition, played on Rapier as the rising bed plays
 * it, the riser's mind the subject: a fighter's on the stand bed, any other on the lone-body bed.
 */
export function fallCases<C extends Json & Omit<FallCase, "mind">>(play: Json, conditions: readonly C[]): Cases<C, FallReading, BuiltFall> {
  return {
    arity: 1, play, conditions, engine: "rapier", seconds: FALL_CAP + FALL_AFTER,
    faults: (value, condition) => typeof value !== "object" || value === null || Array.isArray(value) ? ["a riser is a mind's config"]
      : onStandBed({ model: condition.model, mind: value as unknown as MindConfig }) ? [] : loneFaults(condition),
    world: ([mind], condition, engine) => ({ kind: "fall", engine, fall: { ...(condition as Omit<FallCase, "mind">), mind: mind as unknown as MindConfig } }),
    read: (built) => readFall(built),
  };
}
