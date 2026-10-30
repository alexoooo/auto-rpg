/**
 * **A fall as a case**: one body, any model under any mind, in a world of its own with the arena's
 * solids. Every evaluated fall is played on one bed (`buildFall`): the body enlisted as a fight
 * enlists it, shoved as the owner's target shoves, and its stand verified as the Lab verifies one,
 * whatever its mind. The research rising bed (`rising.ts`) plays a fighter on the Lab's stand bed
 * (`buildStandFall`): shoved, dropped or placed on the ground of the Stand-up mode (`startGround`,
 * `src/lab/ground-mode.ts`), its sub-minds replaceable and its actor read. It is not bit-equal
 * between JavaScript engines: the starts and the shove (`src/lab/ground-starts.ts`,
 * `stance-mode.ts`) use arithmetic each engine rounds its own way.
 */
import type { BodyOptions } from "../core/body.ts";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { addArenaSolids } from "../arena/room.ts";
import { buildBody, type BuiltBody } from "../core/build/build-body.ts";
import { loadEngine, type EngineName } from "../core/engine/engines.ts";
import { loadoutFaults, type Held, type Loadout } from "../core/items/held.ts";
import { takesScript, GAME } from "../entrants/game.ts";
import type { MindConfig } from "../core/mind/config.ts";
import type { AttributeOverrides } from "../core/character-attributes.ts";
import { modelHolding, modelSpec, type BodyModel, type HumanoidModel } from "../core/models.ts";
import { commandable, type HostedBody } from "../core/body.ts";
import { enlist } from "../core/combatant.ts";
import { createSenses } from "../core/mind/senses.ts";
import { STAND_ORDERS } from "../core/mind/orders.ts";
import { balanceCeiling, balancePercent, rulebook } from "../core/rules/rulebook.ts";
import type { BodySpec } from "../core/spec/body.ts";
import { createWorld, type World } from "../core/world.ts";
import { labActor, type Actor } from "../lab/actor.ts";
import { groundPlacement } from "../lab/ground-starts.ts";
import { groundShove, SHOVED, SHOVED_UNFELLED, standCheck, startGround, targetImpulse } from "../lab/ground-mode.ts";
import { groundMeter } from "../lab/ground-meter.ts";
import { shoveBody } from "../lab/stance-mode.ts";
import { startWind } from "../lab/wind.ts";
import type { GroundLevel } from "../lab/ground-environment.ts";
import { loadoutSpec } from "../lab/loadout.ts";
import { labAddress, type LabAddress } from "../lab/scenarios.ts";
import type { CaseWorld, Cases, Json, Reader, WorldKind } from "./evaluation.ts";

/**
 * One fall, as plain data: the body (a model with an item in its right hand, or a loadout), the start and its seed, the level, the assists, and the riser's mind in full. `target`,
 * `obstacle` and `equipped` read the stand by its verification (`STAND_CHECK`) and shove by the
 * target's impulse; otherwise by the mind's hand-back. `factor` raises every muscle's peak torques
 * (`strengthSpec`), a research experiment's, never the game's. `cap` is the recovery's, s.
 */
export interface FallCase {
  readonly model: BodyModel;
  /** Its character's attributes but its balance, which the fall gives (`balance`); none for the body's own. */
  readonly character?: AttributeOverrides;
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

/** Whether the Lab's stand bed can play `fall`: a mind that takes the Lab's script (`takesScript`), on a body the command layers read. */
const onStandBed = (fall: Pick<FallCase, "model" | "mind">): boolean => takesScript(fall.mind) && commandable(modelSpec(fall.model));

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

/** The attributes `fall`'s body takes: its character's, less the balance the fall gives. */
function characterOf(fall: Pick<FallCase, "character">): AttributeOverrides {
  const { balance: _, ...character } = fall.character ?? {};
  return character;
}

/** Where a fall starts: its address in the Lab, its body and its placement, or why the bed refuses the start; throws for a fall the bed does not play (`checkFall`). */
export function fallStart(fall: FallCase): { address: LabAddress; spec: BodySpec; placement: ReturnType<typeof groundPlacement> } {
  checkFall(fall);
  const defaults = labAddress("?scenario=ground"), balance = fall.balance ?? 0;
  if (!onStandBed(fall)) throw new Error("the Lab's stand bed drives a fighter on a body the command layers read");
  const address: LabAddress = { ...defaults, model: fall.model as HumanoidModel, ...(fall.character ? { attributes: characterOf(fall) } : {}), right: fall.loadout?.right ?? fall.held ?? "empty", left: fall.loadout?.left ?? "empty", balance, seed: fall.seed,
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
  /** The Lab's actor on the stand bed; null on the fall bed. */
  readonly actor: Actor | null;
  readonly ended: boolean;
  afterStep(): void;
  reading(): FallReading;
  dispose(): void;
}

/**
 * **The Lab's stand bed**, the research rising bed's: `fall`'s world on `engine`, from its start
 * (`fallStart`'s, unless given): the body built in its placement, its mind hosted as the Lab hosts
 * it (`subs` in place of the config's sub-minds, an experiment's) with its balance's assist, and the
 * Stand-up mode started. It ends once the stand is verified or failed (`target`, `obstacle`,
 * `equipped`), else at hand-back or when the run stops; at `FALL_AFTER` s past the cap in any case.
 */
export async function buildStandFall(fall: FallCase, engine: EngineName, given: {
  start?: ReturnType<typeof fallStart>; subs?: BodyOptions["subs"];
} = {}): Promise<BuiltFall> {
  const { start = fallStart(fall), subs } = given;
  const { spec, placement } = start;
  if ("refused" in placement) throw new Error(placement.refused);
  const balance = fall.balance ?? 0, verifying = Boolean(fall.target || fall.obstacle || fall.equipped);
  const babylon = new NullEngine(), scene = new Scene(babylon);
  const world = createWorld(scene, await loadEngine(engine));
  addArenaSolids(world.physics);
  const body = buildBody(spec, world, placement);
  const address = verifying ? { ...start.address, ground: { ...start.address.ground, impulse: targetImpulse(body) } } : start.address;
  if (!takesScript(fall.mind)) throw new Error("the stand bed drives a mind that takes its script");
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
        else if (check.takeover === null && world.time >= SHOVED_UNFELLED) ended = true;
      } else if (run.meter.state.handback !== null) { stood = true; ended = true; }
      else if (run.state.status !== "running"
        || run.meter.state.from !== null && world.time - run.meter.state.from >= cap
        || run.meter.state.from === null && world.time >= SHOVED_UNFELLED) ended = true;
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

/** Why the fall bed cannot play `fall`, each a sentence: a start other than a shove, a floor other than the open one, or an obstacle. */
function bedFaults(fall: Pick<FallCase, "start" | "obstacle" | "level">): readonly string[] {
  return [...fall.start !== "shoved" ? [`a ${fall.start} start is installed for the humanoid's postures: the fall bed shoves`] : [],
    ...fall.level && fall.level !== "open" || fall.obstacle ? ["the fall bed plays the open floor"] : []];
}

/**
 * **The fall bed**, every evaluated fall's whatever its mind: `fall`'s body built standing in its
 * mind's posture, facing +z, and enlisted as a fight enlists it (`enlist`), alone, its orders the
 * stand's verification's; at `SHOVED.first` s its middle trunk is shoved (`shoveBody`) by the fall's
 * impulse (unless given: a target's fall and an equipped one by the target's, `targetImpulse`; else the Lab's draw from
 * its seed) at its degrees from +z, and again the same way while it holds the shove (`SHOVED`). Its
 * rise has taken it over once it is first down by the fight's rule (`PhysicalBody.down`), and its
 * stand is verified as the Lab verifies one (`standCheck`), the body its own at the end. A body not
 * taken over by `SHOVED_UNFELLED` s was not felled: the trial did not reach its case ("no
 * takeover"). Its ground history (`groundMeter`) is read where its mind hosts a body (a view); its
 * assist is metered either way.
 */
export async function buildFall(fall: FallCase, engine: EngineName): Promise<BuiltFall> {
  checkFall(fall);
  const refused = bedFaults(fall)[0];
  if (refused) throw new Error(refused);
  const factor = fall.factor ?? 1;
  if (!Number.isFinite(factor) || factor < 1 || factor > 2) throw new Error("research strength factor stays between 1 and 2");
  const spec = strengthSpec(modelHolding(fall.model, fall.loadout ?? { left: "empty", right: fall.held ?? "empty" }, characterOf(fall)), factor);
  const babylon = new NullEngine(), scene = new Scene(babylon);
  const world = createWorld(scene, await loadEngine(engine));
  addArenaSolids(world.physics);
  const cap = Math.min(FALL_CAP, fall.cap ?? FALL_CAP);
  let check: ReturnType<typeof standCheck> | null = null;
  const fighter = enlist(world, { id: "fall", side: "fall", name: "fall", spec, rules: rulebook("arena"), mind: fall.mind, catalog: GAME, at: [0, 0, 0],
    senses: createSenses(world), out: () => false, orders: () => check?.orders() ?? STAND_ORDERS, balance: fall.balance ?? 0 });
  const body = fighter.body;
  check = standCheck({ body, world, takenOver: () => body.down, inCommand: () => true }, cap);
  const defaults = labAddress("?scenario=ground");
  const drawn = groundShove({ seed: fall.seed, ground: { ...defaults.ground, degrees: fall.degrees ?? null, impulse: fall.impulse ?? null } });
  const degrees = drawn.degrees, impulse = (fall.target || fall.equipped) && fall.impulse == null ? targetImpulse(fighter.built) : drawn.impulse;
  const shoving = shoveBody(body, world, () => 0);
  const wind = startWind(fighter.built, world, fall.gusts ? { rate: .7, strength: 45 } : { rate: 0, strength: 0 }, fall.seed);
  const hosted = "view" in body ? body as HostedBody : null, meter = hosted ? groundMeter(hosted, world, fall.balance ?? 0) : null;
  const state = { shoves: 0, shovedAt: null as number | null, ended: false };
  return {
    world, body: fighter.built, actor: null,
    get ended() { return state.ended; },
    afterStep() {
      meter?.sample();
      check!.sample();
      const { takeover } = check!.state;
      const held = state.shovedAt !== null && takeover === null && !body.down && state.shoves < SHOVED.most && world.time - state.shovedAt >= SHOVED.again;
      if (state.shovedAt === null && world.time >= SHOVED.first || held) { shoving.shove(impulse, degrees); state.shovedAt = world.time; state.shoves++; }
      if (check!.done() || takeover === null && world.time >= SHOVED_UNFELLED || world.time >= cap + FALL_AFTER) state.ended = true;
    },
    reading() {
      const c = check!.state, stood = c.stage === "stood", frame = meter?.frame();
      return { status: stood ? "stood" : c.takeover === null ? "no takeover" : c.stage === "fell after verification" ? "fell after verification" : "failed",
        stood, handback: frame?.handback ?? null, handBackReason: frame?.handBackReason ?? null, takeover: c.takeover, verified: c.verified, walked: c.walked,
        trail: (frame?.trail ?? []) as unknown as Json, attempts: (frame?.attempts ?? []) as unknown as Json, phases: (frame?.phases ?? {}) as unknown as Json,
        assist: (frame?.assist ?? null) as unknown as Json };
    },
    dispose() { wind.dispose(); shoving.dispose(); body.dispose(); fighter.built.dispose(); world.dispose(); scene.dispose(); babylon.dispose(); },
  };
}

/** A fall's reader: the fall's own ending, and its reading. */
export function readFall(built: BuiltFall): Reader<FallReading> {
  return { afterStep: () => built.afterStep(), get ended() { return built.ended; }, reading: () => built.reading() };
}

/** A suite of falls as a protocol: each fall a condition, played on Rapier on the fall bed (`buildFall`), the riser's mind the subject. */
export function fallCases<C extends Json & Omit<FallCase, "mind">>(play: Json, conditions: readonly C[]): Cases<C, FallReading, BuiltFall> {
  return {
    arity: 1, play, conditions, engine: "rapier", seconds: FALL_CAP + FALL_AFTER,
    faults: (value, condition) => typeof value !== "object" || value === null || Array.isArray(value) ? ["a riser is a mind's config"]
      : bedFaults(condition),
    world: ([mind], condition, engine) => ({ kind: "fall", engine, fall: { ...(condition as Omit<FallCase, "mind">), mind: mind as unknown as MindConfig } }),
    read: (built) => readFall(built),
  };
}

/** The fall world kind: built by `buildFall`, its one body traced, played by the world's clock. */
export const FALL_WORLD: WorldKind<Extract<CaseWorld, { readonly kind: "fall" }>, BuiltFall> = {
  build: (world) => buildFall(world.fall, world.engine),
  traced: (built) => [built.body],
  clock: (built) => built.world.time,
  minds: (world) => [world.fall.mind],
};
