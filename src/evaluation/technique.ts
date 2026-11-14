import { constructionScope } from "../core/construction.ts";
import type { Refused } from "../core/refusal.ts";
import { supportHeight } from "../control/support-reference.ts";
import type { BodyControl } from "../core/bodies/body-control.ts";
import { Vector3 } from "../core/math/vector.ts";
import { addArenaSolids } from "../game/arena/solids.ts";
import { commandedBody } from "../minds/seat/host.ts";
import { buildBody, type BuiltBody } from "../core/bodies/build/build-body.ts";
import { loadEngine } from "../core/physics/engines.ts";
import { withLoadout, type Held } from "../core/bodies/items/held.ts";
import { motorAndGuardOf } from "../skills/assembly/filled.ts";
import { poseDrive, type TechniqueEnd, type TechniqueName, type TechniquePart, type TechniqueRun } from "../skills/recovery/technique.ts";
import type { GroundReading } from "../control/ground-reading.ts";
import { stanceFeet } from "../control/support.ts";
import { cos, sin } from "../core/math/real.ts";
import { modelSpec, type HumanoidModel } from "../core/bodies/models.ts";
import { guardPosture } from "../skills/guard/guard.ts";
import type { BodySpec } from "../core/bodies/spec/body.ts";
import { createWorld, type World } from "../core/world/world.ts";
import { groundPlacement, type GROUND_POSTURES } from "../game/lab/ground-starts.ts";
import type { LabAddress } from "../game/lab/scenarios.ts";
import type { CaseWorld, Json, Reader, WorldKind } from "./evaluation.ts";
import type { PartConfig } from "../parts/parts.ts";
import { type GameContext } from "../game/arena/context.ts";

/**
 * One case, as plain data: the body, what its right hand holds and its left (empty where it names none), its start (placed in `posture`, or
 * standing in guard and shoved at 1 s toward `degrees` from +z by 1.5 s of its weight a kg), the
 * seed that moves a placed start's joints, the techniques played in turn, the last the one read,
 * and the config a technique of them is played under where it is not its own (`Part.defaults`): a
 * candidate's settings, as a search plays them.
 */
export interface TechniqueCase {
  readonly model: HumanoidModel;
  readonly held: Held;
  readonly left?: Held;
  readonly seed: number;
  readonly start: { readonly kind: "placed"; readonly posture: (typeof GROUND_POSTURES)[number] } | { readonly kind: "shoved"; readonly degrees: number };
  readonly chain: readonly TechniqueName[];
  readonly configs?: Readonly<Partial<Record<TechniqueName, PartConfig>>>;
}

/**
 * How long a technique may wait for its entry to admit the body, s, from the start, the end of the
 * one before, or a shoved body first down; how long one may run, s; how long a body a technique
 * stood is watched on its feet, s; and how long a body one did not take to its posture is watched
 * coming to rest, s, and how slow it is then, m/s.
 */
export const TECHNIQUE_LIMITS = Object.freeze({ admit: 2, run: 16, stood: 2, rest: 2, still: .1 });

/**
 * How far a seed moves a placed start's joints, a share of each joint's range: a posture the route
 * passes through is narrow, and the Lab's draw (`groundPlacement`) moves a kneeling body out of it.
 */
const TECHNIQUE_SPREAD = .02;

/** How a technique of the chain came to its end: one of its own (`TechniqueEnd`), never admitted, or stood and fallen again. */
type LinkEnd = TechniqueEnd | "not entered" | "fell";

/** What one technique of the chain came to: its end, how long it ran, s, and the body as it began and as it ended. */
export type LinkReading = {
  readonly technique: string;
  readonly end: LinkEnd;
  readonly seconds: number;
  /** As it was begun: the raw position, the centre of mass's speed, m/s, the pelvis's spin, rad/s, and how long it waited for its entry, s; null where it was not. */
  readonly entry: { readonly position: string; readonly speed: number; readonly spin: number; readonly waited: number } | null;
  /** The settled position at its end; where it ended not done, where the body came to rest (`TECHNIQUE_LIMITS.rest`). */
  readonly position: string;
};

/** What a case came to: each technique's reading in turn, the last the one the case reads. */
export type TechniqueReading = { readonly links: readonly LinkReading[] };

/** The placed starts lying on the ground. */
const LYING: readonly string[] = Object.freeze(["back", "front", "left", "right"]);

/** A case's world, played a step at a time: after each step `afterStep`, until `ended`; then its `reading`. */
export interface BuiltTechnique {
  readonly world: World;
  readonly body: BuiltBody;
  readonly ended: boolean;
  afterStep(): void;
  reading(): TechniqueReading;
  dispose(): void;
}

/** The body a case plays: the model, holding what it names in each hand (`withLoadout`). */
const techniqueSpec = (one: Pick<TechniqueCase, "model" | "held" | "left">): BodySpec =>
  withLoadout(modelSpec(one.model), { left: one.left ?? "empty", right: one.held });

/** Where a case's body is built, or why its start is refused, a sentence. */
export function techniquePlacement(one: TechniqueCase): ReturnType<typeof groundPlacement> {
  const ground = one.start.kind === "placed" ? { start: "placed", posture: one.start.posture } : { start: "shoved", posture: "back" };
  return groundPlacement(techniqueSpec(one), { seed: one.seed, ground: { ...ground, level: "open", degrees: null, impulse: null, foe: 0, gusts: false } } as unknown as Pick<LabAddress, "seed" | "ground">,
    undefined, TECHNIQUE_SPREAD);
}

/** A technique case's reader: the case's own ending, and its reading. */
export function readTechnique(built: BuiltTechnique): Reader<TechniqueReading & Json> {
  return { afterStep: () => built.afterStep(), get ended() { return built.ended; }, reading: () => built.reading() as TechniqueReading & Json };
}

export function createTechnique(context: GameContext) {
  const { partLookup } = context.catalog;
  const TECHNIQUES = context.techniques;

  /**
   * `one`'s world on `engine`: the body built in its placement on the arena's solids, under the
   * command layers with one sub-mind that plays the chain. Placed lying, or shoved once it is first
   * down (standing in guard until then), it lies slack until the first technique begins; placed in
   * any other posture, it holds its placement's. Each technique begins once its entry admits the body (on its first side), the settled
   * position read, within `TECHNIQUE_LIMITS.admit` s; until then the commands of the one before
   * carry on. The case ends at the last technique's end, or `TECHNIQUE_LIMITS.stood` s after a
   * technique that stands the body, or when one is not entered; once one ends not done, the body
   * lies slack until it comes to rest, for up to `TECHNIQUE_LIMITS.rest` s.
   */
  async function buildTechnique(one: TechniqueCase, engine: CaseWorld["engine"]): Promise<BuiltTechnique | Refused> {
    if (one.chain.length === 0) return { refused: "a technique case plays at least one technique" };
    const placement = techniquePlacement(one);
    if ("refused" in placement) return placement;
    const spec = techniqueSpec(one);
    for (const name of one.chain) {
      const part = TECHNIQUES[name];
      if (!part) return { refused: `unknown technique ${name}` };
      const refused = part.fits(spec, one.configs?.[name] ?? part.defaults, partLookup);
      if (refused) return { refused };
    }
    const scope = constructionScope(); let complete = false;
    try {
    const world = scope.own(createWorld(await loadEngine(engine)));
    addArenaSolids(world.physics);
    const built = scope.own(buildBody(spec, world, placement));
    const held: Record<string, number> = {};
    for (const joint of spec.joints) joint.dofs.forEach((dof, k) => { held[`${joint.name} ${dof.positive}`] = (placement.joints?.[joint.name]?.[k] ?? 0) + dof.bind.value; });
    const lying = one.start.kind === "shoved" || LYING.includes(one.start.posture);
    const state = { link: 0, phase: "start" as "start" | "wait" | "run" | "rest" | "stood" | "over", since: 0, down: false, shoved: false,
      command: { activation: new Float64Array(spec.joints.reduce((n,j)=>n+j.dofs.length,0)), velocity: new Float64Array(spec.joints.reduce((n,j)=>n+j.dofs.length,0)) },
      runs: [] as object[], links: [] as LinkReading[], entry: null as LinkReading["entry"], last: "between" };
    let runs: TechniqueRun[] = [];
    const body = commandedBody(built, world, { servoSeconds: .1, motor: motorAndGuardOf(partLookup, spec).motor }, [(own, view, clock, afterPhysics) => {
      const fitted = motorAndGuardOf(partLookup, own.spec), drive = poseDrive(own.muscles);
      runs = one.chain.map((name) => { const part: TechniquePart = TECHNIQUES[name]; return part.make(own, view, clock, fitted, one.configs?.[name] ?? part.defaults, afterPhysics); });
      state.runs = runs.map(run => run.state);
      const command = state.command;
      const remember = (control: BodyControl) => { command.activation.set(control.muscles.activation); command.velocity.set(control.muscles.velocity); };
      const carry = (control: BodyControl) => { control.muscles.activation.set(command.activation); control.muscles.velocity.set(command.velocity); };
      const close = (end: LinkEnd, g: GroundReading | null) => {
        state.links.push({ technique: one.chain[state.link]!, end, seconds: state.phase === "run" ? clock.time - state.since : 0, entry: state.entry, position: g?.position ?? "between" });
        state.entry = null;
      };
      const name = "technique case";
      return { name, has: () => name, dispose() {}, mind: { state,
        wants: () => state.phase !== "over" && state.phase !== "stood" && (one.start.kind === "placed" || state.down),
        begin() { state.phase = "wait"; state.since = clock.time; if (lying) { command.activation.fill(0); command.velocity.fill(0); } else drive(command, held); },
        end() { if (state.phase === "run") { runs[state.link]!.end(); close("interrupted", view.ground); state.phase = "over"; } },
        // The chain runs in the motor part, on the body as it is, as the game's ground skills do (`groundSkills`).
        think() {},
        interrupt() {},
        act(control) {
          const dt = own.dt;
          const g = view.ground, senses = view.senses;
          if (!g) { carry(control); return; }
          if (state.phase === "rest") {
            // A technique that ended short: the body lies slack until it comes to rest, read there.
            control.muscles.activation.fill(0); control.muscles.velocity.fill(0);
            if (g.settled && g.velocity.lengthSquared() < TECHNIQUE_LIMITS.still * TECHNIQUE_LIMITS.still || clock.time - state.since + dt / 2 >= TECHNIQUE_LIMITS.rest) {
              const last = state.links.length - 1;
              state.links[last] = { ...state.links[last]!, position: g.position }; state.phase = "over";
            }
            return;
          }
          if (state.phase === "wait") {
            const run = runs[state.link]!, side = TECHNIQUES[one.chain[state.link]!].starts[0]!;
            if (g.settled && run.admits(g, side)) {
              state.entry = { position: g.raw, speed: Math.sqrt(g.velocity.lengthSquared()), spin: g.spin, waited: clock.time - state.since };
              state.phase = "run"; state.since = clock.time; run.begin(side);
            } else {
              if (state.link === 0 && !lying) drive(control.muscles, held); else carry(control);
              remember(control);
              if (clock.time - state.since + dt / 2 >= TECHNIQUE_LIMITS.admit) { close("not entered", g); state.phase = "over"; }
              return;
            }
          }
          carry(control);
          const run = runs[state.link]!;
          let end: LinkEnd | null = run.step(g, senses, control, dt);
          if (!end && clock.time - state.since >= TECHNIQUE_LIMITS.run) { run.end(); end = "timed-out"; }
          remember(control);
          if (!end) return;
          const stands = TECHNIQUES[one.chain[state.link]!].edges.some((edge) => edge.to === "standing") && end === "done";
          close(end, g);
          if (state.link + 1 < one.chain.length && end === "done") { state.link++; state.phase = "wait"; state.since = clock.time; }
          else if (stands) { state.phase = "stood"; state.since = clock.time; }
          else if (end !== "done") { state.phase = "rest"; state.since = clock.time; }
          else state.phase = "over";
        } } };
    }]);
    scope.own(body);
    body.drive(() => ({ posture: guardPosture(spec), pushes: [], stance: { feet: stanceFeet(spec).map((foot) => foot.end.name), centre: null, height: supportHeight(body.view) - .03, heading: 0 } }));
    const root = built.segments.get("middleTrunk")!, mass = [...built.segments.values()].reduce((sum, part) => sum + part.rigid.mass, 0);
    scope.own(world.beforeStep(() => {
      if (one.start.kind !== "shoved" || state.shoved || world.time < 1) return;
      state.shoved = true;
      const a = one.start.degrees * Math.PI / 180;
      root.body.applyImpulse(new Vector3(1.5 * mass * sin(a), 0, 1.5 * mass * cos(a)), root.pose.position);
    }));
    const cap = TECHNIQUE_LIMITS.admit * (one.chain.length + 1) + TECHNIQUE_LIMITS.run * one.chain.length + TECHNIQUE_LIMITS.stood + TECHNIQUE_LIMITS.rest + 2;
    const result: BuiltTechnique = {
      world, body: built,
      get ended() { return state.phase === "over" || world.time >= cap; },
      afterStep() {
        if (state.shoved && body.view.down) state.down = true;
        if (state.phase === "stood") {
          if (body.view.down) { state.links[state.links.length - 1] = { ...state.links[state.links.length - 1]!, end: "fell" }; state.phase = "over"; }
          else if (world.time - state.since >= TECHNIQUE_LIMITS.stood) state.phase = "over";
        }
      },
      reading: () => {
        const links = [...state.links];
        for (let k = links.length; k < one.chain.length; k++) links.push({ technique: one.chain[k]!, end: "not entered", seconds: 0, entry: null, position: body.view.ground?.position ?? "between" });
        return { links };
      },
      dispose: scope.dispose,
    };
    complete = true; return result;
    } finally { if (!complete) scope.dispose(); }
  }

  /** The technique world kind: built by `buildTechnique`, its one body traced, played by the world's clock; its techniques are its parts. */
  const TECHNIQUE_WORLD: WorldKind<Extract<CaseWorld, { readonly kind: "technique" }>, BuiltTechnique> = {
    build: (world) => buildTechnique(world.technique, world.engine),
    traced: (built) => [built.body],
    clock: (built) => built.world.time,
    minds: () => [],
    parts: (world) => [...new Set(world.technique.chain)],
    data: (world) => [...new Set(world.technique.chain.flatMap((name) => context.catalog.treeData(world.technique.configs?.[name] ?? TECHNIQUES[name].defaults)))],
  };

  return { buildTechnique, TECHNIQUE_WORLD };
}

/** The registered world factory for this builder. */
export const techniqueWorld = (context: GameContext) => createTechnique(context).TECHNIQUE_WORLD;
