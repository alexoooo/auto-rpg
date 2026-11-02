import type { BuiltBody } from "../build/build-body.ts";
import { poseAngles } from "../control/kinematics.ts";
import type { Skills } from "../skills/framework/skills.ts";
import type { BodySpec } from "../spec/body.ts";
import type { World } from "../world.ts";
import type { MindConfig } from "./config.ts";
import type { MindReport } from "./report.ts";
import type { Catalog } from "../parts/catalog.ts";
import { bodyHost, rulesOf, type BodyHost, type HostGrants } from "./host.ts";
import { mirrorDriven, type Embodying, type OwnBody } from "./mind.ts";
import { isMindPlace, type At, type MindPlace, type MindRecipe, type Seat, type SeatSays } from "./apart.ts";
import type { Hook } from "../world.ts";
import { physicalBody, type PhysicalBody } from "../physical-body.ts";
import type { Orders } from "../intent/orders.ts";
import type { Senses } from "./senses.ts";
import type { SheetLog } from "./sheets.ts";

/** **What a fight gives the mind it makes**, beside the body and the config: what it grants the body (`HostGrants`), and its orders. */
export interface MindWiring extends HostGrants {
  readonly name: string;
  /** Its orders this step, or null when it is left to itself. `senses` are its own, this step's. */
  orders(senses: Senses): Orders | null;
}

/** **A mind as its controller makes it** (`Controller.create`): what every kind gives the fight that made it, but the body, which the fight holds from its host (`bodyHost`). */
export interface MindMade {
  /** The mind's memory above its body's (`src/core/state.ts`), saved and loaded with it. */
  readonly state: object;
  /**
   * Its skills, where it runs the game's (`Skills`): their report is what a screen or a test reads
   * of what it is doing and what holds each part of the body, and the rules never read it.
   */
  readonly skills?: Skills;
  /** What it publishes of itself (`MindReport`); none where it says nothing. */
  readonly report?: MindReport;
}

/**
 * **A body under a mind.** A fight holds one and reads what every kind gives, the body and the
 * memory, and never which kind it is: `kind` is its config's (`MindConfig.kind`), or `replay`
 * for a body played from its order sheets with no mind (`replayedBody`), for a screen to name.
 */
export interface Minded extends MindMade {
  readonly kind: string;
  readonly body: PhysicalBody;
}

/** The posture a body of `spec` is built in under the mind `config` names in `catalog` (`Controller.builtIn`), as a placement's angles (`poseAngles`). */
export function builtAngles(catalog: Catalog, spec: BodySpec, config: MindConfig): Record<string, number[]> {
  return poseAngles(spec, catalog.controllerOf(config).builtIn(spec, config, catalog.partLookup));
}

/**
 * `built` under the mind `config` names, wired to its fight, made by its controller in `catalog`
 * (`Catalog.controllers`) through a host of the body (`bodyHost`) that finds only the parts its tree names
 * (`treeLookup`); a config with a fault anywhere in its
 * tree (`treeFaults`) is refused. Given a `log`, its order
 * sheets are written in it (`SheetLog`). Where the world runs its minds apart (`World.minds`), it
 * is made there, on a mirror of its body (`embodyApart`): it has no skills to read here, and its
 * memory is where it runs.
 */
export function createMind(catalog: Catalog, built: BuiltBody, world: World, config: MindConfig, wiring: MindWiring, log?: SheetLog): Minded {
  const fault = catalog.treeFaults(config)[0];
  if (fault) throw new Error(fault);
  if (world.minds) {
    if (!isMindPlace(world.minds)) throw new Error("the world's minds run in a place no mind can be seated in");
    const apart = embodyApart(built, world, world.minds, catalog, { config, name: wiring.name, seed: wiring.seed ?? 0, phase: wiring.phase ?? 0, rules: rulesOf(wiring),
      ...(wiring.experiment ? { experiment: wiring.experiment } : {}) }, wiring.orders,
    { senses: wiring.senses, assist: wiring.assist, contactIdentity: wiring.contactIdentity, log });
    return { state: MIND_APART, report: apart.report, kind: config.kind, body: physicalBody(built, apart.held, world, apart.has, apart.state, apart.dispose) };
  }
  const { host, made } = bodyHost(built, world, wiring, catalog.treeLookup(config), log);
  const mind = catalog.controllerOf(config).create(host, config, wiring);
  return { ...mind, kind: config.kind, body: made() };
}

/** What a mind apart keeps in place of its memory: a mind's memory is where it runs, so a body under one is neither saved nor forked. */
class MemoryApart {}
export const MIND_APART: object = Object.freeze(new MemoryApart());

/** **A body under a mind apart** (`embodyApart`): the body as its fight holds it, and what its mind last said of itself. */
export interface EmbodiedApart {
  readonly held: Pick<OwnBody, "muscles" | "assist" | "senses">;
  /** Who has the body, as its mind last said (`Mind.has`). */
  has(): string;
  /** What its mind publishes, as it last said it, its menu asked for when read (`MindReport`). */
  readonly report: MindReport;
  /** The body's memory: what is kept here, the mind's kept where it runs. */
  readonly state: object;
  dispose(): void;
}

/**
 * **Give `built` a mind apart from `world`**, made in `place` from `recipe` read in `catalog`: the
 * world's side of a mind on its mirror (`embody`, `World.mirrored`) whose mind runs where `place`
 * runs it (`MindPlace`). As each step is prepared the body is written to its channel and the mind
 * asked to step, with `orders` as its fight gives them now where they have changed; its command is
 * carried out on the body as the step's controls run, once the mind has made it. Its observers of
 * the physics are asked to observe each completed interval, from the first step after it asks to.
 * What it is given and does is the same as on its body, step for step.
 */
export function embodyApart(built: BuiltBody, world: World, place: MindPlace, catalog: Catalog, recipe: Omit<MindRecipe, "catalog" | "statics" | "dt">,
  orders: (senses: Senses) => Orders | null, given: Embodying = {}): EmbodiedApart {
  const at = (): At => ({ steps: world.steps, time: world.time });
  let seat: Seat | null = null, observed: Hook | null = null, sent: string | undefined;
  // What the mind says once every ask so far is carried out; the first time it says it observes, the world observes for it.
  const heard = (): SeatSays => {
    const says = seat!.says();
    if (says.observes && !observed) observed = world.afterPhysics(() => { heard(); writer.write(); seat!.ask({ kind: "observe", at: at() }); });
    return says;
  };
  const { muscles, help, posed, writer, statics, senses: sense } = mirrorDriven(built, world, place.allocate, { answered: () => seat!.answer(), idle: () => seat!.ask({ kind: "idle", at: at() }) }, given);
  seat = place.seat(catalog, { ...recipe, statics, dt: world.dt }, writer.channel, at());
  const thinking = world.prepare(() => {
    if (muscles.level !== "full") return;
    // Nothing it was asked still reads the numbers.
    heard();
    writer!.write();
    const now = orders(sense()), key = JSON.stringify(now);
    seat!.ask(key === sent ? { kind: "step", at: at() } : { kind: "step", at: at(), orders: now });
    sent = key;
  });
  const said = () => heard().report;
  const report: MindReport = {
    get engagement() { return said()?.engagement ?? null; }, get prospects() { return said()?.prospects ?? null; }, get heading() { return said()?.heading ?? null; },
    get gait() { return said()?.gait ?? null; }, get navigation() { return said()?.navigation ?? null; }, get kit() { return said()?.kit ?? null; },
    get actions() { return said()?.actions ?? null; }, get ended() { return said()?.ended ?? null; },
    get menu() { heard(); seat!.ask({ kind: "menu", at: at() }); return heard().menu ?? null; },
  };
  return {
    held: { muscles, assist: help.assist, senses: sense }, report, has: () => heard().has,
    state: { muscles: muscles.state, assist: help.state, handPoses: built.handPoses.state, posed, toes: built.toes, mind: MIND_APART },
    dispose: () => { seat!.ask({ kind: "dispose" }); observed?.dispose(); thinking.dispose(); muscles.dispose(); },
  };
}

/**
 * Derive in the place `world` runs its minds in (`MindPlace.warm`) what a mind of `config` on
 * `built` derives from its spec and config alone, made as `createMind` would make it there and
 * stepped once on `built` as it stands, waiting for
 * nothing: a fight that builds bodies as it goes warms each kind before it plays. `world` is one
 * of the warming's own.
 */
export function warmApart(catalog: Catalog, built: BuiltBody, world: World, config: MindConfig, wiring: MindWiring): void {
  if (!world.minds || !isMindPlace(world.minds)) throw new Error("a mind is warmed where the world runs its minds apart");
  const place = world.minds, at: At = { steps: world.steps, time: world.time };
  const { muscles, writer, statics } = mirrorDriven(built, world, place.allocate, { answered: () => {}, idle: () => {} },
    { senses: wiring.senses, assist: wiring.assist, contactIdentity: wiring.contactIdentity });
  place.warm(catalog, { config, name: wiring.name, seed: wiring.seed ?? 0, phase: wiring.phase ?? 0, rules: rulesOf(wiring), statics, dt: world.dt }, writer.channel, at);
  muscles.dispose();
}

/**
 * A mind `make` makes through a host of `built` (`bodyHost`) under `wiring`'s grants, its parts
 * looked up in `catalog` (`Catalog.partLookup`), with the body it took: how a test or a study makes
 * one mind of its own.
 */
export function hostedMind<W extends HostGrants, M extends object>(catalog: Catalog, built: BuiltBody, world: World, wiring: W, make: (host: BodyHost, wiring: W) => M): M & { readonly body: PhysicalBody } {
  const { host, made } = bodyHost(built, world, wiring, catalog.partLookup), mind = make(host, wiring);
  return { ...mind, body: made() };
}
