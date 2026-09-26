// Drills (skill ceiling session 03, `docs/plans/2026-09-25-skill-ceiling-03-drills-and-league.md`).
//
// A drill is a start state, a horizon of one to three seconds, and a success criterion. One run of
// a drill builds its start once and plays every rung of the ladder from it:
//
// 1. **The start is built under physics, not written.** Both bodies are built facing at a jittered
//    separation and a scripted driver (`DrillDriver`) walks them to the drill's range, measured on
//    each body's own published striker -- socket to mark for a hand, carrier to carrier for a
//    natural striker -- so a multileg, a wheel or a biped is placed by the same rule. The drill's
//    action then runs on the same clock: a committed cut, a guard held on a stated line, a shove
//    past a body's own fall line. Nothing is teleported. A teleported body starts out of its own
//    equilibrium and with the solver's warm start cold (`docs/analysis/2026-09-25-fork.md`, the
//    floor), and it would have to settle anyway; walking it there costs a second of simulation
//    and leaves a body that is standing the way it stands.
// 2. **At the start's moment, t0, the world is captured with Havok's heap** and every rung is an
//    exact fork of it (`tests/harness/fork.mjs`): a fresh instance, the same world to the bit. So
//    the rungs play common random numbers -- the same start, the same opponent, the same dice --
//    and differ by the subject's mind alone. The comparison between rungs is paired by start.
// 3. **Minds.** A mind that was running before t0 (an opponent already fighting) is snapshotted
//    at t0 and restored into a fresh mind of the same policy in each fork (`src/fork/mind.ts`); the
//    subject's rung mind is built fresh at t0, so that no rung inherits a stance decided while
//    the script was driving its body.
// 4. **A drill declares capabilities, never a body.** `needs` reads the published views after the
//    first frame; a pair lacking what the drill needs is reported as skipped with the reason, and
//    is never scored.
//
// Harness: the Node bout runner (`tests/harness/bout-runner.mjs`) and the fork harness beside it;
// every world in a Havok instance of its own. Readings from here are comparable with other drill
// readings and with nothing taken on the page.
import { createBout, freshHavok, FRAME } from "./bout-runner.mjs";
import { captureBout, exactFork } from "./fork.mjs";
import { restoreMind, snapshotMind } from "../../src/fork/mind.ts";
import { policyMind } from "../../src/mind.ts";
import { ORDER_TUNING, StandingOrders } from "../../src/orders.ts";
import { mulberry32 } from "../../src/rng.ts";
import { ATTRIBUTES } from "../../src/golem/attributes.ts";
import { biteMechanism } from "../../src/scoring.ts";
import { isShield } from "../../src/hands.ts";
import {
  GOLEM_TACTICS, STROKE_SHAPES, aimAt, canAttack, canCover, clamp, freshGolemIntent, mirror, writeAim,
} from "../../src/golem/tactics.ts";
import {
  chooseStriker, faceThem, markOf, pointAt, restHand, strikerGap, strokeCommand,
} from "../../src/golem/walker.ts";

/** The naive ladder, bottom to top, and the mutation check's broken duelist beside it. */
export const LADDER = Object.freeze(["idle", "golem-walker", "golem-duelist"]);
export const GUARDLESS = "golem-duelist-guardless";

/** The mind every drill's opponent fights with once the drill hands it over. */
export const OPPONENT_MIND = "golem-duelist";

/**
 * The duelist with its guard broken, for the mutation check: whenever it asks a hand to cover, that
 * hand is dropped instead -- arm down, drawn in, not covering -- and its head is never tucked. Every
 * other thing it does (reading, footwork, strokes) is the duelist's own.
 */
export function guardless(inner) {
  return {
    name: GUARDLESS,
    decide(view, dt) {
      const intent = inner.decide(view, dt);
      for (const hand of ["primary", "secondary"]) {
        const h = intent[hand];
        if (!h.guard) continue;
        h.guard = false; h.pointerX = 0; h.pointerY = -1; h.reach = -1; h.roll = 0; h.wristBend = 0;
      }
      intent.natural.guard = false;
      return intent;
    },
    captureState: () => ({ inner }),
    restoreState() { /* the inner mind restores through its own record */ },
  };
}

/** A rung's mind by name: a registered policy, or the guardless duelist. */
export function rungMind(name, seed) {
  return name === GUARDLESS ? guardless(policyMind("golem-duelist", seed)) : policyMind(name, seed);
}

// ---------------------------------------------------------------------------------------------
// Reading a body's striker, from either side
// ---------------------------------------------------------------------------------------------

const other = (side) => (side === "left" ? "right" : "left");


/**
 * The distance a striker is measured at and the distance it strikes from. A hand is measured
 * socket to mark and strikes inside its reach; a natural striker is measured carrier to carrier
 * and strikes from its reach plus the duelist's lunge, because two bodies' collision radii keep
 * carriers further apart than a ram head reaches (`src/golem/walker.ts`).
 */
export function strikerRange(striker) {
  if (!striker) return Infinity;
  return striker.hand === null ? striker.reach + GOLEM_TACTICS.ramLunge : striker.reach;
}

const scratchMark = { x: 0, y: 0, z: 0 };
/** This body's striker gap as a fraction of its striker's range (Infinity with no striker). */
export function rangeFraction(view) {
  const striker = chooseStriker(view);
  if (!striker) return Infinity;
  return strikerGap(view, striker, markOf(view, scratchMark)) / strikerRange(striker);
}

/** A hand that can be asked for a stroke, the natural striker aside. */
const handStriker = (view) => {
  const striker = chooseStriker(view);
  return striker && striker.hand !== null ? striker : null;
};

// ---------------------------------------------------------------------------------------------
// Capabilities a drill may need, each a predicate on one body's published view
// ---------------------------------------------------------------------------------------------

/** Each returns null when the body has it, and the capability's name when it does not. */
export const CAPABILITIES = Object.freeze({
  striker: (view) => (chooseStriker(view) ? null : "a striker"),
  handStriker: (view) => (handStriker(view) ? null : "a hand that strikes"),
  /** An effector that strikes with an edge (`biteMechanism` is "edge"). */
  edged: (view) => {
    const caps = view.self.capabilities;
    for (const hand of ["primary", "secondary"]) {
      const h = view.self.hands[hand];
      if (caps && !h.lost && canAttack(caps.effectors[hand]) && biteMechanism(h.weapon) === "edge") return null;
    }
    return "an edged effector";
  },
  /**
   * A hand striker whose shell reaches down to a body lying on the floor: its lowest pointing, at
   * full reach, with the carrier's whole crouch, gets under `FLOOR_REACH_M`.
   */
  groundReach: (view) => {
    const caps = view.self.capabilities;
    if (!caps) return "a striker that reaches the ground";
    for (const hand of ["primary", "secondary"]) {
      const h = view.self.hands[hand];
      const cap = caps.effectors[hand];
      if (h.lost || !canAttack(cap) || !cap.reachable) continue;
      const lowest = h.shoulder.y - h.reach * Math.sin(-cap.reachable.liftMin) - caps.crouchTravel;
      if (lowest <= FLOOR_REACH_M) return null;
    }
    return "a striker that reaches the ground";
  },
});
/** The height a fallen golem's body lies below, m: a striker that gets under it reaches a downed body. */
export const FLOOR_REACH_M = 0.6;

// ---------------------------------------------------------------------------------------------
// The scripted driver
// ---------------------------------------------------------------------------------------------

/**
 * One body's controller during a drill: a script until `handoff`, and the first of `minds` after it.
 *
 * Plain fields only, so the world's walk captures and restores it whole (`src/fork/graph.ts`); the
 * script is looked up by name in `SCRIPTS` rather than held, so a fork's driver pairs with the
 * original's by construction. `minds` is empty at the capture and filled in each fork. Every mind in
 * it is asked every step, so a mind handed over at `handoff` has been watching until then.
 */
export class DrillDriver {
  constructor(drill, role, params) {
    this.name = `drill-${role}`;
    this.drill = drill;
    this.role = role;
    this.params = params;
    this.clock = 0;
    this.phase = "stance";
    this.phaseClock = 0;
    /** Seconds this body has sat inside its target range, for a drill's pause. */
    this.settled = 0;
    /** Seconds into a scripted stroke. */
    this.stroke = 0;
    /** The start state is reached; the harness captures at the end of this frame. */
    this.ready = false;
    /**
     * The other body's striker gap as a fraction of its striker's range, and that range, written by
     * the harness once a frame from the other body's own view. A published opponent carries no
     * capabilities, so a script cannot work out from its own view where the other body strikes
     * from; the drill's staging can, and this is the one thing it tells the script.
     */
    this.theirFraction = Infinity;
    this.theirRange = Infinity;
    /** Whether a scripted opponent may strike on its own (set by a drill at t0). */
    this.armed = false;
    this.handoff = Infinity;
    this.minds = [];
    this.intent = freshGolemIntent();
    this.aim = { swing: 0, lift: 0, horizontal: 0 };
    this.mark = { x: 0, y: 0, z: 0 };
  }

  go(phase) {
    this.phase = phase;
    this.phaseClock = 0;
  }

  /**
   * `orders` is whatever the body's commander handed over this decision (`src/orders.ts`), passed on to
   * every mind as the host passes it; the body's own `OrderFollower` carries it out on the command
   * this returns. A drill with no commander passes nothing, as every drill did before orders.
   */
  decide(view, dt, orders) {
    this.clock += dt;
    this.phaseClock += dt;
    let handed = null;
    for (let i = 0; i < this.minds.length; i += 1) {
      const intent = orders === undefined ? this.minds[i].decide(view, dt) : this.minds[i].decide(view, dt, orders);
      if (i === 0 && this.clock >= this.handoff) handed = intent;
    }
    if (handed) return handed;
    SCRIPTS[this.drill][this.role](this, view, dt);
    if (view.self.capabilities?.pairedHands) mirror(this.intent.primary, this.intent.secondary);
    return this.intent;
  }
}

/** Stand, face them, and hold the striker pointed at their mark; the other hand rests. */
function stance(d, view) {
  const intent = d.intent;
  faceThem(intent, view);
  intent.forward = 0;
  intent.strafe = 0;
  intent.posture.crouch = 0;
  const striker = chooseStriker(view);
  const hand = striker ? striker.hand : null;
  intent.actingHand = hand ?? "primary";
  const spare = hand === "secondary" ? "primary" : "secondary";
  restHand(intent, spare);
  // Tucked: drawn in and low, so a staged body's spare arm is not a target held out in front of it.
  intent[spare].reach = -1;
  intent[spare].pointerY = TUCK_POINTER_Y;
  markOf(view, d.mark);
  pointAt(intent, view, hand, d.mark, d.aim);
  if (hand === null) { restHand(intent, "primary"); return; }
  // Carried: raised over the bearing and drawn in, so two bodies walked together do not spar with
  // their points on the way. `pointAt` leaves the aim in `d.aim`.
  const caps = view.self.capabilities;
  if (caps) writeAim(intent[hand], caps.effectors[hand], d.aim, view.self.hands[hand].outboard, 0, CARRY.lift, 1, CARRY.reach);
}
/** The carry every scripted body holds its striker in: radians over the bearing, and the reach axis. */
const CARRY = Object.freeze({ lift: 0.5, reach: -0.5 });
/** Where a staged body's spare hand points, on its shell's lift axis (-1 is its lowest). */
const TUCK_POINTER_Y = -0.6;

/** Walk toward (or away) until `fraction` of the given body's striker range, and count the dwell. */
function walkTo(d, fractionNow, target, range, dt) {
  const error = (fractionNow - target) * range;
  // Before a body's first publication there is nothing to walk by.
  d.intent.forward = Number.isFinite(error) ? clamp(error * GOLEM_TACTICS.closeGain, -1, 1) : 0;
  d.settled = Math.abs(error) < SETTLE_BAND_M ? d.settled + dt : 0;
}
/** How close to its target range a body counts as arrived, m. */
const SETTLE_BAND_M = 0.05;
/** Seconds a stand-off opponent waits between two of its cuts. */
const STAND_OFF_COOLDOWN_S = 0.5;
/** The longest a start may take to reach its moment before it is refused, seconds. */
export const PRELUDE_LIMIT_S = 6;

/**
 * A guard held on a stated line: every hand that can cover points at their shoulder, raised or
 * lowered by `lift` radians, a shield across and drawn in, anything else out -- the duelist's cover
 * (`coverReachFor` in `src/golem/tactics.ts`) with its line fixed. The head is tucked.
 */
function guardLine(d, view, lift) {
  const intent = d.intent;
  const self = view.self;
  const caps = self.capabilities;
  if (!caps) return;
  markOf(view, d.mark);
  const trunkHeading = self.facing + self.trunkTwist * caps.trunkTwistMax;
  for (const hand of ["primary", "secondary"]) {
    const me = self.hands[hand];
    const cap = caps.effectors[hand];
    const h = intent[hand];
    if (me.lost || !canCover(cap)) { restHand(intent, hand); continue; }
    aimAt(me.shoulder, d.mark, trunkHeading, me.outboard, d.aim);
    const shield = isShield(me.weapon);
    writeAim(h, cap, d.aim, me.outboard, hand === "primary" ? 0 : (shield ? -1 : 1) * GOLEM_TACTICS.coverAcross,
      lift, 1, shield ? GOLEM_TACTICS.shieldReach : GOLEM_TACTICS.guardReach);
    h.roll = 0;
    h.wristBend = cap.bendMax > 0 ? GOLEM_TACTICS.coverBend : 0;
    h.thrust = false;
    h.guard = true;
  }
  intent.natural.thrust = false;
  intent.natural.guard = true;
}

/**
 * After a scripted stroke: stand, face, and leave the arm where the stroke's follow-through put it,
 * blade low and across. Bringing it back to the carry would sweep it through the other body a second
 * time, which is a second stroke nobody scripted.
 */
function followThrough(d, view) {
  faceThem(d.intent, view);
  d.intent.forward = 0;
  d.intent.strafe = 0;
  d.intent.posture.trunkTwist = 0;
  d.intent.posture.trunkLean = 0;
  d.intent.natural.thrust = false;
  for (const hand of ["primary", "secondary"]) d.intent[hand].thrust = false;
}

/** Stand still and do nothing to anybody: a subject's prelude in most drills. */
function standStill(d, view) { stance(d, view); }

// ---------------------------------------------------------------------------------------------
// The drills
// ---------------------------------------------------------------------------------------------

/** The lines a cut is thrown at: metres above their shoulder (a mark lifted or lowered). */
const CUT_LINES = Object.freeze({ high: 0.3, middle: 0, low: -0.35 });
/** The lines a guard is held on: radians of lift about the bearing to their shoulder. */
const GUARD_LINES = Object.freeze({ high: 0.45, middle: GOLEM_TACTICS.coverLift, low: -0.6 });
const pick = (rng, table) => { const keys = Object.keys(table); return keys[Math.floor(rng() * keys.length) % keys.length]; };
/** Every drill's build separation: past both bodies' reach, so the arms come up without a clash. */
const separation = (rng) => 2.3 + 0.3 * rng();

/** A shove along (dx, dz) worth `fraction` of that body's own fall line that way, N.s. */
export function shoveAlong(golem, dx, dz, fraction) {
  const port = golem.locomotion;
  const length = Math.hypot(dx, dz) || 1;
  const ux = dx / length, uz = dz / length;
  const impulse = fraction * port.stabilityLinesAlong(ux, uz).fallAtMps * port.supportedMassKg;
  golem.queueStabilityEvent({ horizontalShoveNs: [ux * impulse, uz * impulse] });
  return impulse;
}
/** The bearing from one body's ground to the other's, as a unit (x, z). */
function bearing(from, to) {
  const dx = to.ground.x - from.ground.x, dz = to.ground.z - from.ground.z;
  const length = Math.hypot(dx, dz) || 1;
  return [dx / length, dz / length];
}
const rotate = ([x, z], angle) => [x * Math.cos(angle) + z * Math.sin(angle), -x * Math.sin(angle) + z * Math.cos(angle)];

/** Hand a driver to the opponent's mind now (the fork's first step), the mind freshly built. */
function handToMind(driver, seed) {
  driver.minds = [policyMind(OPPONENT_MIND, seed)];
  driver.handoff = driver.clock;
}

/**
 * The scripts, by drill and role. Each writes `d.intent`, and the subject's is only ever its
 * prelude: from t0 the subject is its rung's mind.
 */
const SCRIPTS = {
  "survive-cut": {
    subject: standStill,
    opponent(d, view, dt) {
      const p = d.params;
      const striker = chooseStriker(view);
      if (d.phase === "stance") {
        stance(d, view);
        walkTo(d, rangeFraction(view), p.range, strikerRange(striker), dt);
        if (d.settled >= p.pause || d.phaseClock > 4) { d.go("stroke"); d.stroke = 0; }
        return;
      }
      if (d.phase === "stroke") {
        d.intent.forward = 0;
        d.intent.strafe = 0;
        faceThem(d.intent, view);
        markOf(view, d.mark, CUT_LINES[p.line]);
        const stage = strokeCommand(d.intent, view, striker ? striker.hand : null, d.stroke, d.mark, d.aim);
        const chamber = striker && striker.hand !== null
          ? STROKE_SHAPES[view.self.hands[striker.hand].weapon].chamberSeconds : GOLEM_TACTICS.ramLeanSeconds;
        if (!d.ready && d.stroke >= p.lead * chamber) {
          d.ready = true;
        }
        d.stroke += dt;
        if (stage === "done") d.go("after");
        return;
      }
      followThrough(d, view);
    },
  },
  "land-clean-blow": {
    subject(d, view, dt) {
      stance(d, view);
      void dt;
    },
    opponent(d, view, dt) {
      const p = d.params;
      stance(d, view);
      guardLine(d, view, GUARD_LINES[p.line]);
      if (d.phase === "stance") {
        walkTo(d, d.theirFraction, p.range, d.theirRange, dt);
        if (d.settled >= p.pause || d.phaseClock > 4) { d.ready = true; d.go("guard"); }
      } else {
        d.intent.forward = 0;
      }
    },
  },
  "get-inside": {
    subject(d, view, dt) {
      // Walked to just outside the longer arm's reach, measured on that arm.
      stance(d, view);
      walkTo(d, d.theirFraction, d.params.outside, d.theirRange, dt);
      if (!d.ready && (d.settled >= d.params.pause || d.phaseClock > 4)) d.ready = true;
    },
    /**
     * The stand-off: it keeps its ground, faces, and cuts at anything that comes inside its own
     * striking range, once a cooldown has run. A longer arm's whole advantage and nothing else.
     */
    opponent(d, view, dt) {
      const striker = chooseStriker(view);
      if (d.phase === "stroke") {
        d.intent.forward = 0;
        faceThem(d.intent, view);
        markOf(view, d.mark);
        const stage = strokeCommand(d.intent, view, striker ? striker.hand : null, d.stroke, d.mark, d.aim);
        d.stroke += dt;
        if (stage === "done") { d.go("stance"); d.settled = -STAND_OFF_COOLDOWN_S; }
        return;
      }
      stance(d, view);
      d.settled += dt;
      if (d.armed && d.settled >= 0 && rangeFraction(view) <= GOLEM_TACTICS.strikeFraction) {
        d.go("stroke");
        d.stroke = 0;
      }
    },
  },
  "hold-range": {
    subject(d, view, dt) {
      const p = d.params;
      stance(d, view);
      walkTo(d, rangeFraction(view), p.start, strikerRange(chooseStriker(view)), dt);
      if (!d.ready && (d.settled >= p.pause || d.phaseClock > 4)) d.ready = true;
    },
    opponent(d, view) {
      stance(d, view);
      if (d.phase === "close") d.intent.forward = d.params.speed;
    },
  },
  "punish-miss": {
    subject: standStill,
    opponent(d, view, dt) {
      const p = d.params;
      const striker = chooseStriker(view);
      if (d.phase === "stance") {
        stance(d, view);
        walkTo(d, rangeFraction(view), p.range, strikerRange(striker), dt);
        if (d.settled >= p.pause || d.phaseClock > 4) { d.go("stroke"); d.stroke = 0; }
        return;
      }
      if (d.phase === "stroke") {
        d.intent.forward = 0;
        d.intent.strafe = 0;
        faceThem(d.intent, view);
        markOf(view, d.mark);
        const stage = strokeCommand(d.intent, view, striker ? striker.hand : null, d.stroke, d.mark, d.aim);
        // Thrown flat-footed, so that it falls short where it was aimed to: the stroke's own step
        // in would carry it onto the body it is meant to miss.
        d.intent.forward = 0;
        d.stroke += dt;
        if (stage === "done") { d.ready = true; d.go("recover"); }
        return;
      }
      followThrough(d, view);
    },
  },
  "hold-under-orders": {
    subject: standStill,
    opponent(d, view, dt) {
      const p = d.params;
      stance(d, view);
      if (d.phase === "stance") {
        walkTo(d, rangeFraction(view), p.range, strikerRange(chooseStriker(view)), dt);
        if (d.settled >= p.pause || d.phaseClock > 4) { d.ready = true; d.go("wait"); }
      } else {
        d.intent.forward = 0;
      }
    },
  },
  finish: {
    subject(d, view, dt) {
      const p = d.params;
      stance(d, view);
      if (d.phase === "stance") {
        walkTo(d, rangeFraction(view), p.range, strikerRange(chooseStriker(view)), dt);
        if (d.settled >= p.pause || d.phaseClock > 4) d.go("shove");
      } else {
        d.intent.forward = 0;
      }
    },
    opponent: standStill,
  },
};

/** An event, as a trace keeps it. */
const eventRow = (e) => ({ side: e.side, kind: e.report.kind, damage: e.report.damage, at: e.report.at,
  edge: e.report.edgeAlignment, blade: e.report.bladeAlignment, limb: e.report.limb ?? null,
  blocked: Boolean(e.blocked), guarded: Boolean(e.guarded) });

/** Damage-bearing events a side scored after t0, from a fork's event list. */
const scored = (events, side) => events.filter((e) => e.side === side && e.report.damage > 0 && e.report.kind !== "weak");

/**
 * The suite. Each drill: what it needs of each body, how its parameters are drawn from the run's
 * seed, how long its horizon is, what its hooks do to the world, and how a run is judged.
 *
 * `judge(ctx)` returns `{ frame(), done(), result() }`; `result()` is `{ pass, margin, ... }`, where
 * the margin is the drill's continuous reading (time to success, wound taken, fraction in band),
 * and `stratum`, where present, is the parameter the drill's report is split by.
 *
 * A drill may name a `control` rung and an `admit(controlResult)` rule: the control is played
 * first from every start, and a start it does not admit is **void** -- reported with the reason,
 * never scored, exactly like a skip. That is how "their committed cut arriving" is made true of
 * every scored start rather than of most of them: the forks are exact, so the cut an idle body
 * took from this start is the cut every rung faced.
 *
 * Three drills of the plan's suite were built, measured and removed (Node bout runner, default
 * golem against itself, 40 runs each, `docs/analysis/2026-09-25-drills.md`): `recover`, `recover
 * up` and `off-balance`. In each, idle passed at least as often as the duelist: `recover` (a shove
 * at 0.80 to 0.95 of the fall line, still up after 2 s) 40 of 40 against 34, `recover-up` (1.1 to
 * 1.3 of the line, up again inside 2 s) 0 of 40 for every rung, `off-balance` (the opponent
 * pre-shoved at 0.55 to 0.80 of its line, down within 1 s) 0 of 40 for every rung. On this body a
 * shove's lean is the locomotion layer's to right -- one under the fall line decays in about 0.3 s
 * whatever the mind asks -- a fall's rise takes 2.7 to 3.0 s whatever the mind asks, and no rung's
 * blow reached the other body before its lean had decayed. Balance is not yet a thing a mind can
 * do, so a drill of it measures nothing; it comes back when the surface gives a mind a lever on it.
 */
export const DRILLS = Object.freeze([
  {
    name: "survive-cut",
    needs: { opponent: ["striker"] },
    horizon: 1,
    params: (rng) => ({ separation: separation(rng), range: 0.8 + 0.15 * rng(), line: pick(rng, CUT_LINES),
      pause: 0.3 + 0.4 * rng(), lead: 0.5 * rng() }),
    /**
     * The wound the subject may take, as a fraction of its bar. Set from 90 starts (Node bout
     * runner, default golem against itself): an idle body takes a mean 0.089 from a high cut, and
     * at 0.03 the high line reads idle 0 of 37, walker 1, duelist 14, and the guardless duelist 0.
     */
    threshold: 0.03,
    /** A cut that does not wound an idle body over the threshold is not arriving. */
    control: "idle",
    admit: (control) => !control.pass,
    voidReason: "the cut did not wound an idle body over the threshold",
    judge(ctx) {
      const v0 = ctx.view(ctx.S).self.vitality;
      let wound = 0;
      return {
        frame() { wound = v0 - ctx.view(ctx.S).self.vitality; },
        done: () => false,
        result: () => ({ pass: wound < this.threshold, margin: wound, stratum: ctx.params.line,
          blows: scored(ctx.events, ctx.O).length }),
      };
    },
  },
  {
    name: "land-clean-blow",
    needs: { subject: ["edged"] },
    horizon: 1.5,
    params: (rng) => ({ separation: separation(rng), range: 0.8 + 0.12 * rng(), line: pick(rng, GUARD_LINES),
      pause: 0.4 + 0.4 * rng() }),
    /** The alignment a scored blow must reach: edge lead for a cut, along-the-blade for a thrust. */
    threshold: 0.8,
    judge(ctx) {
      let at = null;
      let best = 0;
      const drill = this;
      return {
        frame() {
          for (const e of scored(ctx.events, ctx.S)) {
            const lead = e.report.kind === "thrust" ? e.report.bladeAlignment : Math.abs(e.report.edgeAlignment);
            best = Math.max(best, lead);
            if (at === null && lead >= drill.threshold && (e.report.kind === "cut" || e.report.kind === "thrust")) at = ctx.t();
          }
        },
        done: () => at !== null,
        result: () => ({ pass: at !== null, margin: at ?? drill.horizon, bestLead: best }),
      };
    },
  },
  {
    name: "get-inside",
    needs: { subject: ["striker"], opponent: ["striker"] },
    horizon: 3,
    /**
     * The opponent is the same body at the size attribute's ceiling, so longer-armed. It is read from
     * the row: the drill wrote 1.25 when that was the ceiling, and when the size law moved it to 1.1
     * on 2026-09-25 every run of this drill failed to build.
     */
    opponentSetup: (setup) => ({ ...setup, attributes: { ...(setup.attributes ?? {}), size: ATTRIBUTES.size.max } }),
    params: (rng) => ({ separation: 2.8 + 0.3 * rng(), outside: 1.02 + 0.1 * rng(), pause: 0.2 + 0.3 * rng() }),
    /**
     * Inside is the subject's own striking range, as a fraction of its striker's: the duelist's
     * strike fraction for a hand, and the whole of reach plus lunge for a natural striker, whose
     * carrier gap cannot close past the two bodies' collision radii (0.92 m on the wheel pair,
     * against a ram's 0.68 + 0.35), so that no smaller fraction of it is a place a body can be.
     */
    inside: (striker) => (striker && striker.hand === null ? 1 : GOLEM_TACTICS.strikeFraction),
    /** The wound it may take on the way, as a fraction of its bar: survive-cut's threshold. */
    threshold: 0.03,
    atStart(ctx) { ctx.driver(ctx.O).armed = true; },
    judge(ctx) {
      const v0 = ctx.view(ctx.S).self.vitality;
      const inside = this.inside(chooseStriker(ctx.view(ctx.S)));
      let at = null;
      let woundAt = null;
      const drill = this;
      return {
        frame() {
          const wound = v0 - ctx.view(ctx.S).self.vitality;
          if (at === null && rangeFraction(ctx.view(ctx.S)) <= inside) { at = ctx.t(); woundAt = wound; }
        },
        done: () => at !== null,
        result: () => ({ pass: at !== null && woundAt < drill.threshold, margin: at ?? drill.horizon,
          wound: woundAt ?? v0 - ctx.view(ctx.S).self.vitality }),
      };
    },
  },
  {
    name: "hold-range",
    needs: { subject: ["handStriker"] },
    horizon: 3,
    params: (rng) => ({ separation: separation(rng), start: 0.82 + 0.08 * rng(), speed: 0.25 + 0.25 * rng(),
      pause: 0.3 + 0.3 * rng() }),
    /** The band, as fractions of the subject's striker range, and the share of the horizon inside it. */
    band: [0.65, 1.0],
    threshold: 0.9,
    /**
     * A closing opponent that does not drive an idle body out of the band is not closing: on the
     * odd pair the band's inner edge sits inside the two carriers' contact distance, and idle held
     * it 3 runs of 3.
     */
    control: "idle",
    admit: (control) => !control.pass,
    voidReason: "the closing opponent did not drive an idle body out of the band",
    atStart(ctx) { ctx.driver(ctx.O).go("close"); },
    judge(ctx) {
      let inside = 0;
      let frames = 0;
      const drill = this;
      return {
        frame() {
          const f = rangeFraction(ctx.view(ctx.S));
          frames += 1;
          if (f >= drill.band[0] && f <= drill.band[1]) inside += 1;
        },
        done: () => false,
        result: () => ({ pass: inside / Math.max(frames, 1) >= drill.threshold, margin: inside / Math.max(frames, 1) }),
      };
    },
  },
  {
    name: "punish-miss",
    needs: { subject: ["striker"], opponent: ["handStriker"] },
    horizon: 1,
    params: (rng) => ({ separation: separation(rng), range: 1.12 + 0.1 * rng(), pause: 0.2 + 0.3 * rng(),
      recover: 0.3 + 0.2 * rng() }),
    atStart(ctx) {
      const d = ctx.driver(ctx.O);
      d.minds = [policyMind(OPPONENT_MIND, ctx.seed ^ 0x5bd1e995)];
      d.handoff = d.clock + ctx.params.recover;
    },
    judge(ctx) {
      let at = null;
      const drill = this;
      return {
        frame() { if (at === null && scored(ctx.events, ctx.S).length > 0) at = ctx.t(); },
        done: () => at !== null,
        result: () => ({ pass: at !== null, margin: at ?? drill.horizon }),
      };
    },
  },
  {
    /**
     * Session 06's drill: ordered to a point beside where it stands, with a duelist that has just
     * started fighting it at arm's length, the subject gets there and holds it -- inside the leash
     * for the rest of the horizon -- and takes less than the threshold on the way. The orders carry
     * the feet on every rung (`OrderFollower`, as a person's `StandingOrders` would on the page), so
     * idle arrives and holds too; what the ladder is judged on is the defending while it obeys.
     *
     * The point is `shift` metres off the subject's ground, turned `angle` from the bearing to the
     * opponent: a side-step of 60 to 120 degrees, so the body crosses in front of an armed opponent
     * rather than walking out of its reach or into it.
     */
    name: "hold-under-orders",
    needs: { subject: ["striker"], opponent: ["striker"] },
    horizon: 3,
    params: (rng) => ({ separation: separation(rng), range: 1.05 + 0.1 * rng(), pause: 0.3 + 0.3 * rng(),
      shift: 1 + 0.5 * rng(), angle: (rng() < 0.5 ? -1 : 1) * (Math.PI / 3 + (Math.PI / 3) * rng()) }),
    /** Seconds the subject has to arrive: the longest shift at a carrier's walk, with the start of it. */
    arriveBy: 2,
    /** The share of the frames after arriving that the subject is inside the leash. */
    heldShare: 0.95,
    threshold: 0.03,
    /** An attack that does not wound an idle body obeying the same order over the threshold is not arriving. */
    control: "idle",
    admit(control) { return control.margin >= this.threshold; },
    voidReason: "the duelist did not wound an idle body holding its orders over the threshold",
    atStart(ctx) {
      handToMind(ctx.driver(ctx.O), ctx.seed ^ 0x5bd1e995);
      const self = ctx.view(ctx.S).self;
      const [dx, dz] = rotate(bearing(self, ctx.view(ctx.O).self), ctx.params.angle);
      const orders = new StandingOrders();
      orders.current = { target: null, destination: { x: self.ground.x + dx * ctx.params.shift, z: self.ground.z + dz * ctx.params.shift } };
      ctx.state.goal = orders.current.destination;
      // `fix: { unordered: true }` plays the same start with no commander, for the study of what
      // obeying costs; the judge then reads the undelivered order, which such a run cannot pass.
      if (!ctx.params.unordered) ctx.golem(ctx.S).control.commander = orders;
    },
    judge(ctx) {
      const v0 = ctx.view(ctx.S).self.vitality;
      const goal = ctx.state.goal;
      const drill = this;
      let arrived = null;
      let after = 0;
      let inside = 0;
      let wound = 0;
      return {
        frame() {
          const self = ctx.view(ctx.S).self;
          const d = Math.hypot(self.ground.x - goal.x, self.ground.z - goal.z);
          if (arrived === null) { if (d <= ORDER_TUNING.arriveM) arrived = ctx.t(); }
          else { after += 1; if (d <= ORDER_TUNING.leashM) inside += 1; }
          wound = v0 - self.vitality;
        },
        done: () => false,
        result: () => {
          const held = after > 0 ? inside / after : 0;
          return { pass: arrived !== null && arrived <= drill.arriveBy && held >= drill.heldShare && wound < drill.threshold,
            margin: wound, arrived: arrived ?? drill.horizon, held };
        },
      };
    },
  },
  {
    name: "finish",
    needs: { subject: ["groundReach"] },
    horizon: 3,
    params: (rng) => ({ separation: separation(rng), range: 0.8 + 0.12 * rng(),
      angle: (rng() < 0.5 ? -1 : 1) * (Math.PI / 3 + (Math.PI / 3) * rng()), push: 1.3 + 0.3 * rng(),
      pause: 0.3 + 0.3 * rng() }),
    beforeStart(ctx) {
      const s = ctx.driver(ctx.S);
      if (s.phase === "shove" && !ctx.state.shoved) {
        ctx.state.shoved = true;
        const [dx, dz] = rotate(bearing(ctx.view(ctx.S).self, ctx.view(ctx.O).self), ctx.params.angle);
        shoveAlong(ctx.golem(ctx.O), dx, dz, ctx.params.push);
      }
      if (ctx.state.shoved && ctx.view(ctx.O).self.support === "fallen") s.ready = true;
    },
    atStart(ctx) { handToMind(ctx.driver(ctx.O), ctx.seed ^ 0x5bd1e995); },
    judge(ctx) {
      let at = null;
      let up = null;
      const drill = this;
      return {
        frame() {
          const support = ctx.view(ctx.O).self.support;
          if (up === null && support !== "fallen") up = ctx.t();
          if (at === null && up === null && scored(ctx.events, ctx.S).length > 0) at = ctx.t();
        },
        done: () => at !== null || up !== null,
        result: () => ({ pass: at !== null, margin: at ?? drill.horizon, downFor: up ?? drill.horizon }),
      };
    },
  },
]);
export const DRILL_NAMES = Object.freeze(DRILLS.map((drill) => drill.name));
const drillNamed = (name) => {
  const drill = DRILLS.find((d) => d.name === name);
  if (!drill) throw new Error(`unknown drill "${name}"`);
  return drill;
};

/** What a pair is missing for a drill, from the published views: null, or a sentence. */
export function missingFor(drill, subjectView, opponentView) {
  const missing = [];
  for (const need of drill.needs.subject ?? []) {
    const lack = CAPABILITIES[need](subjectView);
    if (lack) missing.push(`subject lacks ${lack}`);
  }
  for (const need of drill.needs.opponent ?? []) {
    const lack = CAPABILITIES[need](opponentView);
    if (lack) missing.push(`opponent lacks ${lack}`);
  }
  return missing.length > 0 ? missing.join("; ") : null;
}

// ---------------------------------------------------------------------------------------------
// One run: build the start, fork it once per rung, judge each
// ---------------------------------------------------------------------------------------------

/**
 * Each drill's judge result read as one number a planner maximises: a pass is worth 1, and the
 * margin shapes the search on either side of it -- an earlier blow, a smaller wound, more of the
 * rollout in the band, a shorter way still to go inside. Each is taken over one rollout, from a
 * judge begun at the rollout's start (so a wound is the rollout's, and a blow's time is the rung's).
 */
export const DRILL_TASKS = Object.freeze({
  "survive-cut": (r) => Number(r.pass) - r.margin,
  "land-clean-blow": (r, drill) => (r.pass ? 1 + 0.25 * (1 - r.margin / drill.horizon) : 0.5 * r.bestLead),
  "get-inside": (r, drill, ctx) => (r.pass ? 1 + 0.25 * (1 - r.margin / drill.horizon)
    : -Math.max(0, rangeFraction(ctx.view(ctx.S)) - drill.inside(chooseStriker(ctx.view(ctx.S))))) - r.wound,
  "hold-range": (r) => r.margin,
  "punish-miss": (r, drill) => (r.pass ? 1 + 0.25 * (1 - r.margin / drill.horizon) : 0),
  finish: (r, drill) => (r.pass ? 1 + 0.25 * (1 - r.margin / drill.horizon) : 0),
});

/**
 * What a planning rung (session 04's expert) forks its own rung's world with: the live rung world,
 * the subject's side, and a builder for a world with the same drivers and the same minds in them,
 * unrestored. The subject's slot holds `shell` (a `Forkable` with an empty record, which is what
 * the planner's own slot captures as), and the opponent's driver holds a fresh mind of each policy
 * its live driver holds, for the world walk to pair and restore. `signature` changes when the live
 * opponent's minds do, so a planner that keeps a built world knows to build another.
 *
 * `task(world)`, called on a restored fork before a rollout, is the drill's own judge run over that
 * rollout (`DRILL_TASKS`): a planner that scores with it is searching for the drill's pass. It
 * gives the frames left in the rung (a rollout past the rung's end would score what the drill never
 * sees), a `frame()` to call after each step, `done()`, and `value()` at the end.
 */
export function drillHost({ live, base, S, O, name, params, seed, liveDrivers, ctx: liveCtx }) {
  const minds = () => liveDrivers[O].minds.map((mind) => mind.name);
  const drill = drillNamed(name);
  return {
    live, side: S,
    signature: () => minds().join(","),
    build(physics, shell) {
      const drivers = { [S]: new DrillDriver(name, "subject", params), [O]: new DrillDriver(name, "opponent", params) };
      drivers[S].minds = [shell];
      drivers[O].minds = minds().map((policy) => policyMind(policy, 0));
      const events = [];
      const world = createBout({ ...base, physics, leftMind: drivers.left, rightMind: drivers.right,
        onSample: null, onEvent: (e) => events.push(e), onRefusal: null, onVerdict: null });
      world.drillDrivers = drivers;
      world.drillEvents = events;
      return world;
    },
    task(world) {
      const events = world.drillEvents;
      events.length = 0;
      const frame0 = liveCtx.frame;
      let frame = 0;
      const ctx = {
        S, O, params, seed, events, state: {},
        get frame() { return frame0 + frame; },
        view: (side) => world[side].view,
        golem: (side) => world[side],
        driver: (side) => world.drillDrivers[side],
        t: () => (frame0 + frame) * FRAME,
      };
      const judge = drill.judge(ctx);
      const value = DRILL_TASKS[name];
      return {
        remaining: Math.max(0, Math.round(drill.horizon / FRAME) - frame0),
        frame() { frame += 1; judge.frame(); },
        done: () => judge.done(),
        value: () => value(judge.result(), drill, ctx),
      };
    },
    /**
     * The drivers' one fact about the other body, fed once a frame as the live world feeds it. No
     * drill reads it inside a rung today (only the preludes' walks do), so deleting this feed turns
     * nothing red; it is here so that a rollout stays the live rung's future when one does.
     */
    beforeStep(world) {
      for (const side of [S, O]) {
        const theirs = world[other(side)].view;
        world.drillDrivers[side].theirFraction = rangeFraction(theirs);
        world.drillDrivers[side].theirRange = strikerRange(chooseStriker(theirs));
      }
    },
  };
}

/**
 * Run one drill from one seed for every rung.
 *
 * `subjectSetup` and `opponentSetup` are golem setups; the subject's side is drawn from the seed
 * so that the rungs of a run share a side and the runs of a drill split between the two. Returns
 * `{ skipped }` for a pair the drill cannot use, `{ refused }` for a start that never reached its
 * moment, `{ void }` for a start its control did not admit, and otherwise
 * `{ start, rungs: { [rung]: result } }`. `fix` pins named parameters over the drawn ones, for a
 * test or a study that holds one of them still (a line, a range); the draw order is unchanged.
 *
 * `rungFactory(name, seed)` builds a rung's mind where it answers one (null otherwise, and the
 * ladder's `rungMind` builds it). A rung mind with a `beforeFrame(host)` method is a planner: it is
 * awaited before every frame with a `drillHost` for its own rung world, its `summary()` is kept as
 * the rung's `planner` field, and its `dispose()` runs when the rung does.
 */
export async function runDrill({ drill: name, subjectSetup, opponentSetup, seed, rungs = LADDER, trace = false, fix = {},
  rungFactory = null }) {
  const drill = drillNamed(name);
  const rng = mulberry32(seed);
  const S = rng() < 0.5 ? "left" : "right";
  const O = other(S);
  const params = { ...drill.params(rng), ...fix };
  const theirSetup = drill.opponentSetup ? drill.opponentSetup(opponentSetup) : opponentSetup;
  const seeds = [seed ^ 0x2545f491, seed ^ 0x6c8e9cf5].map((s) => s >>> 0);
  const base = {
    left: "idle", right: "idle", seeds, locomotionMode: "supported", maxSeconds: 600,
    separation: params.separation,
    leftGolem: S === "left" ? subjectSetup : theirSetup,
    rightGolem: S === "left" ? theirSetup : subjectSetup,
  };

  // ---- the start, in the original world ----------------------------------------------------
  const drivers = { [S]: new DrillDriver(name, "subject", params), [O]: new DrillDriver(name, "opponent", params) };
  const prelude = [];
  const original = createBout({ ...base, leftMind: drivers.left, rightMind: drivers.right,
    physics: await freshHavok(), onEvent: (e) => prelude.push(e) });
  const context = (bout, driverOf, events, state) => {
    let frame = 0;
    return {
      S, O, params, seed, events, state,
      get frame() { return frame; },
      tick() { frame += 1; },
      /** Tell each driver where the other body strikes from, off that body's own view. */
      feed() {
        for (const side of [S, O]) {
          const theirs = bout[other(side)].view;
          driverOf[side].theirFraction = rangeFraction(theirs);
          driverOf[side].theirRange = strikerRange(chooseStriker(theirs));
        }
      },
      view: (side) => bout[side].view,
      golem: (side) => bout[side],
      driver: (side) => driverOf[side],
      t: () => frame * FRAME,
    };
  };
  let start;
  try {
    const ctx = context(original, drivers, prelude, {});
    drill.beforeStart?.(ctx);
    ctx.feed();
    original.step();
    ctx.tick();
    const missing = missingFor(drill, original[S].view, original[O].view);
    if (missing) return { drill: name, seed, subject: S, skipped: missing };
    while (!drivers[S].ready && !drivers[O].ready) {
      if (ctx.frame * FRAME > PRELUDE_LIMIT_S || !original.active) {
        return { drill: name, seed, subject: S, refused: original.active ? "the start never reached its moment" : "the bout ended in the prelude" };
      }
      drill.beforeStart?.(ctx);
      ctx.feed();
      original.step();
      ctx.tick();
    }
    // Minds already running are carried by snapshot; the drivers are captured with none.
    const carried = {};
    for (const side of [S, O]) {
      carried[side] = { minds: drivers[side].minds.map((mind) => snapshotMind(mind)), handoff: drivers[side].handoff };
      drivers[side].minds = [];
    }
    const vitality = { S: original[S].view.self.vitality, O: original[O].view.self.vitality };
    start = {
      t0: ctx.frame * FRAME,
      capture: captureBout(original, { heap: true }),
      carried,
      summary: {
        t0: ctx.frame * FRAME,
        params,
        preludeDamage: prelude.reduce((sum, e) => sum + e.report.damage, 0),
        vitality,
        range: { S: rangeFraction(original[S].view), O: rangeFraction(original[O].view) },
        support: { S: original[S].view.self.support, O: original[O].view.self.support },
        ...(trace ? { events: prelude.map(eventRow) } : {}),
      },
    };
  } finally {
    original.dispose();
  }

  // ---- each rung, in an exact fork ---------------------------------------------------------
  const results = {};
  let planner = null;
  // The control plays first, whether or not it is a rung asked for; a start it does not admit is
  // void and the other rungs are not played from it.
  const order = drill.control ? [drill.control, ...rungs.filter((rung) => rung !== drill.control)] : rungs;
  for (const rung of order) {
    const forkDrivers = { [S]: new DrillDriver(name, "subject", params), [O]: new DrillDriver(name, "opponent", params) };
    const events = [];
    const fork = await exactFork(base, start.capture, {
      leftMind: forkDrivers.left, rightMind: forkDrivers.right, onEvent: (e) => events.push(e),
    });
    try {
      for (const side of [S, O]) {
        forkDrivers[side].minds = start.carried[side].minds.map((snapshot) => {
          const mind = policyMind(snapshot.name, 0);
          restoreMind(mind, snapshot);
          return mind;
        });
        forkDrivers[side].handoff = start.carried[side].handoff;
      }
      const mind = (rungFactory?.(rung, (seed ^ 0x3c6ef372) >>> 0)) ?? rungMind(rung, (seed ^ 0x3c6ef372) >>> 0);
      planner = typeof mind.beforeFrame === "function" ? mind : null;
      forkDrivers[S].minds = [mind];
      forkDrivers[S].handoff = forkDrivers[S].clock;
      const ctx = context(fork, forkDrivers, events, {});
      drill.atStart?.(ctx);
      const host = planner ? drillHost({ live: fork, base, S, O, name, params, seed, liveDrivers: forkDrivers, ctx }) : null;
      const judge = drill.judge(ctx);
      const frames = Math.round(drill.horizon / FRAME);
      while (ctx.frame < frames && fork.active) {
        if (planner) await planner.beforeFrame(host);
        ctx.feed();
        fork.step();
        ctx.tick();
        judge.frame();
        if (judge.done()) break;
      }
      results[rung] = { ...judge.result(), seconds: ctx.t() };
      if (planner?.summary) results[rung].planner = planner.summary();
      if (trace) results[rung].events = events.map(eventRow);
    } finally {
      planner?.dispose?.();
      planner = null;
      fork.dispose();
    }
    if (rung === drill.control && !drill.admit(results[rung])) {
      return { drill: name, seed, subject: S, start: start.summary, void: drill.voidReason, control: results[rung] };
    }
  }
  if (drill.control && !rungs.includes(drill.control)) delete results[drill.control];
  return { drill: name, seed, subject: S, start: start.summary, rungs: results };
}

// ---------------------------------------------------------------------------------------------
// Reading a set of runs
// ---------------------------------------------------------------------------------------------

/** Runs needed for a pass rate of `p` to be known to +/-`half` at 95 %. */
export const runsFor = (p, half = 0.02) => Math.ceil(p * (1 - p) * (1.96 / half) ** 2);

/**
 * Per rung: pass rate, its binomial variance p(1-p), the runs that would pin it to +/-2 points,
 * and the mean margin with its standard deviation; per rung pair: the paired difference in pass
 * rate with its standard error, taken per start (every rung of a run plays one start, so the start
 * is the pairing unit). Skips, refusals and void starts are counted with their reasons and never
 * scored. A drill whose results carry a `stratum` is also reported per stratum under `strata`.
 */
export function summarizeDrill(runs, rungs = LADDER) {
  const out = summarizeRows(runs, rungs);
  const strata = new Set();
  for (const run of runs) if (stratumOf(run) !== undefined) strata.add(stratumOf(run));
  if (strata.size > 0) {
    out.strata = {};
    for (const stratum of [...strata].sort()) {
      out.strata[stratum] = summarizeRows(runs.filter((run) => stratumOf(run) === stratum), rungs);
    }
  }
  return out;
}

/** The stratum a run was drawn in, off whichever result it has (a void run has only its control). */
const stratumOf = (run) => (run.rungs ? Object.values(run.rungs)[0] : run.control)?.stratum;

const tally = (runs, key) => {
  const reasons = {};
  for (const run of runs) if (run[key]) reasons[run[key]] = (reasons[run[key]] ?? 0) + 1;
  return reasons;
};

function summarizeRows(runs, rungs) {
  const scoredRuns = runs.filter((run) => run.rungs);
  const out = {
    runs: runs.length, scored: scoredRuns.length,
    skipped: runs.filter((run) => run.skipped).length, refused: runs.filter((run) => run.refused).length,
    void: runs.filter((run) => run.void).length,
    reasons: { skipped: tally(runs, "skipped"), refused: tally(runs, "refused"), void: tally(runs, "void") },
    rungs: {}, pairs: {},
  };
  for (const rung of rungs) {
    const rows = scoredRuns.filter((run) => run.rungs[rung]).map((run) => run.rungs[rung]);
    const n = rows.length;
    const p = n > 0 ? rows.filter((row) => row.pass).length / n : NaN;
    const margin = n > 0 ? rows.reduce((sum, row) => sum + row.margin, 0) / n : NaN;
    const marginSd = n > 1 ? Math.sqrt(rows.reduce((sum, row) => sum + (row.margin - margin) ** 2, 0) / (n - 1)) : NaN;
    out.rungs[rung] = { n, pass: p, variance: p * (1 - p), runsFor2: runsFor(p), margin, marginSd };
  }
  for (let a = 0; a < rungs.length; a += 1) {
    for (let b = a + 1; b < rungs.length; b += 1) {
      const d = scoredRuns.filter((run) => run.rungs[rungs[a]] && run.rungs[rungs[b]])
        .map((run) => Number(run.rungs[rungs[b]].pass) - Number(run.rungs[rungs[a]].pass));
      const n = d.length;
      const mean = n > 0 ? d.reduce((s, x) => s + x, 0) / n : NaN;
      const sd = n > 1 ? Math.sqrt(d.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1)) : NaN;
      out.pairs[`${rungs[b]} - ${rungs[a]}`] = { n, difference: mean, se: sd / Math.sqrt(n) };
    }
  }
  return out;
}
