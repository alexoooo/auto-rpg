/**
 * **A fall as a case**: one body, any model under any mind, in a world of its own with the arena's
 * solids. Every evaluated fall is played on one bed (`buildFall`): the body enlisted as a fight
 * enlists it, shoved as the stand-up target shoves, and its stand verified as the Lab verifies one,
 * whatever its mind. The research rising bed (`rising.ts`) plays a mind on the Lab's stand bed
 * (`buildStandFall`): shoved, dropped or placed on the ground of the Stand-up mode (`startGround`,
 * `src/game/lab/ground-mode.ts`), its actor read. It is not bit-equal
 * between JavaScript engines: the starts and the shove (`src/game/lab/ground-starts.ts`,
 * `stance-mode.ts`) use arithmetic each engine rounds its own way.
 */
import { addArenaSolids } from "../game/arena/solids.ts";
import { buildBody, type BuiltBody } from "../core/bodies/build/build-body.ts";
import { loadEngine, type EngineName } from "../core/physics/engines.ts";
import { loadoutFaults, type Held, type Loadout } from "../core/bodies/items/held.ts";
import type { MindConfig } from "../minds/catalog/config.ts";
import type { Experiment } from "../control/body.ts";
import type { AttributeOverrides } from "../core/bodies/character-attributes.ts";
import { modelHoldingChecked, type BodyModel, type HumanoidModel } from "../core/bodies/models.ts";
import type { HostedBody } from "../minds/seat/hosted-body.ts";
import { soleRefusal } from "../control/support.ts";
import { enlist, type Combatant } from "../game/combatant.ts";
import { createSenses } from "../core/world/senses.ts";
import { STAND_ORDERS } from "../minds/orders.ts";
import type { MindReport } from "../minds/report.ts";
import { isRefused, type Refused } from "../core/refusal.ts";
import { constructionScope } from "../core/construction.ts";
import { balanceCeiling, balancePercent, rulebook } from "../combat/rulebook.ts";
import type { BodySpec } from "../core/bodies/spec/body.ts";
import { createWorld, type World } from "../core/world/world.ts";
import { labActor, type Actor } from "../game/lab/actor.ts";
import { groundPlacement } from "../game/lab/ground-starts.ts";
import { groundShove, shoveImpulse, SHOVED, SHOVED_UNFELLED, standCheck, startGround, targetImpulse } from "../game/lab/ground-mode.ts";
import { groundMeter } from "../game/lab/ground-meter.ts";
import { shoveBody } from "../game/lab/stance-mode.ts";
import { CALM, labGusts, startWind } from "../game/lab/wind.ts";
import type { GroundLevel } from "../game/lab/ground-environment.ts";
import { loadoutSpecChecked } from "../game/lab/loadout.ts";
import type { CaseWorld, Cases, Json, Reader, WorldKind } from "./evaluation.ts";
import { createLabScenarios, type LabAddress } from "../game/lab/scenarios.ts";
import { type GameContext } from "../game/arena/context.ts";

/**
 * One fall, as plain data: the body (a model with an item in its right hand, or a loadout), the start and its seed, the level, the assists, and the riser's mind in full. `target`
 * and `obstacle` read the stand by its verification (`STAND_CHECK`) and shove by the target's
 * impulse; otherwise by the mind's hand-back. `factor` raises every muscle's peak torques
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
  readonly mind: MindConfig;
}

/** Whether the Lab's stand bed can play `fall`: a body the stance stands on its feet (`soleRefusal`). */
const onStandBed = (spec: BodySpec): boolean => soleRefusal(spec) === null;

/** The longest recovery a fall is given, s, and how long past it a fall may run. */
export const FALL_CAP = 30, FALL_AFTER = 4;

/** What a fall came to: its verdict, the meter's times and trail (`groundMeter`), and the verification's. */
export type FallReading = {
  readonly status: "stood" | "landed standing" | "no takeover" | "fell after verification" | "failed";
  readonly stood: boolean;
  readonly handback: number | null;
  readonly takeover: number | null;
  readonly verified: number | null;
  readonly walked: number | null;
  readonly trail: Json;
  readonly attempts: Json;
  readonly phases: Json;
  readonly assist: Json;
};

/** **A fall's time to stand**, s, the stand-up's value: from the takeover to a verified stand, a fall made and not stood at the cap (`FALL_CAP`); none for a fall not made. */
export const timeToStand = (r: Pick<FallReading, "takeover" | "stood" | "verified">): number | null =>
  r.takeover === null ? null : r.stood && r.verified !== null ? r.verified : FALL_CAP;

/** `spec` with every muscle's peak torques scaled by `factor`: a search's raised ceilings, never the game's. */
export function strengthSpec(spec: BodySpec, factor: number): BodySpec {
  if (factor === 1) return spec;
  return { ...spec, joints: spec.joints.map(joint => ({ ...joint, dofs: joint.dofs.map(dof => dof.passive ? dof : ({ ...dof,
    muscle: { ...dof.muscle, peakPositive: { ...dof.muscle.peakPositive, value: dof.muscle.peakPositive.value * factor },
      peakNegative: { ...dof.muscle.peakNegative, value: dof.muscle.peakNegative.value * factor } } })) })) };
}

/** Why the bed refuses a fall: a loadout that does not fit, Grit, or the target off the open floor. */
export function checkFall(fall: Pick<FallCase, "target" | "loadout" | "grit" | "level">): string | null {
  if (fall.loadout !== undefined) {
    const faults = loadoutFaults(fall.loadout);
    if (faults.length) return faults.join("; ");
  }
  if (fall.grit !== undefined && fall.grit !== 0) return "the unassisted rising bed fixes Grit 0";
  if (fall.target && fall.level && fall.level !== "open") return "the owner's target fixes the open floor";
  return null;
}

/** The attributes `fall`'s body takes: its character's, less the balance the fall gives. */
function characterOf(fall: Pick<FallCase, "character">): AttributeOverrides {
  const { balance: _, ...character } = fall.character ?? {};
  return character;
}

/** A fall's world, played a step at a time: after each step `afterStep`, until `ended`; then its `reading`. */
export interface BuiltFall {
  readonly world: World;
  readonly state: object;
  readonly body: BuiltBody;
  /** The Lab's actor on the stand bed; null on the fall bed. */
  readonly actor: Actor | null;
  /** The riser on the fall bed, its mind's state and its body's view as a trace reads them (`research/skills/recovery/implementations/staged/rise-trace.mjs`); null on the stand bed. */
  readonly combatant: Combatant | null;
  readonly ended: boolean;
  afterStep(): void;
  reading(): FallReading;
  dispose(): void;
}

/** Why the fall bed cannot play `fall`, each a sentence: a start other than a shove, a floor other than the open one, or an obstacle. */
function bedFaults(fall: Pick<FallCase, "start" | "obstacle" | "level">): readonly string[] {
  return [...fall.start !== "shoved" ? [`a ${fall.start} start is installed for the humanoid's postures: the fall bed shoves`] : [],
    ...fall.level && fall.level !== "open" || fall.obstacle ? ["the fall bed plays the open floor"] : []];
}

/** An attempt at a way up, as a fall's reading records it: begun at, s, how long it ran, s, the ground action, and how it ended. */
interface GroundAttempt { readonly at: number; readonly seconds: number; readonly controller: string; readonly end: string }

/** A fall's reader: the fall's own ending, and its reading. */
export function readFall(built: BuiltFall): Reader<FallReading> {
  return { afterStep: () => built.afterStep(), get ended() { return built.ended; }, reading: () => built.reading() };
}

/** A suite of falls as a protocol: each fall a condition, played on the fall bed (`buildFall`), the riser's mind the subject. */
export function fallCases<C extends Json & Omit<FallCase, "mind">>(play: Json, conditions: readonly C[]): Cases<C, FallReading, BuiltFall> {
  return {
    arity: 1, play, conditions, seconds: FALL_CAP + FALL_AFTER,
    faults: (value, condition) => typeof value !== "object" || value === null || Array.isArray(value) ? ["a riser is a mind's config"]
      : bedFaults(condition),
    world: ([mind], condition, engine) => ({ kind: "fall", engine, fall: { ...(condition as Omit<FallCase, "mind">), mind: mind as unknown as MindConfig } }),
    read: (built) => readFall(built),
  };
}

export function createFall(context: GameContext) {
  const GAME = context.catalog;
  const { labAddress } = createLabScenarios(context);

  /** Where a fall starts: its address in the Lab, its body and its placement, or why the bed refuses the start; returns its refusal for unsupported inputs (`checkFall`). */
  function fallStart(fall: FallCase): { address: LabAddress; spec: BodySpec; placement: ReturnType<typeof groundPlacement> } | Refused {
    const refused = checkFall(fall);
    if (refused) return { refused };
    const defaults = labAddress("?scenario=ground"), balance = fall.balance ?? 0;
    const address: LabAddress = { ...defaults, model: fall.model as HumanoidModel, ...(fall.character ? { attributes: characterOf(fall) } : {}), right: fall.loadout?.right ?? fall.held ?? "empty", left: fall.loadout?.left ?? "empty", balance, seed: fall.seed,
      ground: { ...defaults.ground, level: fall.level ?? "open", start: fall.start, posture: fall.posture ?? "back", degrees: fall.degrees ?? null,
        impulse: fall.impulse ?? null, gusts: fall.gusts ?? false } };
    const factor = fall.factor ?? 1;
    if (!Number.isFinite(factor) || factor < 1 || factor > 2) return { refused: "research strength factor stays between 1 and 2" };
    const checked = loadoutSpecChecked(address);
    if (isRefused(checked)) return checked;
    if (!onStandBed(checked)) return { refused: "the Lab's stand bed drives a body the stance stands on its feet" };
    const spec = strengthSpec(checked, factor);
    return { address, spec, placement: groundPlacement(spec, address) };
  }

  /**
   * **The Lab's stand bed**, the research rising bed's: `fall`'s world on `engine`, from its start
   * (`fallStart`'s, unless given): the body built in its placement, its mind hosted with the supplied
   * immutable experiment where given and its balance's assist, and the Stand-up mode started.
   * It ends once the stand is verified or failed (`target`, `obstacle`),
   * else at hand-back or when the run stops; at `FALL_AFTER` s past the cap in any case.
   */
  async function buildStandFall(fall: FallCase, engine: EngineName, given: { start?: Exclude<ReturnType<typeof fallStart>, Refused>; experiment?: Experiment } = {}): Promise<BuiltFall | Refused> {
    const { start = fallStart(fall) } = given;
    if (isRefused(start)) return start;
    const { spec, placement } = start;
    if ("refused" in placement) return placement;
    const scope = constructionScope(); let complete = false;
    try {
    const balance = fall.balance ?? 0, verifying = Boolean(fall.target || fall.obstacle);
    const world = scope.own(createWorld(await loadEngine(engine)));
    addArenaSolids(world.physics);
    const body = scope.own(buildBody(spec, world, placement));
    const address = verifying ? { ...start.address, ground: { ...start.address.ground, impulse: targetImpulse(body) } } : start.address;
    const actor = labActor(context, body, world, { mind: fall.mind, rules: rulebook("arena"),
      assist: balanceCeiling(balance, balancePercent(rulebook("arena"))),
      ...(given.experiment ? { experiment: given.experiment } : {}) });
    if (isRefused(actor)) return actor;
    scope.own(actor);
    const cap = Math.min(FALL_CAP, fall.cap ?? FALL_CAP);
    const run = startGround(actor, address, { cap });
    if (isRefused(run)) return run;
    scope.own(run);
    const check = run.check.state;
    scope.forget(actor);
    const state = { stood: false, ended: false, read: null as FallReading | null, run: run.state, check: run.check.state, meter: run.meter.state };
    const result: BuiltFall = {
      world, body, actor, combatant: null, state,
      get ended() { return state.ended; },
      afterStep() {
        if (verifying) {
          if (run.check.done()) { state.stood = check.stage === "stood"; state.ended = true; }
          else if (check.takeover === null && world.time >= SHOVED_UNFELLED) state.ended = true;
        } else if (run.meter.state.handback !== null) { state.stood = true; state.ended = true; }
        else if (run.state.status !== "running"
          || run.meter.state.from !== null && world.time - run.meter.state.from >= cap
          || run.meter.state.from === null && world.time >= SHOVED_UNFELLED) state.ended = true;
        if (world.time >= cap + FALL_AFTER) state.ended = true;
      },
      reading() {
        if (state.read) return state.read;
        if (!state.stood) run.meter.cap();
        const frame = run.frame();
        state.read = { status: state.stood ? "stood" : run.state.status === "landed standing" ? "landed standing"
          : check.takeover === null && fall.start === "shoved" ? "no takeover" : check.stage === "fell after verification" ? "fell after verification" : "failed",
          stood: state.stood, handback: frame.handback, takeover: check.takeover, verified: check.verified, walked: check.walked,
          trail: frame.trail as unknown as Json, attempts: frame.attempts as unknown as Json, phases: frame.phases as unknown as Json, assist: frame.assist as unknown as Json };
        return state.read;
      },
      dispose: scope.dispose,
    };
    complete = true; return result;
    } finally { if (!complete) scope.dispose(); }
  }

  /**
   * **The fall bed**, every evaluated fall's whatever its mind: `fall`'s body built standing in its
   * mind's posture, facing +z, and enlisted as a fight enlists it (`enlist`), alone, its orders the
   * stand's verification's; at `SHOVED.first` s its middle trunk is shoved (`shoveBody`) by the fall's
   * impulse (unless given: a target's fall by the target's, `targetImpulse`; else the Lab's draw from
   * its seed) at its degrees from +z, and again the same way while it holds the shove (`SHOVED`). Its
   * rise has taken it over once it is first down by the fight's rule (`PhysicalBody.down`), and its
   * stand is verified as the Lab verifies one (`standCheck`), the body its own at the end. A body not
   * taken over by `SHOVED_UNFELLED` s was not felled: the trial did not reach its case ("no
   * takeover"). Its ground history (`groundMeter`) is read where its mind hosts a body (a view); its
   * assist is metered either way.
   */
  async function buildFall(fall: FallCase, engine: EngineName): Promise<BuiltFall | Refused> {
    const refused = checkFall(fall) ?? bedFaults(fall)[0];
    if (refused) return { refused };
    const factor = fall.factor ?? 1;
    if (!Number.isFinite(factor) || factor < 1 || factor > 2) return { refused: "research strength factor stays between 1 and 2" };
    const scope = constructionScope(); let complete = false;
    try {
    const checked = modelHoldingChecked(fall.model, fall.loadout ?? { left: "empty", right: fall.held ?? "empty" }, characterOf(fall));
    if (isRefused(checked)) return checked;
    const spec = strengthSpec(checked, factor);
    const world = scope.own(createWorld(await loadEngine(engine)));
    addArenaSolids(world.physics);
    const cap = Math.min(FALL_CAP, fall.cap ?? FALL_CAP);
    let check: ReturnType<typeof standCheck> | null = null;
    const fighter = enlist(world, { id: "fall", side: "fall", name: "fall", spec, rules: rulebook("arena"), mind: fall.mind, catalog: GAME, at: [0, 0, 0],
      senses: scope.own(createSenses(world)), out: () => false, orders: () => check?.orders() ?? STAND_ORDERS, balance: fall.balance ?? 0 });
    scope.own(fighter.built);
    const body = scope.own(fighter.body);
    check = standCheck({ body, world, takenOver: () => body.down, inCommand: () => true }, cap);
    const defaults = labAddress("?scenario=ground");
    const drawn = groundShove({ seed: fall.seed, ground: { ...defaults.ground, degrees: fall.degrees ?? null, impulse: fall.impulse ?? null } });
    const degrees = drawn.degrees, impulse = fall.target && fall.impulse == null ? targetImpulse(fighter.built) : drawn.impulse;
    const shoving = shoveBody(body, world, () => 0);
    if (isRefused(shoving)) return shoving;
    scope.own(shoving);
    const wind = startWind(fighter.built, world, fall.gusts ? labGusts(fall.model) : CALM, fall.seed);
    if (isRefused(wind)) return wind;
    scope.own(wind);
    const hosted = "view" in body ? body as HostedBody : null, meter = hosted ? groundMeter(hosted, world, fall.balance ?? 0) : null;
    const ledger = groundLedger(fighter.minded.report ?? null, () => world.time);
    const state = { shoves: 0, shovedAt: null as number | null, ended: false, check: check.state, meter: meter?.state ?? null, ledger: ledger.state };
    const result: BuiltFall = {
      world, body: fighter.built, actor: null, combatant: fighter, state,
      get ended() { return state.ended; },
      afterStep() {
        meter?.sample();
        check!.sample();
        const { takeover } = check!.state;
        const held = state.shovedAt !== null && takeover === null && !body.down && state.shoves < SHOVED.most && world.time - state.shovedAt >= SHOVED.again;
        if (state.shovedAt === null && world.time >= SHOVED.first || held) { shoving.shove(shoveImpulse(impulse, state.shoves), degrees); state.shovedAt = world.time; state.shoves++; }
        ledger.sample();
        if (check!.done() || takeover === null && world.time >= SHOVED_UNFELLED || world.time >= cap + FALL_AFTER) state.ended = true;
      },
      reading() {
        const c = check!.state, stood = c.stage === "stood", frame = meter?.frame();
        return { status: stood ? "stood" : c.takeover === null ? "no takeover" : c.stage === "fell after verification" ? "fell after verification" : "failed",
          stood, handback: frame?.handback ?? null, takeover: c.takeover, verified: c.verified, walked: c.walked,
          trail: (frame?.trail ?? []) as unknown as Json, attempts: (frame?.attempts?.length ? frame.attempts : ledger.attempts(world.time)) as unknown as Json, phases: (frame?.phases ?? {}) as unknown as Json,
          assist: (frame?.assist ?? null) as unknown as Json };
      },
      dispose: scope.dispose,
    };
    complete = true; return result;
    } finally { if (!complete) scope.dispose(); }
  }

  /**
   * **A mind's ground attempts from its report**: each ground action (`isGroundSkill`, by its kit) it has
   * ended, from its ledger (`MindReport.ended`), and those under way when read, ended `cap`. A mind
   * that runs the ground's actions as its own (Option Mind) is read so; one whose rise is a sub-mind's
   * is read by the ground meter instead. A completed action ends `done`.
   */
  function groundLedger(report: MindReport | null, clock: () => number) {
    const ground = new Set((report?.kit ?? []).filter((entry) => Object.hasOwn(context.techniques, entry.kind)).map((entry) => entry.action));
    const state = { kept: [] as GroundAttempt[], begun: new Map<number, number>(), seen: 0 };
    return { state,
      sample() {
        for (const action of report?.actions ?? []) if (ground.has(action.action) && !state.begun.has(action.id)) state.begun.set(action.id, clock());
        for (const ended of report?.ended ?? []) {
          if (ended.sequence <= state.seen) continue;
          state.seen = ended.sequence;
          if (ground.has(ended.action)) state.kept.push({ at: ended.began, seconds: ended.ended - ended.began, controller: ended.action,
            end: ended.ending.kind === "completed" ? "done" : ended.ending.reason ?? ended.ending.kind });
        }
      },
      attempts: (time: number): readonly GroundAttempt[] => [...state.kept, ...(report?.actions ?? []).filter((action) => ground.has(action.action))
        .map((action) => { const at = state.begun.get(action.id) ?? time; return { at, seconds: time - at, controller: action.action, end: "cap" }; })],
    };
  }

  /** The fall world kind: built by `buildFall`, its one body traced, played by the world's clock. */
  const FALL_WORLD: WorldKind<Extract<CaseWorld, { readonly kind: "fall" }>, BuiltFall> = {
    build: (world) => buildFall(world.fall, world.engine),
    traced: (built) => [built.body],
    clock: (built) => built.world.time,
    minds: (world) => [world.fall.mind],
  };

  return { fallStart, buildStandFall, buildFall, FALL_WORLD };
}

/** The registered world factory for this builder. */
export const fallWorld = (context: GameContext) => createFall(context).FALL_WORLD;
