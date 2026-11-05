import type { Orders } from "../intent/orders.ts";
import type { Catalog } from "../parts/catalog.ts";
import type { Rulebook } from "../rules/rulebook.ts";
import type { MenuEntry } from "../skills/framework/menu.ts";
import type { MindConfig } from "./config.ts";
import type { BodyHost } from "./host.ts";
import type { Experiment, Mind, MindConstruction, OwnBody } from "./mind.ts";
import type { MindMade, MindWiring } from "./minds.ts";
import { mirrorBody, type Mirror, type MirrorChannel, type MirrorStatics } from "./mirror.ts";
import { answer, think } from "./mind.ts";
import { deriveSensed } from "../perception/openings.ts";
import { specDigest } from "../skills/framework/profile.ts";
import type { BodySpec } from "../spec/body.ts";
import type { MindReport } from "./report.ts";

/**
 * **Minds apart from the world.** A fight's mind may run where the world does not: in another
 * thread, on a mirror of its body (`mirrorBody`), its numbers carried each way on its channel
 * (`MirrorChannel`) and everything else as plain data in order, so that a bout is the same, step for
 * step, wherever its minds run. The world holds a seat of each such mind (`Seat`) in a place
 * (`MindPlace`): it asks the seat to make the mind, to step, to go idle, for its menu, and to go
 * (`SeatAsk`), and reads what the mind says of itself as it is made and with each answer, and its
 * menu when asked (`SeatSays`). Where the minds run, the asks are carried out by a host of seats (`seatHost`), the
 * same code wherever it runs (`mindWorkers`, `src/node/minds.ts`, in Node's worker threads).
 */

/** **What a mind apart is made from**, as plain data: its config and the catalog that names it, its fight's grants, what its mirror is told once, and the world's step. */
export interface MindRecipe {
  /** The catalog its config is read in, by the name the place knows it by. */
  readonly catalog: string;
  readonly config: MindConfig;
  readonly name: string;
  readonly seed: number;
  readonly phase: number;
  readonly rules: Rulebook;
  readonly experiment?: Experiment;
  readonly statics: MirrorStatics;
  /** The world's step, s. */
  readonly dt: number;
}

/** The world's clock when an ask is made: the steps taken and the time. */
export interface At { readonly steps: number; readonly time: number }

/**
 * **What the world asks a seat**, in order: to make its mind from its recipe; to step on the numbers
 * the world has just written, with its orders where they have changed since the last step's, its
 * observers of the physics (`CommandLayers.observe`) first shown the completed interval those
 * numbers hold; to go idle (`Mind.interrupt`); for its menu; and to go (`MindConstruction.dispose`).
 */
export type SeatAsk =
  | { readonly kind: "make"; readonly recipe: MindRecipe; readonly at: At }
  | { readonly kind: "step"; readonly at: At; readonly orders?: Orders | null; readonly shown?: boolean }
  | { readonly kind: "idle"; readonly at: At }
  | { readonly kind: "menu"; readonly at: At }
  | { readonly kind: "dispose" };

/** What a mind publishes of itself but its menu, which is asked for (`MindReport`). */
export type ReportNow = Omit<MindReport, "menu">;

/**
 * **What a seat's mind says of itself**: who has its body (`MindConstruction.has`) and its report, as it was
 * made and then with each answer (`answer`), before the step's decision, so that what the world
 * reads of it never waits on a decision. What it shows a person (`MindReport.engagement`) is said
 * as it is made and with the answer to a step asked with `shown`, and is otherwise as it last said
 * it: no rule or Commander reads it.
 */
export interface SeatSays {
  readonly has: string;
  readonly report: ReportNow | null;
}

/**
 * **Derive what a mind derives of a body's spec alone**, where a spec arrives in a thread: its
 * shapes as sensing reads them (`deriveSensed`) and its digest, which names the profiles measured on
 * it (`specDigest`). Each is cached by the spec's own objects, so no step of a mind that first
 * senses a body of it pays for it.
 */
export function deriveSpec(spec: BodySpec): void {
  deriveSensed(spec);
  specDigest(spec);
}

/** **Where minds run, the world's side** (`World.minds`). */
export interface MindPlace {
  /** Numbers a channel keeps here and where the minds run alike: memory the two share, or this thread's own. */
  readonly allocate: (length: number) => Float64Array;
  /**
   * A seat for the mind of `recipe` (its catalog given as the catalog itself), on `channel`, whose
   * statics and first numbers the world has written; it is asked to make the mind at `at`.
   */
  seat(catalog: Catalog, recipe: Omit<MindRecipe, "catalog">, channel: MirrorChannel, at: At): Seat;
  /**
   * Make a mind of `recipe` on `channel`, step it once on the numbers there, and let it go,
   * everywhere a seat may run, without waiting: what a mind derives from its spec and config alone,
   * as it is made and as it first thinks, is derived there before a fight needs it.
   */
  warm(catalog: Catalog, recipe: Omit<MindRecipe, "catalog">, channel: MirrorChannel, at: At): void;
  /** Send what has been asked and not yet sent: the world calls it after its preparing hooks (`MindsApart`, `src/core/world.ts`). */
  dispatch(): void;
  /** Stop the minds' threads, where it has any. */
  dispose(): void;
}

/** **A seat**: one mind apart, as the world asks it and hears it. */
export interface Seat {
  /** Ask it `ask`, after every ask before it. */
  ask(ask: SeatAsk): void;
  /**
   * Wait until its last step ask is answered (`answer`), while its mind may still decide.
   */
  answer(): void;
  /** What it said with its last answer, or as it was made, waiting for nothing more once it has been heard as made. */
  said(): SeatSays;
  /** Ask it for its menu at `at`, and wait for it. */
  menu(at: At): readonly MenuEntry[] | null;
}

/** One mind seated where it runs: its mirror, its clock, its orders, its observers, the mind and what it made. */
interface Seated {
  readonly recipe: MindRecipe;
  readonly mirror: Mirror;
  readonly clock: { dt: number; steps: number; time: number };
  readonly orders: { now: Orders | null };
  readonly mind: Mind;
  readonly construction: MindConstruction;
  readonly made: MindMade;
  menu?: readonly MenuEntry[] | null;
  /** Whether its last step's decision is still to come (`think`). */
  deciding: boolean;
}

/** **The host of seats where minds run**: what carries out the world's asks on each mind (`SeatAsk`) and reads what it says (`SeatSays`). */
export interface SeatHost {
  /**
   * Carry out `ask` for seat `seat`, whose numbers are `channel`'s: a step at a delay as far as its
   * answer (`answer`), its decision left to come before anything else asked of the seat
   * (`decide`).
   */
  handle(seat: number, ask: SeatAsk, channel: MirrorChannel): void;
  /** Carry out seat `seat`'s last step's decision, where it is still to come. */
  decide(seat: number): void;
  /** What seat `seat`'s mind says as it stands, its menu aside: as it is made, and as each answer leaves it (`SeatSays`). */
  says(seat: number): SeatSays;
  /** Seat `seat`'s menu as its last ask for it found it, its last step's decision carried out first. */
  menu(seat: number): readonly MenuEntry[] | null;
}

/** Set `seated`'s clock to `at`. */
const tick = (seated: Seated, at: At) => { seated.clock.steps = at.steps; seated.clock.time = at.time; };

/**
 * **A host of seats**, its minds made from the catalogs it is given by name: each made as a fight
 * makes it (`createMind`), but on a mirror of its body read from its channel, its orders those the
 * world sent last, its observers run when the world asks, and its contact labels those its numbers
 * carry.
 */
export function seatHost(catalogs: Readonly<Record<string, Catalog>>): SeatHost {
  const seats = new Map<number, Seated>();
  const seatOf = (seat: number): Seated => {
    const seated = seats.get(seat);
    if (!seated) throw new Error(`no mind is seated at ${seat}`);
    return seated;
  };
  const make = (recipe: MindRecipe, channel: MirrorChannel, at: At): Seated => {
    const catalog = catalogs[recipe.catalog];
    if (!catalog) throw new Error(`no catalog is named ${JSON.stringify(recipe.catalog)} here`);
    const { config, statics } = recipe, spec = statics.spec;
    const mirror = mirrorBody(statics, channel);
    const clock = { dt: recipe.dt, steps: at.steps, time: at.time }, orders = { now: null as Orders | null };
    const taking: { made: MindConstruction | null } = { made: null };
    const own: OwnBody = {
      spec, dt: recipe.dt, delay: statics.delay, built: mirror.read, muscles: mirror.muscles, assist: mirror.assist,
      first: mirror.senses,
      ...(mirror.contactIdentity ? { contactIdentity: mirror.contactIdentity } : {}),
    };
    const host: BodyHost = Object.freeze({
      spec, parts: catalog.treeLookup(config), seed: recipe.seed, phase: recipe.phase, rules: recipe.rules,
      clock: Object.freeze({ dt: clock.dt, get steps() { return clock.steps; }, get time() { return clock.time; } }),
      take<M extends MindConstruction>(maker: (body: OwnBody) => M): M {
        if (taking.made) throw new Error("a mind takes its body once");
        const taken = maker(own);
        taking.made = taken;
        return taken;
      },
    });
    const wiring: MindWiring = { name: recipe.name, seed: recipe.seed, phase: recipe.phase, rules: recipe.rules, orders: () => orders.now,
      ...(mirror.contactIdentity ? { contactIdentity: mirror.contactIdentity } : {}), ...(recipe.experiment ? { experiment: recipe.experiment } : {}) };
    const made = catalog.controllerOf(config).create(host, config, wiring);
    if (!taking.made) throw new Error("the mind took no body");
    return { recipe, mirror, clock, orders, mind: taking.made.mind, construction: taking.made, made, deciding: false };
  };
  const decide = (seated: Seated | undefined): void => {
    if (!seated?.deciding) return;
    seated.deciding = false;
    think(seated.mind, seated.mirror);
  };
  return {
    decide: (seat) => decide(seats.get(seat)),
    handle(seat, ask, channel) {
      decide(seats.get(seat));
      switch (ask.kind) {
        case "make":
          if (seats.has(seat)) throw new Error(`a mind is already seated at ${seat}`);
          seats.set(seat, make(ask.recipe, channel, ask.at));
          return;
        case "step": {
          const seated = seatOf(seat);
          tick(seated, ask.at);
          if (ask.orders !== undefined) seated.orders.now = ask.orders;
          answer(seated.mind, seated.mirror);
          seated.deciding = true;
          return;
        }
        case "idle": {
          const seated = seatOf(seat);
          tick(seated, ask.at);
          seated.mind.interrupt();
          seated.mirror.idle();
          return;
        }
        case "menu": {
          const seated = seatOf(seat);
          tick(seated, ask.at);
          seated.menu = seated.made.report?.menu ?? null;
          return;
        }
        case "dispose":
          seatOf(seat).construction.dispose();
          seats.delete(seat);
          return;
        default: { const never: never = ask; throw new Error(`no ask ${JSON.stringify(never)}`); }
      }
    },
    says(seat) {
      const { construction, made } = seatOf(seat), report = made.report;
      return { has: construction.has(), report: report ? reportNow(report) : null };
    },
    menu(seat) {
      const seated = seatOf(seat);
      decide(seated);
      const menu = seated.menu ?? null;
      delete seated.menu;
      return menu;
    },
  };
}

/** What `report` says now, its menu aside (`ReportNow`), each field read once. */
export const reportNow = (report: MindReport): ReportNow => ({ engagement: report.engagement, prospects: report.prospects, heading: report.heading, gait: report.gait,
  navigation: report.navigation, kit: report.kit, actions: report.actions, ended: report.ended });

/** The name `catalogs` knows `catalog` by. */
export function catalogName(catalogs: Readonly<Record<string, Catalog>>, catalog: Catalog): string {
  for (const [name, one] of Object.entries(catalogs)) if (one === catalog) return name;
  throw new Error("a mind apart is made from a catalog its place knows by name");
}

/** Whether the place a world's minds run in (`World.minds`) is one this core seats minds in. */
export const isMindPlace = (minds: { dispatch(): void }): minds is MindPlace => typeof (minds as Partial<MindPlace>).seat === "function";
