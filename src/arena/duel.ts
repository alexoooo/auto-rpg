import { createBody, SERVO_SECONDS, type Body } from "../core/body.ts";
import { buildBody } from "../core/build/build-body.ts";
import { armed } from "../core/human/grip.ts";
import { modelSpec, type BodyModel } from "../core/human/spec.ts";
import { woodenClub } from "../core/items/club.ts";
import { ATTACK_METRES, fighterMind, type FighterPlan } from "../core/mind/fighter.ts";
import { driveBy } from "../core/mind/mind.ts";
import { watchBlows, type BlowWatch, type Fighter, type LandedBlow } from "../core/rules/blows.ts";
import { createPool, type Ending } from "../core/rules/pool.ts";
import { rulebook, type Rulebook } from "../core/rules/rulebook.ts";
import type { BuiltBody } from "../core/build/build-body.ts";
import type { Skills } from "../core/skills/skills.ts";
import type { Hook, World } from "../core/world.ts";

/**
 * **A bout in the arena**: two bodies, each with the wooden club in its right hand, each driven
 * by a fighter's mind (`fighterMind`), wounded by the core's blows under the arena's rulebook, and
 * judged.
 *
 * - **They stand** `GAP_METRES` apart across the arena's centre, both facing +z as every body is
 *   built; each turns a quarter to the other, so neither starts ahead.
 * - **A mind** walks at the other until within `ATTACK_METRES` of it, then attacks its head.
 * - **A side is out** once its pool has ended, or once its body has fallen (`SkillReport.fallen`): the
 *   core has no rising, so a body down stays down. The other side wins; both out on one step is a
 *   draw.
 * - **At the cap** (`CAP_SECONDS`) the fuller bar wins, and equal bars draw.
 *
 * The world is the caller's, with the arena's solids already in it (`addArenaSolids`); the bout adds
 * its bodies and hooks, and takes them away again on `dispose`, so a replay is a new bout in the same world.
 */

/** Where the two stand, m apart across the centre, along x. */
export const GAP_METRES = 4;
/** How long a bout runs before the bars decide it, s. */
export const CAP_SECONDS = 120;

export type Side = "left" | "right";
export const SIDES: readonly Side[] = Object.freeze(["left", "right"]);

/** How a bout ended: the loser's pool's ending, its fall, or the clock. */
export type DuelEnding = Exclude<Ending, "time"> | "fallen" | "time";

export interface Verdict {
  /** Null is a draw. */
  readonly winner: Side | null;
  readonly ending: DuelEnding;
  /** The world's clock when it was decided, s. */
  readonly time: number;
}

export interface Duelist extends Fighter {
  readonly side: Side;
  readonly model: BodyModel;
  readonly body: Body;
  readonly skills: Skills;
  /** Its pool not ended and its body not fallen. */
  readonly standing: boolean;
}

export interface DuelOptions {
  readonly left: BodyModel;
  readonly right: BodyModel;
  /** The arena's unless given. */
  readonly rules?: Rulebook;
  readonly capSeconds?: number;
  /** Hears each blow as it lands. */
  readonly onBlow?: (blow: LandedBlow) => void;
  /** Called with each side as its body is built, before it first steps: the page dresses it. */
  readonly onBuilt?: (duelist: Duelist, built: BuiltBody) => void;
}

export class Duel {
  readonly world: World;
  readonly rules: Rulebook;
  readonly duelists: Readonly<Record<Side, Duelist>>;
  readonly blows: LandedBlow[] = [];
  /** Null while the bout is on. */
  verdict: Verdict | null = null;
  private readonly start: number;
  private readonly cap: number;
  private readonly watch: BlowWatch;
  private readonly judging: Hook;

  constructor(world: World, options: DuelOptions) {
    this.world = world;
    this.rules = options.rules ?? rulebook("arena");
    this.start = world.time;
    this.cap = options.capSeconds ?? CAP_SECONDS;
    const duelists = {} as Record<Side, Duelist>;
    for (const side of SIDES) {
      const model = options[side];
      const spec = armed(modelSpec(model), "right", woodenClub());
      const x = (side === "left" ? -1 : 1) * GAP_METRES / 2;
      const built = buildBody(spec, world, { position: [x, 0, 0] });
      const body = createBody(built, world, { servoSeconds: SERVO_SECONDS });
      const other = side === "left" ? "right" : "left";
      const skills = driveBy(body, fighterMind(`arena ${side}`, () => this.plan(side, other)));
      const pool = createPool(spec, this.rules);
      duelists[side] = {
        id: side, side, model, built, pool, body, skills,
        get standing() { return pool.ending() === null && !skills.report.fallen; },
      };
    }
    this.duelists = duelists;
    this.watch = watchBlows(world, SIDES.map((side) => duelists[side]), this.rules, (blow) => {
      this.blows.push(blow);
      options.onBlow?.(blow);
    });
    this.judging = world.afterStep(() => this.judge());
    for (const side of SIDES) options.onBuilt?.(duelists[side], duelists[side].built);
  }

  /** Seconds since the bout began. */
  get clock(): number { return this.world.time - this.start; }

  /** Step the world until the verdict, or `seconds` more; returns the verdict, if there is one. */
  run(seconds = Infinity): Verdict | null {
    const until = this.clock + seconds;
    while (!this.verdict && this.clock < until) this.world.step();
    return this.verdict;
  }

  /** What `side`'s mind carries out: walk at the other, attack it within `ATTACK_METRES`, or stand once it is over. */
  private plan(side: Side, other: Side): FighterPlan {
    const own = this.duelists[side], them = this.duelists[other];
    const from = own.body.view.stance.centre, to = them.body.view.stance.centre;
    const dx = to.x - from.x, dz = to.z - from.z, d = Math.max(0.001, Math.hypot(dx, dz));
    const toward = { x: dx / d, z: dz / d };
    if (this.verdict || !own.standing || !them.standing) return { move: null, look: toward, attack: null };
    return d > ATTACK_METRES ? { move: toward, look: toward, attack: null } : { move: null, look: toward, attack: them.body };
  }

  private judge(): void {
    if (this.verdict) return;
    const out = SIDES.filter((side) => !this.duelists[side].standing);
    if (out.length === 2) {
      this.verdict = { winner: null, ending: this.ending("left"), time: this.clock };
    } else if (out.length === 1) {
      const loser = out[0];
      this.verdict = { winner: loser === "left" ? "right" : "left", ending: this.ending(loser), time: this.clock };
    } else if (this.clock >= this.cap) {
      const left = this.duelists.left.pool.bar(), right = this.duelists.right.pool.bar();
      this.verdict = { winner: left > right ? "left" : right > left ? "right" : null, ending: "time", time: this.clock };
    }
  }

  private ending(side: Side): DuelEnding {
    const ending = this.duelists[side].pool.ending();
    return ending === null || ending === "time" ? "fallen" : ending;
  }

  dispose(): void {
    this.judging.dispose();
    this.watch.dispose();
    for (const side of SIDES) {
      this.duelists[side].body.dispose();
      this.duelists[side].built.dispose();
    }
  }
}
