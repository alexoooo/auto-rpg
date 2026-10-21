import type { HostedBody, Fist } from "../core/body.ts";
import type { BuiltBody } from "../core/build/build-body.ts";
import { NO_COVER, type Intent } from "../core/mind/intent.ts";
import type { Sight, Tactics } from "../core/mind/tactics.ts";
import { rulebook, type Rulebook } from "../core/rules/rulebook.ts";
import type { RecipeOptions, SkillReport } from "../core/skills/skills.ts";
import { APPROACH, rangeOf } from "../core/skills/strike.ts";
import type { Actor } from "./actor.ts";
import { trackTactics } from "./locomotion-mode.ts";
import { LAB_TURN_RATE } from "./stance-mode.ts";
import type { Vec3 } from "../core/spec/quantity.ts";
import { drawTargets, readTarget, type Target, type TargetReading } from "./targets.ts";
import { SHUTTLE_TURN_RADIUS, TURN_PACE, trackOf, type Piece, type Track } from "./track.ts";
import type { Side, BodySpec } from "../core/spec/body.ts";
import { actionProducer } from "../core/mind/action-producer.ts";
import { approachActionWindow } from "../core/mind/action-window.ts";

/**
 * **The scripted research routine**: a human walks out, strikes at each of its targets in turn, turns, walks
 * back to where it started and turns again, on a loop. It is driven by tactics
 * (`routineTactics`), as any body is: they ask for a walk and a facing and give each hand an
 * action, and the skills (`src/core/skills/skills.ts`) carry them out.
 *
 * - **The walk is the Locomotion scenario's** (`trackTactics`, `locomotion-mode.ts`): round a shuttle of `ROUTINE_METRES`
 *   straights, at the pace and turn of `ROUTINE_GAIT`.
 * - **The targets are bodies** (`targets.ts`): drawn by seed about the place `POST_BEYOND` beyond
 *   the walk out, high, middle and low, one up at a time, each hung as its strike begins and read
 *   by the rule a fight wounds by. The first is the control, at the head's height as the body
 *   is built.
 * - **The strikes are the strike skill's** (`src/core/skills/strike.ts`): the tactics attack the
 *   target that is up with the hands of `ROUTINE_HANDS` in turn, and the skill throws what its
 *   body has for what that hand holds at that height (`assets/core/strikes.json`), the left's
 *   mirrored from the right's, or places its blow.
 *
 * Every torque comes from the muscle driver (`src/core/muscle/driver.ts`), so the strikes are as
 * fast as the muscles make them. Research runners and regression tests use this fixture.
 */

/** The Routine's straights, m. */
const ROUTINE_METRES = 2;

/** The Routine's path: out, a half-turn to the right, back, and a half-turn to its start. */
const ROUTINE_TRACK: readonly Piece[] = [
  { kind: "straight", metres: ROUTINE_METRES },
  { kind: "arc", metres: Math.PI * SHUTTLE_TURN_RADIUS, curvature: 1 / SHUTTLE_TURN_RADIUS },
  { kind: "straight", metres: ROUTINE_METRES },
  { kind: "arc", metres: Math.PI * SHUTTLE_TURN_RADIUS, curvature: 1 / SHUTTLE_TURN_RADIUS },
];

/**
 * The place the targets are drawn about, m beyond the end of the walk out: about a bare hand's
 * blow's distance, so that the body stands for its blows at about the straight's end.
 */
const POST_BEYOND = 0.45;

/**
 * **How the Routine walks and turns**: at `TURN_PACE` (m/s) and `LAB_TURN_RATE` (rad/s), the pair
 * whose ratio is its half-turns' radius (`SHUTTLE_TURN_RADIUS`). The Locomotion scenario takes the same half-turns
 * at the body's fastest walk and turn, but it comes to them walking. The Routine sets off into its
 * turn from standing at its targets, where a faster turn fell. Battery:
 * `docs/reference/lab.md#routine-gait`.
 */
const ROUTINE_GAIT = { pace: TURN_PACE, turn: LAB_TURN_RATE } as const;

/** The hands that strike at the targets, in turn: both hands meet every stratum. */
export const ROUTINE_HANDS: readonly Side[] = ["right", "left"];

/** Where the routine is: walking out, at its targets, or walking back. */
type Leg = "out" | "post" | "back";

/** What the Routine's targets are drawn from. */
interface Drawing {
  readonly count: number;
  readonly seed: number;
  /** The target a loop begins at, by its place among them. */
  readonly from: number;
  /** The attacker's stature, m. */
  readonly stature: number;
}

interface RoutineTactics extends Tactics {
  readonly leg: Leg;
  /** Loops done: back at the start. */
  readonly loops: number;
  /** The targets, once the tactics have seen the head's height; null before. */
  readonly targets: readonly Target[] | null;
  /** The target that is up, by its place among `targets`, and the hand that strikes at it; null when none is. */
  readonly up: { readonly index: number; readonly hand: Side } | null;
  /** The instrument has closed the reading of the target that is up: the next one's turn. */
  done(): void;
}

/**
 * **The Routine's tactics**: round `track` as the Locomotion scenario goes (`trackTactics`), and at its targets,
 * the hands of `hands` that have a blow attack them in turn, a target each. They hand their walk
 * to the attack once the first target is within the hand's reach (`rangeOf`) and the
 * distance the strike skill closes at its own fastest (`APPROACH`'s pace over its seconds); they
 * stand in guard from the end of a strike's pushes until the instrument closes its target's
 * reading (`done`), and take the walk back after the last; with no blow in either hand, or no
 * target, they walk out and back.
 */
function routineTactics(track: Track, drawing: Drawing, hands: readonly Side[], spec: BodySpec, options?: RecipeOptions): RoutineTactics {
  const walk = trackTactics(track, ROUTINE_GAIT);
  let leg: Leg = "out", loops = 0, next = drawing.from;
  const producer = actionProducer();
  const state = { producer: producer.state, finished: false };
  let targets: readonly Target[] | null = null;
  const closing = APPROACH.pace * APPROACH.seconds;
  const handOf = (index: number): Side | null => hands.length > 0 ? hands[index % hands.length]! : null;
  return {
    name: "routine", state,
    get leg() { return leg; },
    get loops() { return loops; },
    get targets() { return targets; },
    get up() {
      const hand = handOf(next);
      return leg === "post" && hand && targets && next < targets.length ? { index: next, hand } : null;
    },
    done() { next += 1; state.finished = false; producer.state.current = null; },
    decide(sight: Sight, dt: number): Intent {
      const { view, report } = sight;
      const walked = walk.decide(sight, dt);
      const laps = walk.frame(view.time, view.stance.centre.x, view.stance.centre.z).laps;
      const end = track.at(ROUTINE_METRES);
      const place: Vec3 = [end.x + POST_BEYOND * Math.sin(end.heading), 0, end.z + POST_BEYOND * Math.cos(end.heading)];
      targets ??= drawTargets(drawing.seed, drawing.count, { place, heading: end.heading, stature: drawing.stature, head: view.head.y });
      if (laps > loops) { loops = laps; leg = "out"; next = drawing.from; }
      const hand = handOf(next), first = targets[drawing.from]?.at ?? place;
      if (leg === "out") {
        // It walks out to where its first blow reaches its first target; with none to throw, to the targets' place.
        const reach = hand ? rangeOf(spec, hand, 0, options?.repertoire, options?.placed).reach : 0;
        if (Math.hypot(first[0] - view.head.x, first[2] - view.head.z) <= reach + closing) { leg = "post"; state.finished = false; }
      }
      if (leg === "post" && (!hand || next >= targets.length)) leg = "back";
      // Out, it faces its first target: the straight's own line, and not the turn beyond it the walk would face.
      if (leg === "out") return { ...walked, face: Math.atan2(first[0] - view.stance.centre.x, first[2] - view.stance.centre.z) };
      if (leg !== "post") return walked;
      const target = targets[next]!.at;
      if (producer.state.current && report.ledger.some(record => record.id === producer.state.current!.id)) state.finished = true;
      const aimed = { kind: "point" as const, at: target, body: "dummy" };
      const choice = { action: "strike", effector: `hand.${hand!}`, target: aimed };
      const around = { heading: report.heading, placed: view.stance.phase === "stand", support: report.support ?? null, walk: null, lower: 0 };
      const produced = producer.request(sight, state.finished ? null : choice, around);
      const position = produced.readiness?.kind === "position"
        ? approachActionWindow(view, produced.readiness.window, report.heading, APPROACH.pace) : null;
      // An impossible scripted target ends explicitly so the instrument can close its reading.
      if (!state.finished && produced.readiness?.kind === "blocked") {
        producer.state.current = { ...choice, id: sight.instance() };
        return { move: null, face: report.heading, guard: NO_COVER, actions: [producer.state.current] };
      }
      return {
        move: null,
        ...(position?.movement ? { movement: position.movement, ...(position.pace === undefined ? {} : { pace: position.pace }) } : {}),
        face: position?.face ?? Math.atan2(target[0] - view.head.x, target[2] - view.head.z),
        guard: NO_COVER,
        actions: produced.requests,
      };
    },
  };
}

/** What the Routine is run with, in place of its defaults. */
interface RoutineOptions {
  /** How many targets it strikes at a loop, the control first. */
  readonly targets?: number;
  /** The seed its targets are drawn from. */
  readonly seed?: number;
  /** The target a loop begins at, by its place among them: the ones before it are drawn and not struck at. The first unless given. */
  readonly from?: number;
  /** The hands that strike, in turn. */
  readonly hands?: readonly Side[];
  /** An experiment's skills, in place of their defaults. */
  readonly skills?: RecipeOptions;
  /** The rules its targets are read under: the arena's unless given. */
  readonly rules?: Rulebook;
  /** Told each target's body as it is hung; what it returns is disposed with that body. */
  readonly hung?: (built: BuiltBody) => { dispose(): void };
}

/** How many targets the Routine strikes at a loop, and the seed they are drawn from, unless told. */
const ROUTINE_TARGETS = { count: 10, seed: 1 } as const;

interface Routine {
  readonly body: HostedBody;
  readonly fists: { readonly left: Fist; readonly right: Fist };
  readonly tactics: RoutineTactics;
  readonly report: SkillReport;
  /** Seconds since the routine began: the time its body's mind saw at the last step (`BodyView.time`), whichever mind has the body. */
  time(): number;
  /** What it is doing, in words. */
  doing(): string;
  /** The fist speed of the striking hand (or the faster one), m/s, last sub-step. */
  fistSpeed(): number;
  /** Each target's reading so far, most recent last: a loop's targets in their order, then the next loop's. */
  readonly readings: readonly TargetReading[];
  /** The ball of the target that is up: its centre (world) and its radius, m; null when none is. */
  ball(): { readonly centre: Vec3; readonly radius: number } | null;
  dispose(): void;
}

/** Run the routine on `actor`'s body, a human in its reference pose at the origin, facing +z, on its feet on the ground. */
export function startRoutine(actor: Actor, options: RoutineOptions = {}): Routine {
  const { body, world } = actor, built = body.built;
  if (!built.segments.has("lowerTrunk")) throw new Error(`${built.spec.model} is not a human the routine knows`);
  const { targets: count = ROUTINE_TARGETS.count, seed = ROUTINE_TARGETS.seed, from = 0, hands = ROUTINE_HANDS, rules = rulebook("arena"), skills, hung } = options;
  const tactics = routineTactics(trackOf(ROUTINE_TRACK), { count, seed, from, stature: built.spec.stature.value },
    hands.filter((hand) => actor.strikes[hand]), built.spec, skills);
  const fists = body.view.fists;
  const speed = { left: 0, right: 0 };
  const readings: TargetReading[] = [];
  /** The target being read, and the hand striking; and the hand whose strike is under way. */
  let open: ReturnType<typeof readTarget> | null = null, striker: Side | null = null;
  const close = (reading: TargetReading): void => {
    readings.push(reading);
    open!.dispose();
    open = null;
    tactics.done();
  };

  // The instrument: it reads what the body's mind sees, whatever mind that is.
  const read = (sight: Sight): void => {
    const { report } = sight;
    for (const side of ["left", "right"] as const) speed[side] = fists[side].velocity.length();
    const live = report.actions.find(action => action.effector === "hand.left" || action.effector === "hand.right");
    striker = live ? live.effector === "hand.left" ? "left" : "right" : null;
    // One target is up at a time: the next is read from when the tactics turn to it.
    const up = tactics.up;
    if (!open && up) open = readTarget(actor, tactics.targets![up.index]!, up.hand, rules, hung, skills);
    const reading = open?.step(sight);
    if (reading) close(reading);
  };
  const { report } = actor.drive(tactics, { skills, watch: read, contactIdentity: other => open?.identify(other) ?? null });
  // Down, the body is not its tactics' to step: the target that is up is closed as it stands.
  const fall = world.afterStep(() => { if (open && body.view.down) close(open.fall()); });

  return {
    body,
    fists,
    tactics,
    report,
    readings,
    time: () => body.view.time,
    ball: () => open?.ball ?? null,
    doing() {
      if (body.view.down) return "Fallen";
      switch (tactics.leg) {
        case "out": return "Walking out";
        case "back": return "Walking back";
        case "post": {
          const live = report.actions[0];
          if (!live) return "Standing in guard";
          switch (live.phase) {
            case "prepare": return `Preparing ${live.action}: ${live.stage}`;
            case "commit": return `Striking: ${live.action}`;
            case "release": return "Returning to guard";
            default: { const never: never = live.phase; return String(never); }
          }
        }
        default: { const never: never = tactics.leg; return String(never); }
      }
    },
    fistSpeed: () => striker ? speed[striker] : Math.max(speed.left, speed.right),
    dispose() {
      fall.dispose();
      open?.dispose();
      actor.dispose();
    },
  };
}
