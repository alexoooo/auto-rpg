import type { MindMade, MindWiring } from "../catalog/controller.ts";
import { constructionScope } from "../../core/construction.ts";
import type { BuiltBody } from "../../core/bodies/build/build-body.ts";
import { poseAngles } from "../../control/kinematics.ts";
import type { BodySpec } from "../../core/bodies/spec/body.ts";
import type { World } from "../../core/world/world.ts";
import type { MindConfig } from "../catalog/config.ts";
import type { MindReport } from "../report.ts";
import type { Catalog } from "../catalog/catalog.ts";
import { bodyHost } from "./host.ts";
import { mirrorDriven, type Embodying } from "./embodiment.ts";
import { isMindPlace, reportNow, type At, type MindPlace, type MindRecipe, type ReportNow, type Seat } from "./apart.ts";
import { physicalBody, type HeldReading, type PhysicalBody } from "./physical-body.ts";
import type { Orders } from "../orders.ts";
import type { Senses } from "../../core/bodies/senses.ts";
import type { SheetLog } from "./sheets.ts";


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
 * sheets are written in it (`SheetLog`). What it reports (`Minded.report`) is what it said as it
 * was made and then with each answer, before the step's decision (`saidReport`), its menu as it
 * stands, as a mind apart reports. Where the world runs its minds apart (`World.minds`), it is made
 * there, on a mirror of its body (`embodyApart`): it has no skills to read here, and its memory is
 * where it runs.
 */
export function createMind(catalog: Catalog, built: BuiltBody, world: World, config: MindConfig, wiring: MindWiring, log?: SheetLog): Minded {
  const fault = catalog.treeFaults(config)[0];
  if (fault) throw new Error(fault);
  if (world.minds) {
    if (!isMindPlace(world.minds)) throw new Error("the world's minds run in a place no mind can be seated in");
    const apart = embodyApart(built, world, world.minds, catalog, { config, name: wiring.name, seed: wiring.seed ?? 0, phase: wiring.phase ?? 0, rules: wiring.rules,
      ...(wiring.experiment ? { experiment: wiring.experiment } : {}) }, wiring.orders,
    { senses: wiring.senses, assist: wiring.assist, contactIdentity: wiring.contactIdentity, log });
    return { state: MIND_APART, report: apart.report, kind: config.kind, body: physicalBody(built, apart.held, world, apart.has, apart.state, apart.dispose) };
  }
  let mind: MindMade | null = null;
  const state = { mind: null as object | null, said: null as Omit<ReportNow, "engagement"> | null };
  const { host, made, dispose } = bodyHost(built, world, wiring, catalog.treeLookup(config), { log, answered: () => { state.said = saidOf(mind!.report, state.said); } });
  let completed = false;
  try {
  mind = catalog.controllerOf(config).create(host, config);
  const live = mind.report;
  if (!live) { const body = made(); completed = true; return { ...mind, kind: config.kind, body }; }
  state.mind = mind.state;
  state.said = saidOf(live);
  const body = made(); completed = true;
  return { ...mind, state, report: saidReport(() => state.said!, live), kind: config.kind, body };
  } finally { if (!completed) dispose(); }
}

/** What `report` says now, its menu and engagement aside, as plain data that what it goes on to do leaves as it is: as a mind apart's crosses. */
const saidOf = (report: MindReport | undefined, previous: Omit<ReportNow, "engagement"> | null = null): Omit<ReportNow, "engagement"> | null => {
  if (!report) return null;
  const { engagement: _shown, ...answer } = reportNow(report);
  return snapshot(answer, previous) as typeof answer;
};

/**
 * An answer's records and arrays, detached from the live report: each unchanged branch keeps its
 * previous snapshot, and each changed branch copies only the path to its changed values. Report
 * fields are compared by value, including through getters: a producer may mutate them in place.
 */
function snapshot(value: unknown, previous: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    const was = Array.isArray(previous) ? previous : [];
    let copy: unknown[] | null = Array.isArray(previous) && was.length === value.length ? null : new Array(value.length);
    for (let i = 0; i < value.length; i++) {
      const item = snapshot(value[i], was[i]);
      if (!copy && !Object.is(item, was[i])) copy = was.slice();
      if (copy) copy[i] = item;
    }
    return copy ?? was;
  }
  const now = value as Record<string, unknown>;
  const was = previous !== null && typeof previous === "object" && !Array.isArray(previous) ? previous as Record<string, unknown> : null;
  const keys = Object.keys(now), before = was ? Object.keys(was) : [];
  let copy: Record<string, unknown> | null = was && keys.length === before.length && keys.every((key, i) => key === before[i]) ? null : {};
  for (const key of keys) {
    const item = snapshot(now[key], was?.[key]);
    if (!copy && !Object.is(item, was![key])) copy = { ...was };
    if (copy) copy[key] = item;
  }
  return copy ?? was;
}

/** A mind's report read from what it last said (`said`), and what it shows a person and its menu from `live`, which only a page reads. */
function saidReport(said: () => Omit<ReportNow, "engagement">, live: MindReport): MindReport {
  return {
    get engagement() { return live.engagement; }, get prospects() { return said().prospects; }, get heading() { return said().heading; },
    get gaits() { return said().gaits; }, get navigation() { return said().navigation; }, get kit() { return said().kit; },
    get actions() { return said().actions; }, get ended() { return said().ended; }, get menu() { return live.menu; },
  };
}

/** What a mind apart keeps in place of its memory: a mind's memory is where it runs, so a body under one is neither saved nor forked. */
class MemoryApart {}
const MIND_APART: object = Object.freeze(new MemoryApart());

/** **A body under a mind apart** (`embodyApart`): the body as its fight holds it, and what its mind last said of itself. */
interface EmbodiedApart {
  readonly held: HeldReading;
  /** Who has the body, as its mind last said (`MindConstruction.has`). */
  has(): string;
  /** What its mind publishes, as it said it with its last answer, its menu asked for when read (`MindReport`). */
  readonly report: MindReport;
  /** The body's memory: what is kept here, the mind's kept where it runs. */
  readonly state: object;
  dispose(): void;
}

/**
 * **Give `built` a mind apart from `world`**, made in `place` from `recipe` read in `catalog`: the
 * world's side of a mind on its mirror (`embody`) whose mind runs where `place`
 * runs it (`MindPlace`). As each step is prepared the body is written to its channel and the mind
 * asked to step, with `orders` as its fight gives them now where they have changed; its command is
 * carried out on the body as the step's controls run, once the mind has made it, and what it says
 * of itself is what it said with that answer (`Seat.said`). Its observers of the physics see each
 * completed interval as the next step's numbers hold it. What it is given and does is the same as
 * on its body, step for step.
 */
function embodyApart(built: BuiltBody, world: World, place: MindPlace, catalog: Catalog, recipe: Omit<MindRecipe, "catalog" | "statics" | "dt">,
  orders: (senses: Senses) => Orders | null, given: Embodying = {}): EmbodiedApart {
  const at = (): At => ({ steps: world.steps, time: world.time });
  // `shown`: what it shows a person was read since its last step was asked, so the next answer says it.
  let seat: Seat | null = null, sent: string | undefined, shown = false;
  const { muscles, help, posed, writer, statics, senses: sense } = mirrorDriven(built, world, place.allocate, { answered: () => seat!.answer(), idle: () => seat!.ask({ kind: "idle", at: at() }) }, given);
  const scope = constructionScope(); scope.own(muscles); let complete = false;
  let thinking: ReturnType<World["prepare"]> | null = null;
  scope.own({ dispose() { try { seat?.ask({ kind: "dispose" }); } finally { thinking?.dispose(); } } });
  try {
  seat = place.seat(catalog, { ...recipe, statics, dt: world.dt }, writer.channel, at());
  thinking = world.prepare(() => {
    if (muscles.level !== "full") return;
    // Its last step answered, what its mind may still decide on is the array of numbers it was asked with, not the one written now (`MirrorWriter.write`).
    seat!.answer();
    writer.write();
    const now = orders(sense()), key = JSON.stringify(now);
    seat!.ask({ kind: "step", at: at(), ...(key === sent ? {} : { orders: now }), ...(shown ? { shown } : {}) });
    sent = key; shown = false;
  });
  const said = () => seat!.said().report;
  const report: MindReport = {
    get engagement() { shown = true; return said()?.engagement ?? null; }, get prospects() { return said()?.prospects ?? null; }, get heading() { return said()?.heading ?? null; },
    get gaits() { return said()?.gaits ?? null; }, get navigation() { return said()?.navigation ?? null; }, get kit() { return said()?.kit ?? null; },
    get actions() { return said()?.actions ?? null; }, get ended() { return said()?.ended ?? null; },
    get menu() { return seat!.menu(at()); },
  };
  complete = true;
  return {
    held: { muscles, assist: help.assist, senses: sense }, report, has: () => seat!.said().has,
    state: { muscles: muscles.state, assist: help.state, configurations: built.configurations.state, posed, toes: built.toes, strength: built.strength, mind: MIND_APART },
    dispose: scope.dispose,
  };
  } finally { if (!complete) scope.dispose(); }
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
  try { place.warm(catalog, { config, name: wiring.name, seed: wiring.seed ?? 0, phase: wiring.phase ?? 0, rules: wiring.rules, statics, dt: world.dt }, writer.channel, at); }
  finally { muscles.dispose(); }
}
