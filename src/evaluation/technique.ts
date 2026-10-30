/**
 * **Techniques in turn as a case**: one body on the arena's solids, started placed in a posture or
 * standing and shoved, its stand-up techniques (`TechniquePart`) played one after another without
 * a stand-up to route them, each begun once its entry admits the body (`TechniqueRun.admits`) and
 * read as the last one played. The Rise drill plays an edge from its posture placed and after the
 * edge before it (`src/evaluation/rise/`). Like a fall, it is not bit-equal between JavaScript
 * engines: the starts (`src/lab/ground-starts.ts`) use arithmetic each engine rounds its own way.
 */
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Scene } from "@babylonjs/core/scene.js";
import { addArenaSolids } from "../arena/room.ts";
import { createBody } from "../core/body.ts";
import { buildBody, type BuiltBody } from "../core/build/build-body.ts";
import { loadEngine } from "../core/engine/engines.ts";
import { armedWith, type Held } from "../core/items/held.ts";
import { humanoidSpec } from "../core/human/spec.ts";
import { partLookup } from "../core/mind/catalog.ts";
import { PUNCHER } from "../core/mind/config.ts";
import { kitOf } from "../core/mind/kit.ts";
import { poseDrive, type TechniqueName, type TechniqueRun } from "../core/mind/ground/technique.ts";
import { TECHNIQUES } from "../core/mind/ground/techniques.ts";
import type { GroundReading } from "../core/mind/ground/reading.ts";
import { cos, sin } from "../core/math/real.ts";
import type { HumanoidModel } from "../core/models.ts";
import { guardPosture } from "../core/skills/guard.ts";
import type { BodySpec } from "../core/spec/body.ts";
import { createWorld, type World } from "../core/world.ts";
import { groundPlacement, type GROUND_POSTURES } from "../lab/ground-starts.ts";
import type { LabAddress } from "../lab/scenarios.ts";
import type { CaseWorld, Json, Reader, WorldKind } from "./evaluation.ts";

/**
 * One case, as plain data: the body, whether its feet have toes, what its right hand holds, its start (placed in `posture`, or
 * standing in guard and shoved at 1 s toward `degrees` from +z by 1.5 s of its weight a kg), the
 * seed that moves a placed start's joints, and the techniques played in turn, the last the one read.
 */
export interface TechniqueCase {
  readonly model: HumanoidModel;
  readonly toes?: boolean;
  readonly held: Held;
  readonly seed: number;
  readonly start: { readonly kind: "placed"; readonly posture: (typeof GROUND_POSTURES)[number] } | { readonly kind: "shoved"; readonly degrees: number };
  readonly chain: readonly TechniqueName[];
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
export const TECHNIQUE_SPREAD = .02;

/** How a technique of the chain came to its end: one of its own (`TechniqueEnd`), never admitted, or stood and fallen again. */
export type LinkEnd = "done" | "failed" | "stalled" | "timed-out" | "interrupted" | "not entered" | "fell";

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

/** The body a case plays: the model, on toes where it asks, armed in its right hand. */
export const techniqueSpec = (one: Pick<TechniqueCase, "model" | "toes" | "held">): BodySpec =>
  armedWith(humanoidSpec(one.model, undefined, undefined, { toes: one.toes ?? false }), "right", one.held);

/** Where a case's body is built, or why its start is refused, a sentence. */
export function techniquePlacement(one: TechniqueCase): ReturnType<typeof groundPlacement> {
  const ground = one.start.kind === "placed" ? { start: "placed", posture: one.start.posture } : { start: "shoved", posture: "back" };
  return groundPlacement(techniqueSpec(one), { seed: one.seed, ground: { ...ground, level: "open", degrees: null, impulse: null, foe: 0, gusts: false } } as unknown as Pick<LabAddress, "seed" | "ground">,
    undefined, TECHNIQUE_SPREAD);
}

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
export async function buildTechnique(one: TechniqueCase, engine: CaseWorld["engine"]): Promise<BuiltTechnique> {
  if (one.chain.length === 0) throw new Error("a technique case plays at least one technique");
  const placement = techniquePlacement(one);
  if ("refused" in placement) throw new Error(placement.refused);
  const spec = techniqueSpec(one);
  const babylon = new NullEngine(), scene = new Scene(babylon), world = createWorld(scene, await loadEngine(engine));
  addArenaSolids(world.physics);
  const built = buildBody(spec, world, placement);
  const held: Record<string, number> = {};
  for (const joint of spec.joints) joint.dofs.forEach((dof, k) => { held[`${joint.name} ${dof.positive}`] = (placement.joints?.[joint.name]?.[k] ?? 0) + dof.bind.value; });
  const lying = one.start.kind === "shoved" || LYING.includes(one.start.posture);
  const state = { link: 0, phase: "start" as "start" | "wait" | "run" | "rest" | "stood" | "over", since: 0, down: false,
    links: [] as LinkReading[], entry: null as LinkReading["entry"], last: "between" };
  let runs: TechniqueRun[] = [];
  const body = createBody(built, world, { servoSeconds: .1, subs: [(own, view, clock) => {
    const kit = kitOf(partLookup, own.spec, PUNCHER), drive = poseDrive(own.muscles);
    runs = one.chain.map((name) => TECHNIQUES[name].make(own, view, clock, kit));
    const command = { activation: new Float64Array(own.muscles.channels.length), velocity: new Float64Array(own.muscles.channels.length) };
    const remember = () => { command.activation.set(own.muscles.activation); command.velocity.set(own.muscles.velocity); };
    const carry = () => { own.muscles.activation.set(command.activation); own.muscles.velocity.set(command.velocity); };
    const close = (end: LinkEnd, g: GroundReading | null) => {
      state.links.push({ technique: one.chain[state.link]!, end, seconds: state.phase === "run" ? clock.time - state.since : 0, entry: state.entry, position: g?.position ?? "between" });
      state.entry = null;
    };
    return { name: "technique case", state,
      wants: () => state.phase !== "over" && state.phase !== "stood" && (one.start.kind === "placed" || state.down),
      begin() { state.phase = "wait"; state.since = clock.time; if (lying) { own.muscles.activation.fill(0); own.muscles.velocity.fill(0); } else drive(held); remember(); },
      end() { if (state.phase === "run") { runs[state.link]!.end(); close("interrupted", view.ground); state.phase = "over"; } },
      step(senses, dt) {
        const g = view.ground;
        if (!g) { carry(); return; }
        if (state.phase === "rest") {
          // A technique that ended short: the body lies slack until it comes to rest, read there.
          own.muscles.activation.fill(0); own.muscles.velocity.fill(0);
          if (g.settled && g.velocity.lengthSquared() < TECHNIQUE_LIMITS.still * TECHNIQUE_LIMITS.still || clock.time - state.since + dt / 2 >= TECHNIQUE_LIMITS.rest) {
            const last = state.links.length - 1;
            state.links[last] = { ...state.links[last]!, position: g.position }; state.phase = "over";
          }
          return;
        }
        if (state.phase === "wait") {
          const run = runs[state.link]!, side = TECHNIQUES[one.chain[state.link]!].sides[0]!;
          if (g.settled && run.admits(g, side)) {
            state.entry = { position: g.raw, speed: Math.sqrt(g.velocity.lengthSquared()), spin: g.spin, waited: clock.time - state.since };
            state.phase = "run"; state.since = clock.time; run.begin(side);
          } else {
            if (state.link === 0 && !lying) drive(held); else carry();
            remember();
            if (clock.time - state.since + dt / 2 >= TECHNIQUE_LIMITS.admit) { close("not entered", g); state.phase = "over"; }
            return;
          }
        }
        carry();
        const run = runs[state.link]!;
        let end: LinkEnd | null = run.step(g, senses, dt);
        if (!end && clock.time - state.since >= TECHNIQUE_LIMITS.run) { run.end(); end = "timed-out"; }
        remember();
        if (!end) return;
        const stands = TECHNIQUES[one.chain[state.link]!].edges.some((edge) => edge.to === "standing") && end === "done";
        close(end, g);
        if (state.link + 1 < one.chain.length && end === "done") { state.link++; state.phase = "wait"; state.since = clock.time; }
        else if (stands) { state.phase = "stood"; state.since = clock.time; }
        else if (end !== "done") { state.phase = "rest"; state.since = clock.time; }
        else state.phase = "over";
      } };
  }] });
  body.drive(() => ({ posture: guardPosture(spec), pushes: [], stance: { feet: ["left", "right"], centre: null, height: body.view.standing - .03, heading: 0 } }));
  const root = built.segments.get("middleTrunk")!, mass = [...built.segments.values()].reduce((sum, part) => sum + part.rigid.mass, 0);
  let shoved = false;
  const shoving = world.beforeStep(() => {
    if (one.start.kind !== "shoved" || shoved || world.time < 1) return;
    shoved = true;
    const a = one.start.degrees * Math.PI / 180;
    root.body.applyImpulse(new Vector3(1.5 * mass * sin(a), 0, 1.5 * mass * cos(a)), root.node.position);
  });
  const cap = TECHNIQUE_LIMITS.admit * (one.chain.length + 1) + TECHNIQUE_LIMITS.run * one.chain.length + TECHNIQUE_LIMITS.stood + TECHNIQUE_LIMITS.rest + 2;
  return {
    world, body: built,
    get ended() { return state.phase === "over" || world.time >= cap; },
    afterStep() {
      if (shoved && body.view.down) state.down = true;
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
    dispose() { shoving.dispose(); body.dispose(); built.dispose(); world.dispose(); scene.dispose(); babylon.dispose(); },
  };
}

/** A technique case's reader: the case's own ending, and its reading. */
export function readTechnique(built: BuiltTechnique): Reader<TechniqueReading & Json> {
  return { afterStep: () => built.afterStep(), get ended() { return built.ended; }, reading: () => built.reading() as TechniqueReading & Json };
}

/** The technique world kind: built by `buildTechnique`, its one body traced, played by the world's clock; its techniques are its parts. */
export const TECHNIQUE_WORLD: WorldKind<Extract<CaseWorld, { readonly kind: "technique" }>, BuiltTechnique> = {
  build: (world) => buildTechnique(world.technique, world.engine),
  traced: (built) => [built.body],
  clock: (built) => built.world.time,
  minds: () => [],
  parts: (world) => [...new Set(world.technique.chain)],
};
