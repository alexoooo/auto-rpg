import { constructionScope } from "../core/construction.ts";
import { partRequirements } from "../parts/tree.ts";
import { motorRequirementRefusal } from "../control/motor-part.ts";
import { isRefused } from "../core/refusal.ts";
import { supportHeight } from "../control/support-reference.ts";
/**
 * **The rising bed's falls**: the riser's mind (`risingMind`), a fall played as a job (`risingTrial`), a technique
 * played alone (`techniqueTrial`), the bed's jobs (`risingJobs`: everyday starts, the
 * stand-up target's 240 falls and the obstacle levels) and its report (`risingReport`). `research/skills/recovery/rising-bed.mjs` runs them on workers; the fall
 * evaluation (`rising-target`) plays the same falls through `fall.ts`.
 */
import { Vector3 } from "../core/math/vector.ts";
import { commandedBody } from "../minds/seat/host.ts";
import { buildBody, type BuiltBody } from "../core/bodies/build/build-body.ts";
import { DEFAULT_ENGINE, loadEngine } from "../core/physics/engines.ts";
import { humanoidSpec } from "../core/bodies/human/spec.ts";
import { armedWith, loadoutKey, type Held } from "../core/bodies/items/held.ts";
import { REPRESENTATIVE } from "./loadouts.ts";
import type { OptionMindConfig } from "../minds/option/config.ts";
import type { MindConfig } from "../minds/catalog/config.ts";
import { groundReading } from "../control/ground-reading.ts";
import { stanceFeet } from "../control/support.ts";
import { mindKitOf } from "../skills/assembly/kit.ts";
import { isWayUp, type TechniqueName, type TechniquePart, type TechniqueRun } from "../skills/recovery/technique.ts";
import { withWaysUp } from "../minds/option/rise.ts";
import { HUMANOID_MODELS, modelSpec, type HumanoidModel } from "../core/bodies/models.ts";
import { guardPosture } from "../skills/guard/guard.ts";

import { deepFreeze } from "../core/state.ts";
import { createWorld, type World } from "../core/world/world.ts";
import type { Actor } from "../game/lab/actor.ts";
import { GROUND_LEVELS, type GroundLevel } from "../game/lab/ground-environment.ts";
import { groundPlacement, groundPostures } from "../game/lab/ground-starts.ts";
import type { LabAddress } from "../game/lab/scenarios.ts";
import { cos, sin } from "../core/math/real.ts";
import { mean, medianOf } from "./stats.ts";
import { createFall, checkFall, strengthSpec, type FallCase, type FallReading } from "./fall.ts";
import { type GameContext } from "../game/arena/context.ts";

/**
 * A job of the bed: a fall (`FallCase`, its mind given or Option Mind getting up by `techniques`), or with
 * `technique` that technique alone (`techniqueTrial`), `after` one before it. `id` orders the rows.
 */
type RisingJob = Omit<FallCase, "mind" | "model" | "start"> & {
  readonly model?: HumanoidModel;
  readonly start?: FallCase["start"];
  readonly id?: number;
  readonly mind?: MindConfig;
  readonly techniques?: readonly TechniqueName[];
  readonly technique?: TechniqueName;
  readonly after?: TechniqueName | null;
};

/** A job with what it came to: a fall's reading, a refused start's error, or a technique's end as its status. */
export type RisingRow = RisingJob & Partial<Omit<FallReading, "status" | "attempts" | "phases" | "assist">> & {
  readonly status?: string;
  readonly cap?: number;
  readonly reached?: boolean;
  readonly error?: string;
  readonly attempts?: readonly { readonly technique?: string; readonly controller?: string; readonly side?: string | null; readonly end?: string; readonly seconds: number }[];
  readonly phases?: Readonly<Record<string, number>>;
  readonly assist?: Readonly<Record<string, number>> | null;
};

/** The technique trials' placements, by start: geometry is independent of controls and strength, so each realm validates an identical draw once. */
const starts = new Map<string, ReturnType<typeof groundPlacement>>();

/** What a technique's trial reads at each change of phase or position. */
type TrailEntry = { at: number; phase: string; position: string; height: number; feet: number[]; hands: number };

/** What a technique alone came to; a refused start has its error and none of what a played one reads. */
type TechniqueResult = RisingJob & {
  factor: number; destination?: string; reached: boolean; survived: boolean; end: string; phase: string | null; seconds: number;
  endedAt?: number; candidateBegun?: boolean; trail: TrailEntry[]; saturation: Record<string, { peak: number; saturatedSeconds: number }>;
  predecessor?: string | null; predecessorSeconds?: number; balance?: number; assist?: { force: number; moment: number }; error?: string;
};

/** What the bed plays: its starts, bodies, loadouts, seeds and riser, or a fixed suite (`target`, `obstacles`). */
interface RisingOptions {
  readonly starts?: readonly FallCase["start"][];
  readonly models?: readonly HumanoidModel[];
  readonly held?: readonly Held[];
  readonly seeds?: readonly number[];
  readonly techniques?: readonly TechniqueName[] | null;
  readonly technique?: TechniqueName | null;
  readonly after?: TechniqueName | null;
  readonly balance?: number;
  readonly gusts?: boolean;
  readonly target?: boolean;
  /** The target's shoves turned this far, degrees: its fresh falls (`FRESH_OFFSET`). */
  readonly offset?: number;
  readonly obstacles?: boolean;
}

/**
 * **The fresh falls**: the target's bodies and loadouts shoved halfway between its sixteen
 * directions, degrees (`docs/reference/rising.md#the-owners-target`). No edge, timing or route is
 * tuned on them; they show whether a gain on the target is fitted to its falls.
 */
export const FRESH_OFFSET = 11.25;

/** A reference time for a fall's stand, s, reported beside the time to stand (`docs/reference/rising.md#the-owners-target`), deciding nothing. */
export const STAND_WITHIN = 10;

/**
 * The bed's jobs. The stand-up target: every body (`HUMANOID_MODELS`) in every rated loadout
 * (`REPRESENTATIVE`), each shoved sixteen ways, every direction once in each group, turned by
 * `offset` for the fresh falls. Obstacle falls: the target's on every level but the open floor.
 * Everyday starts: eight shoves a seed, a drop, or each installed posture.
 */
export function risingJobs(options: RisingOptions): (RisingJob & { id: number })[] {
  if (options.obstacles) return (Object.keys(GROUND_LEVELS) as GroundLevel[]).filter(level => level !== "open")
    .flatMap(level => risingJobs({ ...options, target: true, obstacles: false }).map(job => ({ ...job, target: false, obstacle: true, level })))
    .map((job, id) => ({ ...job, id }));
  const jobs: RisingJob[] = [], techniques = options.techniques ? { techniques: options.techniques } : {};
  if (options.target) {
    for (const model of HUMANOID_MODELS) for (const loadout of REPRESENTATIVE) for (let direction = 0; direction < 16; direction++)
      jobs.push({ model, loadout, seed: 1, start: "shoved", degrees: direction * 22.5 + (options.offset ?? 0), balance: 0, grit: 0, gusts: false, target: true, ...techniques });
  } else for (const model of options.models!) for (const held of options.held!) for (const seed of options.seeds!) for (const start of options.starts!) {
    const common: RisingJob = { model, held, seed, start, balance: options.balance ?? 0, grit: 0, gusts: options.gusts ?? false, target: false, ...techniques,
      ...(options.technique ? { technique: options.technique, after: options.after ?? null } : {}) };
    if (start === "shoved") for (let direction = 0; direction < 8; direction++) jobs.push({ ...common, degrees: direction * 45 });
    else if (start === "placed") for (const posture of groundPostures(modelSpec(model))) jobs.push({ ...common, posture });
    else jobs.push(common);
  }
  return jobs.map((job, id) => ({ ...job, id }));
}

export function createRising(context: GameContext) {
  const { minds: MINDS, partLookup, controllerOf } = context.catalog;
  const TECHNIQUES = context.techniques;
  const { buildStandFall, fallStart } = createFall(context);

  /** The bed's riser: Option Mind (`option`) getting up by the ways up `techniques` in rank order (`withWaysUp`), by its own (the game's Stand up's) where none are given. Gameplay presets are untouched. */
  function risingMind(techniques?: readonly TechniqueName[] | null): OptionMindConfig {
    const option = MINDS.option!.config as OptionMindConfig;
    return techniques ? { ...option, options: withWaysUp(partLookup, option.options ?? (controllerOf(option).defaults as OptionMindConfig).options!, techniques.map((kind) => ({ kind }))) } : option;
  }

  /**
   * One fall of the bed, built afresh: a technique alone, or the fall through `fall.ts` on Rapier.
   * `stop`, asked each step with the world, the body and its actor, ends the fall early once the
   * search has what it scores.
   */
  async function risingTrial(job: RisingJob, { stop }: { stop?: (world: World, built: BuiltBody, actor: Actor) => boolean } = {}): Promise<RisingRow> {
    const rejected = (error: string): RisingRow => ({ ...job, balance: job.balance ?? 0, status: "rejected start", stood: false,
      handback: null, verified: null, error, trail: [], attempts: [], phases: {}, assist: null });
    const refused = checkFall(job);
    if (refused) return rejected(refused);
    if (job.loadout !== undefined && job.technique) return rejected("standalone technique trials do not accept per-hand loadouts");
    if (job.technique) {
      const result = await techniqueTrial(job), phases: Record<string, number> = {}, attempts = [];
      for (let i = 0; i < result.trail.length; i++) {
        const entry = result.trail[i]!, until = result.trail[i + 1]?.at ?? result.endedAt ?? result.seconds;
        phases[entry.phase] = (phases[entry.phase] ?? 0) + Math.max(0, until - entry.at);
      }
      if (job.after && result.predecessor) attempts.push({ controller: job.after, side: TECHNIQUES[job.after].starts[0]!,
        end: result.predecessor, seconds: result.predecessorSeconds! });
      if (result.candidateBegun) attempts.push({ controller: job.technique,
        side: TECHNIQUES[job.technique].starts[0]!, end: result.end, seconds: result.seconds });
      return { ...result, cap: 8, status: result.end, stood: result.destination === "standing" && result.reached && result.survived,
        handback: result.reached ? result.seconds : null, verified: result.reached ? result.seconds : null,
        phases, attempts };
    }
    const fall: FallCase = { ...job, model: job.model!, start: job.start!, mind: job.mind ?? risingMind(job.techniques) };
    const balance = job.balance ?? 0;
    const start = fallStart(fall);
    if (isRefused(start)) return rejected(start.refused);
    if ("refused" in start.placement) return { ...job, balance, status: "rejected start", stood: false, handback: null, verified: null, error: start.placement.refused, trail: [], attempts: [], phases: {}, assist: null };
    const built = await buildStandFall(fall, DEFAULT_ENGINE, { start });
    if (isRefused(built)) return rejected(built.refused);
    try {
      while (!built.ended) {
        built.world.step();
        if (stop?.(built.world, built.body, built.actor!)) break;
        built.afterStep();
      }
      const cap = Math.min(30, job.cap ?? 30);
      return { ...job, balance, cap, ...(built.reading() as unknown as RisingRow) };
    } finally { built.dispose(); }
  }

  /** Eight-second technique cap, followed by an independent two-second standing check on success; no mind or combat preset takes part. */
  async function techniqueTrial(job: RisingJob): Promise<TechniqueResult> {
    const model = job.model ?? "workshop-fighter", factor = job.factor ?? 1, cap = Math.min(8, job.cap ?? 8);
    if (!Number.isFinite(factor) || factor < 1 || factor > 1.5) throw new Error("research strength factor stays between 1 and 1.5");
    const technique = job.technique ?? "sit-back";
    if (!TECHNIQUES[technique] || !isWayUp(TECHNIQUES[technique])) throw new Error(`no way up ${technique}`);
    const rejected = (error: string): TechniqueResult => ({ ...job, factor, reached: false, survived: false, end: "rejected start", phase: null, seconds: cap, error, trail: [], saturation: {} });
    if (job.after && !TECHNIQUES[job.after]) return rejected(`unknown predecessor ${job.after}`);
    const destination = TECHNIQUES[technique].edges[0]!.to;
    if (!["workshop-fighter", "workshop-rogue", "crypt-skeleton"].includes(model)) throw new Error(`unsupported humanoid technique model ${model}`);
    const spec = strengthSpec(armedWith(humanoidSpec(model as "workshop-fighter"), "right", job.held ?? "empty"), factor);
    const kit = mindKitOf(partLookup, spec);
    for (const name of [technique, ...(job.after ? [job.after] : [])]) {
      const part = TECHNIQUES[name];
      const refusal = part.fits(spec, part.defaults, partLookup)
        ?? motorRequirementRefusal(kit.motor, spec, partRequirements(partLookup, part.defaults, spec));
      if (refusal) return rejected(`${name}: ${refusal}`);
    }
    const start = job.start ?? "placed", posture = job.posture ?? "squat", seed = job.seed ?? 1;
    const key = JSON.stringify([model, job.held ?? "empty", start, posture, seed]);
    let fixture = starts.get(key);
    if (!fixture) {
      const address = { seed, ground: { start, posture, degrees: null, impulse: null, foe: 0, gusts: false } } as unknown as Pick<LabAddress, "seed" | "ground">;
      fixture = deepFreeze(groundPlacement(spec, address));
      starts.set(key, fixture);
    }
    if ("refused" in fixture) return { ...job, factor, reached: false, survived: false, end: "rejected start", phase: null, seconds: cap, error: fixture.refused, trail: [], saturation: {} };
    const placement = fixture;
    const lifetime = constructionScope();
    try {
    const world = lifetime.own(createWorld(await loadEngine(DEFAULT_ENGINE)));
    world.physics.addFixedBox([0, -.5, 0], [40, 1, 40]);
    const built = lifetime.own(buildBody(spec, world, placement)), reader = groundReading(built, world.dt);
    let run!: TechniqueRun, predecessor: TechniqueRun | null = null;
    const control = { active: start !== "shoved", end: null as string | null, from: null as number | null, ended: null as number | null,
      predecessor: job.after ? "running" as string | null : null, predecessorSeconds: 0, candidateFrom: null as number | null, shoved: false };
    const body = lifetime.own(commandedBody(built, world, { servoSeconds: .1, motor: kit.motor }, [(own, view, into, afterPhysics) => {
      const kit = mindKitOf(partLookup, own.spec);
      const part: TechniquePart = TECHNIQUES[technique], after: TechniquePart | undefined = job.after ? TECHNIQUES[job.after] : undefined;
      run = part.make(own, view, into, kit, part.defaults, afterPhysics);
      predecessor = after?.make(own, view, into, kit, after.defaults, afterPhysics) ?? null;
      if (job.after && !predecessor) throw new Error(`unknown predecessor ${job.after}`);
      const name = `technique:${technique}`;
      return { name, has: () => name, dispose() {}, mind: { state: { control, run: run.state, predecessor: predecessor?.state ?? null },
        wants: () => control.active,
        begin() {
          (predecessor ?? run).begin(TECHNIQUES[job.after ?? technique].starts[0]!); control.from = into.time;
          if (!predecessor) control.candidateFrom = into.time;
        },
        end() { if (!control.end) run.end(); },
        // The techniques run in the motor part, on the body as it is, as the game's ground skills do (`groundSkills`).
        think() {},
        interrupt() {},
        act(bodyControl) {
          const dt = own.dt;
          const senses = view.senses;
          if (!view.ground) return;
          if (control.predecessor === "running") {
            let end: string | null = predecessor!.step(view.ground, senses, bodyControl, dt);
            if (!end && into.time - control.from! >= 8) { predecessor!.end(); end = "timed-out"; }
            if (end) {
              control.predecessor = end; control.predecessorSeconds = into.time - control.from!;
              run.begin(TECHNIQUES[technique].starts[0]!); control.candidateFrom = into.time;
            }
            return;
          }
          control.end = run.step(view.ground, senses, bodyControl, dt);
          if (control.end) { control.active = false; control.ended = into.time; }
        } } };
    }]));
    body.drive(view => ({ posture: guardPosture(spec), pushes: [], stance: { feet: stanceFeet(spec).map((foot) => foot.end.name), centre: null, height: supportHeight(view) - .03, heading: 0 } }));
    const trail: TrailEntry[] = [], saturation: Record<string, { peak: number; saturatedSeconds: number }> = {}, last = { phase: "", position: "" };
    let survived = false, verified = false;
      while (world.time < cap + 2.1 + (predecessor ? 8 : 0) + 4) {
        if (start === "shoved" && !control.shoved && world.time >= 1) {
          const radians = (job.degrees ?? 0) * Math.PI / 180, mass = [...built.segments.values()].reduce((sum, part) => sum + part.rigid.mass, 0);
          const trunk = built.segments.get("middleTrunk")!;
          trunk.body.applyImpulse(new Vector3(1.5 * mass * sin(radians), 0, 1.5 * mass * cos(radians)), trunk.pose.position);
          control.shoved = true;
        }
        world.step();
        if (start === "shoved" && control.shoved && body.view.down && control.from === null) control.active = true;
        const g = body.view.ground ?? reader.read();
        const phase = control.predecessor === "running" ? `predecessor:${predecessor!.phase}` : run.phase;
        if (last.phase !== phase || last.position !== g.position) {
          trail.push({ at: world.time, phase, position: g.position, height: g.height, feet: [...g.footLoad], hands: spec.segments.map((s, i) => s.name.startsWith("hand.") ? g.load[i]! : 0).reduce((a, b) => a + b, 0) });
          last.phase = phase; last.position = g.position;
        }
        for (let i = 0; i < body.muscles.channels.length; i++) {
          const channel = body.muscles.channels[i]!, torque = body.muscles.pulled[i]!;
          const bound = body.muscles.strength(i, torque >= 0 ? 1 : -1), fraction = Math.abs(torque) / Math.max(1e-9, bound);
          const key = `${phase}/${channel.name}`;
          const reading = saturation[key] ??= { peak: 0, saturatedSeconds: 0 };
          reading.peak = Math.max(reading.peak, fraction);
          if (fraction >= .95) reading.saturatedSeconds += world.dt;
        }
        if (control.end) {
          if (control.end !== "done") break;
          verified ||= run.reached(g, destination);
          if (destination === "standing" ? body.view.down : g.spin > 15) break;
          if (world.time - control.ended! >= 2) { survived = true; break; }
        } else if (control.candidateFrom !== null && world.time - control.candidateFrom >= cap
          || control.from === null && world.time >= cap) { control.end = "timed-out"; run.end(); break; }
      }
      return { ...job, factor, destination, reached: control.end === "done" && verified, survived, end: control.end ?? "timed-out", phase: run.phase,
        seconds: control.ended === null ? cap : control.ended - control.candidateFrom!,
        endedAt: control.ended ?? world.time, candidateBegun: control.candidateFrom !== null, trail, saturation,
        predecessor: control.predecessor, predecessorSeconds: control.predecessorSeconds,
        balance: 0, assist: { force: body.assist.given.force.length(), moment: body.assist.given.moment.length() } };
    } finally { lifetime.dispose(); }
  }

  /**
   * The bed's report: by start, body and loadout, the falls stood (verified on a fixed suite, else
   * handed back), within `STAND_WITHIN` and 12 s, the failure-inclusive median (a fall not stood counts at its
   * cap) and the mean, the stand-up's value, and each technique's attempts. On the stand-up
   * target, whether the rows are its conditions: every fall of the target once, Balance 0 and Grit 0
   * (`conditions`).
   */
  function risingReport(rows: readonly RisingRow[], target = false) {
    if (target && rows.some(row => row.obstacle || row.level && row.level !== "open")) throw new Error("obstacle falls cannot satisfy the open-floor target");
    const grouped = new Map<string, RisingRow[]>();
    for (const row of rows) {
      const key = `${row.level && row.level !== "open" ? `${row.level}/` : ""}${row.start}/${row.model}/${row.loadout ? loadoutKey(row.loadout) : row.held}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(row);
    }
    // A stand verified is timed so; on a bed that does not verify it, by the hand-back.
    const time = (row: RisingRow): number | null => row.stood ? row.verified ?? (target || row.obstacle ? null : row.handback ?? null) : null;
    const successful = (row: RisingRow, within = Infinity) => time(row) !== null && time(row)! <= within;
    // The fresh falls are the target's turned by their offset.
    const offset = rows.length > 0 && rows.every(row => row.degrees! % 22.5 === FRESH_OFFSET) ? FRESH_OFFSET : 0;
    const made = (row: RisingRow): boolean => row.status !== "no takeover" && !(row.start === "shoved" && row.takeover === null);
    const groups = [...grouped].map(([key, cases]) => ({ key, all: cases.length, exercised: cases.filter(made).length, stood: cases.filter(row => successful(row)).length,
      reached: cases.filter(row => row.reached).length,
      within: cases.filter(row => successful(row, STAND_WITHIN)).length, within12: cases.filter(row => successful(row, 12)).length,
      median: medianOf(cases.filter(made).map(row => time(row) ?? row.cap ?? 30)),
      mean: cases.some(made) ? mean(cases.filter(made).map(row => time(row) ?? row.cap ?? 30)) : null, rejected: cases.filter(row => row.status === ("rejected start" as string)).length,
      noTakeover: cases.filter(row => row.start === "shoved" && row.takeover === null).length,
      landedStanding: cases.filter(row => row.status === "landed standing").length,
      phaseSeconds: Object.fromEntries([...new Set(cases.flatMap(row => Object.keys(row.phases ?? {})))].map(phase => [phase,
        cases.reduce((sum, row) => sum + (row.phases?.[phase] ?? 0), 0) / cases.length])) }));
    const attempts = new Map<string, { technique: string; side: string | null; begun: number; done: number; seconds: number }>();
    for (const row of rows) for (const attempt of row.attempts ?? []) {
      const name = (attempt.technique ?? attempt.controller)!;
      if (name !== "flatten" && !(Object.hasOwn(TECHNIQUES, name) && isWayUp(TECHNIQUES[name as TechniqueName]))) continue;
      const key = `${name}/${attempt.side ?? "unspecified"}`, stats = attempts.get(key) ?? { technique: name, side: attempt.side ?? null, begun: 0, done: 0, seconds: 0 };
      stats.begun++; stats.done += Number(attempt.end === "done"); stats.seconds += attempt.seconds; attempts.set(key, stats);
    }
    let conditions: Record<string, boolean> | null = null;
    if (target) {
      const fallOf = (row: RisingRow) => `${row.model}/${row.loadout ? loadoutKey(row.loadout) : row.held}/${row.degrees}`;
      const expected = risingJobs({ target: true, offset }).map(fallOf).sort(), actual = rows.map(fallOf).sort();
      conditions = { completeUniqueDirections: JSON.stringify(actual) === JSON.stringify(expected), balanceZero: rows.every(row => row.balance === 0), gritZero: rows.every(row => row.grit === 0) };
    }
    const standalone = rows.length > 0 && rows.every(row => row.technique);
    const obstacles = rows.length > 0 && rows.every(row => row.obstacle);
    return { harness: "Node stand, core World, Rapier, 120 Hz", mode: target ? "owner target" : obstacles ? "obstacle falls" : standalone ? "standalone technique" : "everyday bed", cap: standalone ? 8 : 30,
      groups, conditions, techniques: [...attempts.values()].map(({ seconds, ...stats }) => ({ ...stats, meanSeconds: seconds / stats.begun })),
      claims: { beatsSupportRecovery: "requires comparison with the saved reference on identical cases",
        assist: { balances: [...new Set(rows.map(row => row.balance))], grits: [...new Set(rows.map(row => row.grit))], forceImpulse: rows.reduce((sum, row) => sum + (row.assist?.forceImpulse ?? 0), 0),
          momentImpulse: rows.reduce((sum, row) => sum + (row.assist?.momentImpulse ?? 0), 0) } }, rows };
  }

  return { risingMind, risingTrial, techniqueTrial, risingReport };
}
