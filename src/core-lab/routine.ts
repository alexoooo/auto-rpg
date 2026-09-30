import { createBody, SERVO_SECONDS, type CoreBody, type Fist } from "../core/body.ts";
import type { BuiltBody } from "../core/build/build-body.ts";
import type { Hand } from "../core/control/motor.ts";
import type { StanceEnvelope } from "../core/control/stance-envelope.ts";
import type { StanceTuning } from "../core/control/stance.ts";
import { GUARD_ACTION, type Intent } from "../core/mind/intent.ts";
import { driveBy, type Mind, type Sight } from "../core/mind/mind.ts";
import type { SkillReport } from "../core/skills/skills.ts";
import { APPROACH } from "../core/skills/strike.ts";
import type { World } from "../core/world.ts";
import { trackMind } from "./run-mode.ts";
import { LAB_TURN_RATE } from "./stance-mode.ts";
import { SHUTTLE_TURN_RADIUS, TURN_PACE, trackOf, type Piece, type Track } from "./track.ts";

/**
 * **The core lab's routine**: a human walks out, strikes at a post three times, turns, walks back
 * to where it started and turns again, on a loop. It is driven by a mind (`routineMind`), as any
 * core body is: the mind asks for a walk and a facing and gives each hand an action, and the
 * skills (`src/core/skills/skills.ts`) carry them out.
 *
 * - **The walk is the Run's** (`trackMind`, `run-mode.ts`): round a shuttle of `ROUTINE_METRES`
 *   straights, at the pace and turn of `ROUTINE_GAIT`.
 * - **The strikes are the strike skill's** (`src/core/skills/strike.ts`): the mind attacks the post
 *   with each hand of `ROUTINE_HANDS` in turn, and the skill throws the searched recipe for what
 *   that hand holds (`assets/core/strikes.json`), the left's mirrored from the right's. It brings
 *   the body to the recipe's place, sets its feet there and stands it still `STAND` s before each.
 *
 * Every torque comes from the muscle driver (`src/core/muscle/driver.ts`), so the strikes are as
 * fast as the muscles make them: that is what the page is for.
 */

export type { Fist };

/** The Routine's straights, m: its first version's walk out. */
export const ROUTINE_METRES = 2;

/** The Routine's path: out, a half-turn to the right, back, and a half-turn to its start. */
export const ROUTINE_TRACK: readonly Piece[] = [
  { kind: "straight", metres: ROUTINE_METRES },
  { kind: "arc", metres: Math.PI * SHUTTLE_TURN_RADIUS, curvature: 1 / SHUTTLE_TURN_RADIUS },
  { kind: "straight", metres: ROUTINE_METRES },
  { kind: "arc", metres: Math.PI * SHUTTLE_TURN_RADIUS, curvature: 1 / SHUTTLE_TURN_RADIUS },
];

/**
 * The post, m beyond the end of the walk out, at the head's standing height: where the fists'
 * recipes (0.40 and 0.48 m ahead of the head) stand the body at about the straight's end. A point
 * to aim at, drawn and not solid: the strikes are read in the air.
 */
export const POST_BEYOND = 0.45;

/**
 * **How the Routine walks and turns**: at `TURN_PACE` (m/s) and `LAB_TURN_RATE` (rad/s), the pair
 * whose ratio is its half-turns' radius (`SHUTTLE_TURN_RADIUS`). The Run takes the same half-turns
 * at the body's fastest walk and turn, but it comes to them walking. The Routine sets off into its
 * turn from standing at the post, and there the fastest turn fell: the envelope's turns were
 * measured on a walk under way, and one second after setting off (`TURN_LEAD`) the walk is not
 * (0.1 m/s). At the Rogue's fastest walk, 0.5 m/s, and 2 rad/s, it fell in the second loop of
 * every run; at 0.3 m/s and the envelope's 4 rad/s there, the Warrior pivoted half round nearly
 * where it stood and ran away sideways after it, in 1 run of 6 at 120 Hz and 1 of 6 at 480, 10
 * loops each, pushed 3 N s at the start (`research/core-routine-battery.mjs`, Node stand). At this
 * gait each human held all 60 loops of that battery at 120 and 480 Hz. Standing still after each
 * strike before walking on was tried too, and changed nothing: the turn was the cause.
 */
export const ROUTINE_GAIT = { pace: TURN_PACE, turn: LAB_TURN_RATE } as const;

/** The hands that strike at the post, in turn. */
export const ROUTINE_HANDS: readonly Hand[] = ["right", "left", "right"];

/** Where the routine's mind is: walking out, at the post, or walking back. */
export type Leg = "out" | "post" | "back";

export interface RoutineMind extends Mind {
  readonly leg: Leg;
  /** Loops done: back at the start. */
  readonly loops: number;
  /** The post (world), once the mind has seen its head's height; null before. */
  readonly post: readonly [number, number, number] | null;
}

/**
 * **The Routine's mind**: round `track` as the Run goes (`trackMind`), and at the post, each hand
 * of `hands` that has a blow attacks it in turn. It hands its walk to the attack once the post is
 * within the hand's reach (`StrikeReport.reach`) and the distance the strike skill closes at its
 * own fastest (`APPROACH`'s pace over its seconds), and takes it back when the last blow is thrown.
 */
export function routineMind(track: Track, envelope: StanceEnvelope, hands: readonly Hand[] = ROUTINE_HANDS): RoutineMind {
  const walk = trackMind(track, envelope, ROUTINE_GAIT);
  let leg: Leg = "out", loops = 0, next = 0, counted = 0;
  let post: [number, number, number] | null = null;
  let order: readonly Hand[] | null = null;
  const closing = APPROACH.pace * APPROACH.seconds;
  return {
    name: "routine",
    get leg() { return leg; },
    get loops() { return loops; },
    get post() { return post; },
    decide(sight: Sight, dt: number): Intent {
      const { view, report } = sight;
      const walked = walk.decide(sight, dt);
      const laps = walk.frame(view.time).laps;
      const end = track.at(ROUTINE_METRES);
      post ??= [end.x + POST_BEYOND * Math.sin(end.heading), view.head.y, end.z + POST_BEYOND * Math.cos(end.heading)];
      order ??= hands.filter((hand) => report.strike.reach[hand] !== null);
      if (laps > loops) { loops = laps; leg = "out"; next = 0; }
      if (leg === "post") {
        const thrown = report.strike.thrown.left + report.strike.thrown.right;
        if (thrown > counted) { counted = thrown; next += 1; }
        if (next >= order.length) leg = "back";
      }
      if (leg === "out" && next < order.length) {
        if (Math.hypot(post[0] - view.head.x, post[2] - view.head.z) <= report.strike.reach[order[next]!]! + closing) {
          leg = "post";
          counted = report.strike.thrown.left + report.strike.thrown.right;
        }
      }
      // Out, it faces the post: the straight's own line, and not the turn beyond it the walk would face.
      if (leg === "out") return { ...walked, face: Math.atan2(post[0] - view.stance.centre.x, post[2] - view.stance.centre.z) };
      if (leg !== "post") return walked;
      const hand = order[next]!;
      return {
        move: null,
        face: Math.atan2(post[0] - view.head.x, post[2] - view.head.z),
        hands: { left: GUARD_ACTION, right: GUARD_ACTION, [hand]: { kind: "attack", target: post } },
      };
    },
  };
}

export interface StrikeReading {
  readonly name: string;
  readonly hand: Hand;
  /** Peak speed of the striking fist in the world, m/s, from its chamber to the end of its pushes. */
  readonly peak: number;
  /**
   * Where the head stood as the strike began, from the recipe's place, m: along the heading
   * (positive, the post was beyond the recipe's distance) and across it (positive, to the right).
   */
  readonly off: { readonly along: number; readonly across: number };
}

export interface Routine {
  readonly body: CoreBody;
  readonly fists: { readonly left: Fist; readonly right: Fist };
  readonly mind: RoutineMind;
  readonly report: SkillReport;
  /** Seconds since the routine began. */
  time(): number;
  /** What it is doing, in words. */
  doing(): string;
  /** The fist speed of the striking hand (or the faster one), m/s, last sub-step. */
  fistSpeed(): number;
  /** Each strike thrown so far, most recent last. */
  readonly strikes: readonly StrikeReading[];
  /** How far `hand` is closed into a fist, 0 relaxed to 1 closed, for the skin to draw; nothing physical reads it. */
  closure(hand: Hand): number;
  dispose(): void;
}

/**
 * Run the routine on `built`, a human in its reference pose at the origin, facing +z, on its feet on
 * the ground; `tuning` tunes its stance, as an experiment's override.
 */
export function startRoutine(built: BuiltBody, world: World, tuning?: StanceTuning): Routine {
  if (!built.segments.has("lowerTrunk")) throw new Error(`${built.spec.model} is not a human the routine knows`);
  const body = createBody(built, world, { servoSeconds: SERVO_SECONDS, stance: tuning });
  const mind = routineMind(trackOf(ROUTINE_TRACK), body.envelope!);
  const fists = body.view.fists;
  const speed = { left: 0, right: 0 };
  const strikes: StrikeReading[] = [];
  let time = 0, thrown = 0;
  let current: { name: string; hand: Hand; peak: number; off: StrikeReading["off"] } | null = null;
  // When each hand began to close for a strike, and when it began to open after one.
  const closedAt: Record<Hand, number | null> = { left: null, right: null };
  const openedAt: Record<Hand, number | null> = { left: null, right: null };

  // The instrument: it reads what the mind sees, before the mind decides, and changes nothing.
  const read = ({ view, report }: Sight): void => {
    time = view.time;
    for (const side of ["left", "right"] as const) speed[side] = fists[side].velocity.length();
    const { strike } = report;
    const striking = strike.hand !== null && (strike.phase === "chamber" || strike.phase === "swing");
    if (striking && !current && strike.chosen && mind.post) {
      const h = report.heading, dx = mind.post[0] - view.head.x, dz = mind.post[2] - view.head.z;
      current = {
        name: strike.chosen.strike.name, hand: strike.hand!, peak: 0,
        off: { along: dx * Math.sin(h) + dz * Math.cos(h) - strike.chosen.recipe.distance, across: dx * Math.cos(h) - dz * Math.sin(h) },
      };
      closedAt[current.hand] = time;
      openedAt[current.hand] = null;
    }
    if (current) current.peak = Math.max(current.peak, speed[current.hand]);
    if (strike.thrown.left + strike.thrown.right > thrown) {
      thrown = strike.thrown.left + strike.thrown.right;
      if (current) {
        strikes.push({ ...current });
        closedAt[current.hand] = null;
        openedAt[current.hand] = time;
      }
      current = null;
    }
  };
  const { report } = driveBy(body, { name: mind.name, decide: (sight, dt) => { read(sight); return mind.decide(sight, dt); } });

  return {
    body,
    fists,
    mind,
    report,
    strikes,
    time: () => time,
    doing() {
      if (report.fallen) return "Fallen";
      switch (mind.leg) {
        case "out": return "Walking out";
        case "back": return "Walking back";
        case "post": {
          const name = report.strike.chosen?.strike.name;
          switch (report.strike.phase) {
            case "approach": return "Closing on the post";
            case "place": return "Setting its feet";
            case "chamber": return `Chambering: ${name}`;
            case "swing": return `Striking: ${name}`;
            case "settle": case null: return "Standing in guard";
            default: { const never: never = report.strike.phase; return String(never); }
          }
        }
        default: { const never: never = mind.leg; return String(never); }
      }
    },
    fistSpeed: () => current ? speed[current.hand] : Math.max(speed.left, speed.right),
    closure(hand) {
      const closed = closedAt[hand], opened = openedAt[hand];
      if (closed !== null) return Math.min(1, (time - closed) / FIST_CLOSING);
      if (opened !== null) return Math.max(0, 1 - (time - opened) / FIST_OPENING);
      return 0;
    },
    dispose: () => body.dispose(),
  };
}

/**
 * A striking hand closes over `FIST_CLOSING` seconds from its chamber (or its pushes, if it has
 * none), and opens over `FIST_OPENING` seconds after the pushes end. Chosen by eye.
 */
const FIST_CLOSING = 0.1, FIST_OPENING = 0.25;
