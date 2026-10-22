/**
 * **A fall as a case**: one body shoved, dropped or placed on the ground of the Lab's Stand-up mode
 * (`startGround`, `src/lab/ground-mode.ts`), in a world of its own with the arena's solids, its
 * stand verified as the Lab verifies it. The rising bed (`rising.ts`) and the fall evaluations play
 * this one path. It is not bit-equal between JavaScript engines: the starts and the shove
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
import type { HumanoidModel } from "../core/models.ts";
import { balanceCeiling, balancePercent, rulebook } from "../core/rules/rulebook.ts";
import type { BodySpec } from "../core/spec/body.ts";
import { createWorld, type World } from "../core/world.ts";
import { labActor, type Actor } from "../lab/actor.ts";
import { groundPlacement } from "../lab/ground-starts.ts";
import { startGround, targetImpulse } from "../lab/ground-mode.ts";
import type { GroundLevel } from "../lab/ground-environment.ts";
import { loadoutSpec } from "../lab/loadout.ts";
import { labAddress, type LabAddress } from "../lab/scenarios.ts";
import type { Cases, Json, Reader } from "./evaluation.ts";

/**
 * One fall, as plain data: the body (a humanoid model with an item in its right hand, or a
 * loadout), the start and its seed, the level, the assists, and the riser's mind in full. `target`,
 * `obstacle` and `equipped` read the stand by its verification (`STAND_CHECK`) and shove by the
 * target's impulse; otherwise by the mind's hand-back. `factor` raises every muscle's peak torques
 * (`strengthSpec`), a research experiment's, never the game's. `cap` is the recovery's, s.
 */
export interface FallCase {
  readonly model: HumanoidModel;
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
  readonly mind: FighterConfig;
}

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
  const address: LabAddress = { ...defaults, model: fall.model, right: fall.loadout?.right ?? fall.held ?? "empty", left: fall.loadout?.left ?? "empty", balance, seed: fall.seed,
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
  readonly actor: Actor;
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
export async function buildFall(fall: FallCase, engine: EngineName, { start = fallStart(fall), subs }: {
  start?: ReturnType<typeof fallStart>; subs?: BodyOptions["subs"];
} = {}): Promise<BuiltFall> {
  const { spec, placement } = start, balance = fall.balance ?? 0, verifying = Boolean(fall.target || fall.obstacle || fall.equipped);
  const babylon = new NullEngine(), scene = new Scene(babylon);
  const world = createWorld(scene, await loadEngine(engine));
  addArenaSolids(world.physics);
  const body = buildBody(spec, world, placement);
  const address = verifying ? { ...start.address, ground: { ...start.address.ground, impulse: targetImpulse(body) } } : start.address;
  const actor = labActor(body, world, { mind: fall.mind, ...(subs ? { subs } : {}),
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

/** A fall's reader: the fall's own ending, and its reading. */
export function readFall(built: BuiltFall): Reader<FallReading> {
  return { afterStep: () => built.afterStep(), get ended() { return built.ended; }, reading: () => built.reading() };
}

/**
 * A suite of falls as a protocol: each fall a condition, played on Rapier as the rising bed plays
 * it, the riser's mind (a fighter's, its host and sub-minds) the subject.
 */
export function fallCases<C extends Json & Omit<FallCase, "mind">>(play: Json, conditions: readonly C[]): Cases<C, FallReading, BuiltFall> {
  return {
    arity: 1, play, conditions, engine: "rapier", seconds: FALL_CAP + FALL_AFTER,
    faults: (value) => typeof value === "object" && value !== null && !Array.isArray(value) && isFighter(value as unknown as MindConfig) ? [] : ["a riser is a fighter's mind"],
    world: ([mind], condition, engine) => ({ kind: "fall", engine, fall: { ...(condition as Omit<FallCase, "mind">), mind: mind as unknown as FighterConfig } }),
    read: (built) => readFall(built),
  };
}
