// The reference expert (skill ceiling session 04, `docs/plans/2026-09-25-skill-ceiling-04-expert.md`).
//
// An offline mind that searches its own body's command space on exact forks of the live world. It
// is an instrument: it never ships, and what it scores on a body is meant to be a fact about the
// body rather than about whoever wrote a mind.
//
// **Receding horizon.** Every `1 / decisionHz` seconds of the live bout it captures the world with
// Havok's heap (`captureBout(bout, { heap: true })`) and scores candidate plans by rolling each one
// out for `horizon` seconds in an exact fork (session 02: bit-identical to the original). It commits
// the best plan and plays it until the next decision, when it forks again. A decision runs two
// rounds: structured proposals plus noisy draws, then mutations of the best few.
//
// **A candidate is a plan, not a command list.** A plan is one or two closed-loop segments with a
// switch time, each a small controller over the published view: follow a naive-ladder mind, hold
// the last command, stand (pointing or covering a line, with footwork), or throw one stroke at a
// sampled mark. Because the segments read the view every substep, the committed prefix reproduces
// the rollout's commands exactly whenever the world does (see `tests/expert.test.mjs`). The search
// does not care where a plan came from: the ladder's own continuation (`follow`), a hold, and
// strokes toward sampled marks are proposals like any other.
//
// **What it drives** is `Intent`, the controller a person uses, until session 06 replaces it.
//
// **Two instruments** (the owner's decision, 2026-09-25):
//   - `full` -- inside a rollout the opponent is its real mind, restored from the capture and
//     reseeded: the expert knows the policy and not the dice. One reseed per decision, shared by
//     every candidate, so candidates are compared on common random numbers.
//   - `persistence` -- the opponent is replaced inside the rollout by a model that keeps applying
//     the command it applied last in the live world.
//
// **The objective** (`scoreRollout`), each term logged per decision:
//   - damage: bar dealt minus bar taken over the horizon;
//   - end: +1 / -1 bar if the bout is decided inside the horizon;
//   - down: the terminal support state of both bodies (fallen or rising);
//   - position: how far the expert's own striker range fraction ends outside [0.65, 1.0], the
//     hold-range drill's band;
//   - stall and retreat: session 03's near-range stall seconds and retreat-outside-reach seconds
//     (`src/engagement.ts`) accrued by the expert over the horizon, each at a cost per second, so
//     it cannot win by standing off.
//
// **Fork reuse.** An exact fork costs a fresh Havok instance and a build (session 02: 93 ms of its
// median, far more on a loaded host). A fork world is kept and restored again for every candidate:
// Havok's whole memory is copied over it and the JavaScript graph rewritten, which is the same
// restore a fresh fork gets. It is rebuilt whenever its topology (severs, ruins, a mid-bout grip)
// differs from the capture's, since no restore can un-sever a part. `a_reused_fork_is_a_fresh_fork`
// in `tests/expert.test.mjs` holds a reused fork bit-identical to a fresh one.
//
// Harness: the Node bout runner and the fork harness. Readings are comparable with other Node bout
// runner and drill runner readings, and with nothing taken on the page.
import { createHash } from "node:crypto";
import { createBout, freshHavok, FRAME } from "./bout-runner.mjs";
import { captureBout } from "./fork.mjs";
import { rangeFraction } from "./drills.mjs";
import { restoreWorld } from "../../src/fork/world.ts";
import { randomStreams, restoreMind, snapshotMind } from "../../src/fork/mind.ts";
import { policyMind } from "../../src/mind.ts";
import { mulberry32 } from "../../src/rng.ts";
import { isShield } from "../../src/hands.ts";
import {
  GOLEM_TACTICS, aimAt, canCover, clamp, freshGolemIntent, mirror, writeAim,
} from "../../src/golem/tactics.ts";
import { chooseStriker, faceThem, markOf, pointAt, restHand, strokeCommand } from "../../src/golem/walker.ts";

// ---------------------------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------------------------

/** The naive-ladder minds the expert keeps running beside itself, so a plan can follow one. */
export const SHADOWS = Object.freeze(["golem-duelist", "golem-walker"]);

export const EXPERT_DEFAULTS = Object.freeze({
  /** Rollouts per decision, both rounds together. */
  candidates: 16,
  /** Seconds each rollout runs. */
  horizon: 1.0,
  /** Decisions per second of the live bout; a plan is committed for `1 / decisionHz`. */
  decisionHz: 4,
  /** Search rounds: proposals, then mutations of the elite (2), or proposals alone (1). */
  rounds: 2,
  /** `full`: the opponent's real mind, reseeded. `persistence`: its last applied command, held. */
  opponent: "full",
  /** Plan on the capture from this many decisions ago: 0 is the live world, more is a blinded fork. */
  stale: 0,
  /** Reuse one fork world across candidates and decisions (bit-identical; see the header). */
  reuse: true,
  /**
   * Restart the opponent's dice in every rollout (the `full` instrument). Off, a rollout plays the
   * opponent's actual future, which only a test of the plumbing wants.
   */
  reseed: true,
  /** Keep each decision's predicted end state (bars and a pose hash), for a test. */
  trace: false,
  /** The objective's weights, in bars (a whole bar is 1). */
  weights: Object.freeze({ damage: 1, end: 1, down: 0.08, position: 0.03, stall: 0.03, retreat: 0.03 }),
  /** The hold-range band, as fractions of the expert's striker range. */
  band: Object.freeze([0.65, 1.0]),
  /** Scale on every proposal's noise. */
  noise: 1,
});

/**
 * An expert by name: `expert`, then any of `-persist` (the model-only instrument), `-blind` (a fork
 * four decisions stale, the sanity mutation), `-fresh` (no fork reuse), and `@` with comma-separated
 * overrides: `c16` candidates, `h1` horizon seconds, `r2` rounds, `d4` decisions a second, `s4`
 * stale decisions. `expert@c8,h0.5` is 8 candidates over half a second.
 */
export function expertConfig(name) {
  const match = /^expert((?:-[a-z]+)*)(?:@(.*))?$/.exec(name);
  if (!match) return null;
  const config = { ...EXPERT_DEFAULTS, weights: { ...EXPERT_DEFAULTS.weights } };
  for (const flag of (match[1] ?? "").split("-").filter(Boolean)) {
    if (flag === "persist") config.opponent = "persistence";
    else if (flag === "blind") config.stale = 4;
    else if (flag === "fresh") config.reuse = false;
    else throw new Error(`expert: unknown flag "-${flag}" in "${name}"`);
  }
  for (const item of (match[2] ?? "").split(",").filter(Boolean)) {
    const key = item[0], value = Number(item.slice(1));
    if (!Number.isFinite(value)) throw new Error(`expert: bad value in "${item}" of "${name}"`);
    if (key === "c") config.candidates = value;
    else if (key === "h") config.horizon = value;
    else if (key === "r") config.rounds = value;
    else if (key === "d") config.decisionHz = value;
    else if (key === "s") config.stale = value;
    else throw new Error(`expert: unknown override "${item}" in "${name}"`);
  }
  if (!(config.candidates >= 1 && config.horizon > 0 && config.decisionHz > 0 && config.rounds >= 1)) {
    throw new Error(`expert: "${name}" asks for a search that cannot run`);
  }
  return config;
}

// ---------------------------------------------------------------------------------------------
// Plans: closed-loop segments over the published view
// ---------------------------------------------------------------------------------------------

const copyHand = (from, into) => mirror(from, into);
/** Copy a whole command, field by field, into one this code owns. */
export function copyIntent(from, into) {
  into.forward = from.forward;
  into.strafe = from.strafe;
  into.turn = from.turn;
  into.actingHand = from.actingHand;
  into.natural.thrust = from.natural.thrust;
  into.natural.guard = from.natural.guard;
  into.posture.trunkLean = from.posture.trunkLean;
  into.posture.trunkTwist = from.posture.trunkTwist;
  into.posture.crouch = from.posture.crouch;
  copyHand(from.primary, into.primary);
  copyHand(from.secondary, into.secondary);
  return into;
}
export const cloneIntent = (from) => copyIntent(from, freshGolemIntent());

/** The minds a plan needs asked every substep: the ones any of its segments follows. */
export function shadowsOf(plan) {
  const out = new Set();
  for (const seg of plan.segs) if (seg.kind === "follow") out.add(seg.mind);
  return out;
}

/**
 * Cover a line with every hand that can: the duelist's cover with its line set by `lift` radians
 * over the bearing to their shoulder, as the drills' guard is. The head is tucked.
 */
function cover(intent, view, lift, mark, aim) {
  const self = view.self;
  const caps = self.capabilities;
  markOf(view, mark);
  const trunkHeading = self.facing + self.trunkTwist * caps.trunkTwistMax;
  for (const hand of ["primary", "secondary"]) {
    const me = self.hands[hand];
    const cap = caps.effectors[hand];
    const h = intent[hand];
    if (me.lost || !canCover(cap)) { restHand(intent, hand); continue; }
    aimAt(me.shoulder, mark, trunkHeading, me.outboard, aim);
    const shield = isShield(me.weapon);
    writeAim(h, cap, aim, me.outboard, hand === "primary" ? 0 : (shield ? -1 : 1) * GOLEM_TACTICS.coverAcross,
      lift, 1, shield ? GOLEM_TACTICS.shieldReach : GOLEM_TACTICS.guardReach);
    h.roll = 0;
    h.wristBend = cap.bendMax > 0 ? GOLEM_TACTICS.coverBend : 0;
    h.thrust = false;
    h.guard = true;
  }
  intent.natural.thrust = false;
  intent.natural.guard = true;
  intent.posture.trunkTwist = 0;
  intent.posture.trunkLean = 0;
}

/** Their shoulder over their footprint, lifted and moved sideways across the bearing. */
function markAt(view, mark, lift, lateral) {
  markOf(view, mark, lift);
  const dx = view.opponent.ground.x - view.self.ground.x, dz = view.opponent.ground.z - view.self.ground.z;
  const length = Math.hypot(dx, dz) || 1;
  mark.x += lateral * (dz / length);
  mark.z += lateral * (-dx / length);
  return mark;
}

/**
 * One plan being played: plain state and scratch, so a plan in progress can be cloned into a
 * rollout (the warm start) and go on exactly as the live one will.
 */
export class Program {
  constructor(plan, state = null) {
    this.plan = plan;
    this.t = state ? state.t : 0;
    this.segT = state ? state.segT : 0;
    this.seg = state ? state.seg : 0;
    this.stroke = state ? state.stroke : -1;
    this.done = state ? state.done : false;
    this.intent = freshGolemIntent();
    this.aim = { swing: 0, lift: 0, horizontal: 0 };
    this.mark = { x: 0, y: 0, z: 0 };
  }

  state() { return { t: this.t, segT: this.segT, seg: this.seg, stroke: this.stroke, done: this.done }; }

  clone() { return new Program(this.plan, this.state()); }

  /** A command for this substep. `latest` holds each shadow's command for this same substep. */
  decide(view, dt, latest) {
    const plan = this.plan;
    const seg = plan.segs.length > 1 && this.t >= plan.switchAt ? 1 : 0;
    if (seg !== this.seg) { this.seg = seg; this.segT = 0; this.stroke = -1; this.done = false; }
    const spec = plan.segs[seg];
    const intent = this.intent;
    if (!view.self.capabilities) {
      copyIntent(freshGolemIntent(), intent);
    } else if (spec.kind === "follow") {
      copyIntent(latest[spec.mind], intent);
      intent.forward = clamp(intent.forward + spec.df, -1, 1);
      intent.strafe = clamp(intent.strafe + spec.ds, -1, 1);
    } else if (spec.kind === "hold") {
      copyIntent(spec.intent, intent);
    } else {
      this.segment(spec, view, dt);
    }
    this.t += dt;
    this.segT += dt;
    return intent;
  }

  /** The two segments this file writes: a stance, and a single stroke. */
  segment(spec, view, dt) {
    const intent = this.intent;
    faceThem(intent, view);
    intent.forward = spec.f;
    intent.strafe = spec.s;
    intent.posture.crouch = 0;
    const striker = chooseStriker(view);
    const hand = striker ? striker.hand : null;
    intent.actingHand = hand ?? "primary";
    const spare = hand === "secondary" ? "primary" : "secondary";
    restHand(intent, spare);
    markAt(view, this.mark, spec.lift ?? 0, spec.lateral ?? 0);
    const stance = () => {
      if (spec.guard) cover(intent, view, spec.line ?? GOLEM_TACTICS.coverLift, this.mark, this.aim);
      else {
        pointAt(intent, view, hand, this.mark, this.aim);
        if (hand === null) restHand(intent, "primary");
      }
    };
    if (spec.kind === "stance" || !striker) stance();
    else if (this.done || this.segT < spec.delay) stance();
    else {
      if (this.stroke < 0) this.stroke = 0;
      const stage = strokeCommand(intent, view, hand, this.stroke, this.mark, this.aim);
      this.stroke += dt;
      if (stage === "done") { this.done = true; stance(); }
    }
    if (view.self.capabilities.pairedHands) mirror(intent.primary, intent.secondary);
  }
}

// ---------------------------------------------------------------------------------------------
// Proposals and mutations
// ---------------------------------------------------------------------------------------------

const follow = (mind, df = 0, ds = 0) => ({ kind: "follow", mind, df, ds });
const stance = (f, s, guard, extra = {}) => ({ kind: "stance", f, s, guard, lift: 0, lateral: 0, ...extra });
const stroke = (delay, lift, lateral, f, s = 0) => ({ kind: "stroke", delay, lift, lateral, f, s, guard: true });
const single = (label, seg, horizon) => ({ label, segs: [seg], switchAt: horizon });
const pair = (label, a, b, switchAt) => ({ label, segs: [a, b], switchAt });

/** The lines a proposal's stroke is thrown at: metres over their shoulder, the drills' cut lines. */
const LINES = Object.freeze([0.3, 0, -0.35]);

/** The duelist's own continuation, as a plan: what an expert plays before its first search. */
const FOLLOW_DUELIST = Object.freeze({ label: "duelist", segs: [follow("golem-duelist")], switchAt: Infinity });

/**
 * The structured proposals, in the order they are kept when the budget is short. The first is the
 * duelist's own continuation, so that a decision on which every candidate ties is the duelist's.
 */
export function proposals(config, { hold, warm }) {
  const h = config.horizon;
  const cut = Math.min(0.5 * h, 0.4);
  const list = [
    single("duelist", follow("golem-duelist"), h),
    warm && carriesState(warm.plan) ? { ...warm.plan, label: "warm", warm } : null,
    single("cut-mid", stroke(0, 0, 0, 0), h),
    pair("step-cut", stance(0.6, 0, false), stroke(0, 0, 0, 0.3), cut),
    single("back-off", stance(-0.6, 0, true), h),
    single("cut-high", stroke(0, LINES[0], 0, 0), h),
    single("press", stance(0.6, 0, false), h),
    single("walker", follow("golem-walker"), h),
    single("guard", stance(0, 0, true), h),
    pair("cut-back", stroke(0, 0, 0, 0), stance(-0.6, 0, true), Math.min(0.75 * h, 0.7)),
    single("circle-l", stance(0, -0.7, true), h),
    single("circle-r", stance(0, 0.7, true), h),
    single("cut-low", stroke(0, LINES[2], 0, 0), h),
    single("hold", { kind: "hold", intent: hold }, h),
    pair("duelist-cut", follow("golem-duelist"), stroke(0, 0, 0, 0), cut),
    pair("back-cut", stance(-0.5, 0, true), stroke(0, 0, 0, 0.4), cut),
  ];
  return list.filter(Boolean);
}

/** Whether a plan in progress differs from the same plan begun afresh: a switch, or a stroke under way. */
const carriesState = (plan) => plan.segs.length > 1 || plan.segs.some((seg) => seg.kind === "stroke");

const gauss = (rng) => {
  const u = Math.max(rng(), 1e-12), v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};
/** Per-parameter noise, before `config.noise`: forward and strafe, metres of mark, seconds. */
const SIGMA = Object.freeze({ f: 0.35, s: 0.35, lift: 0.15, lateral: 0.15, delay: 0.1, switchAt: 0.15, df: 0.3, ds: 0.3 });

function jitterSeg(seg, rng, scale) {
  const out = { ...seg };
  const n = (key, lo, hi) => { if (typeof out[key] === "number") out[key] = clamp(out[key] + SIGMA[key] * scale * gauss(rng), lo, hi); };
  if (seg.kind === "follow") { n("df", -1, 1); n("ds", -1, 1); }
  if (seg.kind === "stance" || seg.kind === "stroke") { n("f", -1, 1); n("s", -1, 1); n("lift", -0.6, 0.6); n("lateral", -0.5, 0.5); }
  if (seg.kind === "stroke") n("delay", 0, 0.6);
  return out;
}

/** A noisy copy of a plan; a warm plan's clock state is dropped, so it becomes an ordinary plan. */
export function jitterPlan(plan, rng, scale, config) {
  const segs = plan.segs.map((seg) => (seg.kind === "hold" ? seg : jitterSeg(seg, rng, scale)));
  const switchAt = segs.length > 1
    ? clamp(plan.switchAt + SIGMA.switchAt * scale * gauss(rng), 1 / config.decisionHz, config.horizon)
    : config.horizon;
  return { label: `${plan.label.replace(/[~*]+$/, "")}~`, segs, switchAt };
}

/** A random plan from the proposal families, for filling a round the fixed list does not. */
function randomPlan(rng, config, base) {
  const pick = base[Math.floor(rng() * base.length) % base.length];
  return jitterPlan(pick, rng, config.noise, config);
}

// ---------------------------------------------------------------------------------------------
// Minds: the live expert, what stands in its place inside a fork, and the opponent model
// ---------------------------------------------------------------------------------------------

/**
 * What a fork's world graph pairs with the expert's slot: a `Forkable` with an empty record. The
 * live expert's own state is not world state -- its shadows are carried by snapshot, its plan by
 * `Program.clone` -- so the capture holds nothing for it and the fork restores nothing into it.
 */
export class ExpertShell {
  constructor() { this.name = "expert-shell"; this.intent = freshGolemIntent(); }
  decide() { return this.intent; }
  captureState() { return {}; }
  restoreState() { /* nothing is world state */ }
}

/** The expert's slot inside a rollout: a plan, and the shadows it follows, asked every substep. */
class RolloutMind extends ExpertShell {
  constructor(shadowNames) {
    super();
    this.name = "expert-rollout";
    this.shadows = Object.fromEntries(shadowNames.map((name) => [name, policyMind(name, 0)]));
    this.latest = {};
    this.program = null;
    this.used = [];
  }
  load(program, snapshots) {
    this.program = program;
    this.used = [...shadowsOf(program.plan)];
    for (const name of this.used) restoreMind(this.shadows[name], snapshots[name]);
  }
  decide(view, dt) {
    for (const name of this.used) this.latest[name] = this.shadows[name].decide(view, dt);
    return this.program.decide(view, dt, this.latest);
  }
}

/** The persistence model: the command the opponent applied last in the live world, held. */
class PersistenceMind extends ExpertShell {
  constructor() { super(); this.name = "persistence-model"; }
  hold(intent) { copyIntent(intent, this.intent); }
}

/** A 32-bit mix of a seed and a stream index (`src/fork/mind.ts` keeps its own private). */
function mixSeed(seed, index) {
  let h = (seed ^ Math.imul(index + 1, 0x9e3779b9)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

const other = (side) => (side === "left" ? "right" : "left");

/**
 * A fork world kept for every candidate, restored anew each time and rebuilt when the topology it
 * holds is not the capture's. `host.build(physics)` builds a world with the same minds structure
 * as the live one, unrestored.
 */
export class ForkPool {
  constructor(host, config) {
    this.host = host;
    this.config = config;
    this.world = null;
    this.topology = null;
    this.rollout = new RolloutMind(SHADOWS);
    this.rolloutO = new RolloutMind(SHADOWS);
    this.persist = new PersistenceMind();
    this.slots = null;
    this.builds = 0;
    this.restores = 0;
  }

  async acquire(capture) {
    const key = JSON.stringify(capture.topology);
    const signature = this.host.signature?.() ?? "";
    if (this.world && (!this.config.reuse || this.topology !== key || this.signature !== signature || this.dirty())) {
      this.release();
    }
    if (!this.world) {
      this.world = this.host.build(await freshHavok(), new ExpertShell());
      this.signature = signature;
      this.builds += 1;
      const E = this.host.side, O = other(E);
      this.slots = { E: this.world[E].control.driver, O: this.world[O].control.driver };
      this.slots.minds = { E: this.slots.E.mind, O: this.slots.O.mind };
    } else {
      // The world graph walks each driver's mind: put the built ones back before it pairs.
      this.slots.E.mind = this.slots.minds.E;
      this.slots.O.mind = this.slots.minds.O;
    }
    restoreWorld(this.world.scene, this.world.forkWorld(), capture);
    this.topology = key;
    this.restores += 1;
    return this.world;
  }

  /** Whether the last rollout changed the fork's topology (a sever, a ruin, a grip). */
  dirty() {
    return JSON.stringify(this.world.forkWorld().topological.map((body) => body.captureTopology())) !== this.topology;
  }

  release() {
    this.world?.dispose();
    this.world = null;
    this.slots = null;
  }
}

/**
 * The objective over one rollout, from the fork's own records. Returns every term and the total,
 * so a decision can log what it chose on.
 */
export function scoreRollout(start, end, weights) {
  const damage = (start.vO - end.vO) - (start.vE - end.vE);
  const endTerm = end.winner === null || end.winner === undefined ? 0 : end.winner === end.E ? 1 : -1;
  const downOf = (support) => (support === "fallen" ? 1 : support === "rising" ? 0.5 : 0);
  const down = downOf(end.supportO) - downOf(end.supportE);
  const position = -end.outOfBand;
  const stall = -(end.stall - start.stall);
  const retreat = -(end.retreat - start.retreat);
  const terms = { damage, end: endTerm, down, position, stall, retreat };
  let total = 0;
  for (const [key, value] of Object.entries(terms)) total += weights[key] * value;
  return { total, ...terms };
}

/** How far a range fraction lies outside a band, in fractions (0 inside it; 1 with no striker). */
export function outOfBand(fraction, [low, high]) {
  if (!Number.isFinite(fraction)) return 1;
  return fraction < low ? low - fraction : fraction > high ? fraction - high : 0;
}

/** Every part's pose in a world, hashed from the bytes of its doubles: two equal hashes are one pose. */
export function poseHash(world) {
  const values = [];
  for (const body of [world.left, world.right]) {
    for (const limb of body.limbs) {
      const p = limb.part.mesh.position, q = limb.part.mesh.rotationQuaternion;
      values.push(p.x, p.y, p.z, q.x, q.y, q.z, q.w);
    }
  }
  return createHash("sha256").update(new Uint8Array(new Float64Array(values).buffer)).digest("hex").slice(0, 16);
}

/** The readings the objective takes at either end of a rollout. */
function reading(world, E, band) {
  const O = other(E);
  const engagement = world.forkWorld().roots.recorder.records[E].engagement;
  const view = world[E].view;
  let winner = null;
  if (!world.active) winner = world.result().winner;
  return {
    E, vE: world[E].vitality, vO: world[O].vitality, winner,
    supportE: view?.self?.support ?? "supported", supportO: world[O].view?.self?.support ?? "supported",
    outOfBand: view ? outOfBand(rangeFraction(view), band) : 0,
    stall: engagement.nearRangeStallSeconds, retreat: engagement.retreatOutsideReachSeconds,
  };
}

/**
 * The expert, installed on a body like any mind. `decide` plays the committed plan; the search runs
 * in `beforeFrame`, which the host loop awaits before each frame (a search forks Havok instances,
 * which is asynchronous, and a mind's `decide` runs inside the solver's step).
 */
export class ExpertMind {
  constructor(config, seed) {
    this.name = "expert";
    this.config = config;
    this.rng = mulberry32(seed);
    this.shadows = Object.fromEntries(SHADOWS.map((name, i) => [name, policyMind(name, mixSeed(seed, i))]));
    this.latest = {};
    this.program = null;
    this.out = freshGolemIntent();
    this.next = 0;
    this.pool = null;
    this.history = [];
    this.log = [];
    this.pending = null;
  }

  decide(view, dt) {
    for (const name of SHADOWS) this.latest[name] = this.shadows[name].decide(view, dt);
    const intent = this.program ? this.program.decide(view, dt, this.latest) : this.latest["golem-duelist"];
    return copyIntent(intent, this.out);
  }

  captureState() { return {}; }
  restoreState() { /* the expert's state is not world state; see ExpertShell */ }

  /** Search if a decision is due. `host` is what lets the expert capture and fork its world. */
  async beforeFrame(host) {
    if (this.prepare(host)) await this.search(host);
  }

  /**
   * Take the moment a due decision plans on, and say whether one is due. Two experts in one bout
   * both prepare before either searches, so each sees the other's plan as it stood at the moment and
   * neither sees the plan the other is about to choose (`runExpertBout`).
   */
  prepare(host) {
    const clock = host.live.clock;
    if (clock + 1e-9 < this.next) return false;
    this.next = clock + 1 / this.config.decisionHz;
    const started = performance.now();
    const O = other(host.side);
    const them = host.opponentExpert ?? null;
    this.pending = {
      clock,
      capture: captureBout(host.live, { heap: true }),
      snapshots: this.snapshots(),
      held: cloneIntent(host.live[O].control.driver.held ?? freshGolemIntent()),
      hold: cloneIntent(this.out),
      warm: this.program ? this.program.clone() : null,
      // An expert opponent: the plan it is playing and its shadows, to play it forward in a rollout.
      opponent: them ? { program: them.program ? them.program.clone() : new Program(FOLLOW_DUELIST), snapshots: them.snapshots() } : null,
      ms: performance.now() - started,
    };
    return true;
  }

  snapshots() {
    return Object.fromEntries(SHADOWS.map((name) => [name, snapshotMind(this.shadows[name])]));
  }

  async search(host) {
    const started = performance.now();
    const moment = this.pending;
    this.pending = null;
    const clock = moment.clock;
    const cost = { capture: moment.ms, restore: 0, simulate: 0 };
    const config = this.config;
    const E = host.side;
    this.pool ??= new ForkPool(host, config);
    // The moment the search plans on: now, or `stale` decisions ago (the blinded-fork mutation).
    this.history.push(moment);
    while (this.history.length > config.stale + 1) this.history.shift();
    const at = this.history[0];
    const reseed = Math.floor(this.rng() * 0x100000000) >>> 0;

    const evaluate = async (plan) => {
      let clock = performance.now();
      const world = await this.pool.acquire(at.capture);
      cost.restore += performance.now() - clock;
      clock = performance.now();
      const rollout = this.pool.rollout;
      rollout.load(plan.warm ? plan.warm.clone() : new Program(plan), at.snapshots);
      this.pool.slots.E.mind = rollout;
      if (config.opponent === "persistence") {
        this.pool.persist.hold(at.held);
        this.pool.slots.O.mind = this.pool.persist;
      } else if (at.opponent) {
        this.pool.rolloutO.load(at.opponent.program.clone(), at.opponent.snapshots);
        this.pool.slots.O.mind = this.pool.rolloutO;
      } else if (config.reseed) {
        let i = 0;
        for (const stream of randomStreams(this.pool.slots.O.mind)) { stream.reseed(mixSeed(reseed, i)); i += 1; }
      }
      const start = reading(world, E, config.band);
      const frames = Math.round(config.horizon / FRAME);
      for (let f = 0; f < frames && world.active; f += 1) {
        host.beforeStep?.(world);
        world.step();
      }
      const end = reading(world, E, config.band);
      cost.simulate += performance.now() - clock;
      if (config.trace) end.pose = poseHash(world);
      return { ...scoreRollout(start, end, config.weights), predicted: config.trace ? end : undefined };
    };

    const scored = [];
    const n2 = config.rounds > 1 ? Math.floor(config.candidates / 3) : 0;
    const n1 = Math.max(1, config.candidates - n2);
    const base = proposals(config, { hold: at.hold, warm: at.warm });
    const round1 = base.slice(0, n1);
    while (round1.length < n1) round1.push(randomPlan(this.rng, config, base.filter((p) => !p.warm)));
    for (const plan of round1) scored.push({ plan, score: await evaluate(plan) });
    if (n2 > 0) {
      const elite = [...scored].sort((a, b) => b.score.total - a.score.total).slice(0, Math.max(1, Math.min(4, Math.floor(n1 / 4))));
      for (let k = 0; k < n2; k += 1) {
        const parent = elite[k % elite.length].plan;
        const plan = jitterPlan(parent, this.rng, 0.5 * config.noise, config);
        scored.push({ plan, score: await evaluate(plan) });
      }
    }
    if (!config.reuse) this.pool.release();

    // Ties go to the earlier candidate, which puts the duelist's own continuation first.
    let best = scored[0];
    for (const entry of scored) if (entry.score.total > best.score.total) best = entry;
    this.program = best.plan.warm ? this.program : new Program(best.plan);
    const totals = scored.map((entry) => entry.score.total);
    const { predicted, ...terms } = best.score;
    this.log.push({
      t: clock, label: best.plan.label, n: scored.length,
      terms, ...(predicted ? { predicted } : {}),
      spread: Math.max(...totals) - Math.min(...totals),
      tied: totals.filter((total) => total === best.score.total).length,
      ms: performance.now() - started + moment.ms, cost,
    });
  }

  /** What a run keeps of the decisions: counts, cost, the chosen labels and the mean terms. */
  summary() {
    const n = this.log.length;
    const labels = {};
    const terms = {};
    for (const entry of this.log) {
      const label = entry.label.replace(/~+$/, "~");
      labels[label] = (labels[label] ?? 0) + 1;
      for (const [key, value] of Object.entries(entry.terms)) terms[key] = (terms[key] ?? 0) + value / n;
    }
    const ms = this.log.map((entry) => entry.ms).sort((a, b) => a - b);
    return {
      decisions: n,
      msMedian: n ? ms[Math.floor(n / 2)] : 0,
      msTotal: ms.reduce((s, x) => s + x, 0),
      msParts: Object.fromEntries(["capture", "restore", "simulate"].map((key) => [key, this.log.reduce((s, e) => s + e.cost[key], 0)])),
      rollouts: this.log.reduce((s, e) => s + e.n, 0),
      builds: this.pool?.builds ?? 0,
      labels, terms,
      tiedAll: this.log.filter((entry) => entry.tied === entry.n).length,
    };
  }

  dispose() { this.pool?.release(); this.pool = null; this.history = []; }
}

/** A rung or bout mind by name: the expert for `expert...`, otherwise null. */
export function expertMind(name, seed) {
  const config = expertConfig(name);
  return config ? new ExpertMind(config, seed) : null;
}

// ---------------------------------------------------------------------------------------------
// Hosts: how an expert forks the world it is playing in
// ---------------------------------------------------------------------------------------------

/**
 * A host for a bout built by `createBout(base)` with the expert on `side`. `base` names both
 * policies (the expert's side names the policy the bout's matchup records) and carries no mind
 * objects; the opponent is built by name in every fork and restored by the world walk. With an
 * expert in the other corner too (`opponentExpert`), both of a fork's slots hold shells, and the
 * search puts the opponent's current plan in its slot (`ExpertMind.search`).
 */
export function boutHost(live, base, side, opponentExpert = null) {
  const O = other(side);
  return {
    live, side, opponentExpert,
    build: (physics, shell) => createBout({ ...base, physics, [`${side}Mind`]: shell,
      ...(opponentExpert ? { [`${O}Mind`]: new ExpertShell() } : {}),
      onSample: null, onEvent: null, onRefusal: null, onVerdict: null }),
  };
}

/**
 * One bout with an expert in one corner or both, run to its end: `runBout`'s loop with each
 * expert's search awaited before each frame. `options` are `createBout`'s, with names for both
 * policies and a fresh Havok instance in `physics` (an exact fork needs the original built into
 * one); `experts` maps a side to its expert. With two, both take their moment before either
 * searches, so neither corner sees the plan the other is choosing on the same frame.
 * `onFrame(bout)` runs after each frame. Returns the result, both final bars and each expert's
 * summary by side.
 */
export async function runExpertBout(options, { experts, onFrame = null }) {
  const { leftMind, rightMind, ...base } = options;
  if (leftMind || rightMind) throw new Error("runExpertBout: name both policies; the experts are passed apart");
  const sides = Object.keys(experts);
  if (sides.length === 0 || sides.some((side) => side !== "left" && side !== "right")) throw new Error("runExpertBout: experts by side");
  const bout = createBout({ ...base, ...Object.fromEntries(sides.map((side) => [`${side}Mind`, experts[side]])) });
  const hosts = Object.fromEntries(sides.map((side) =>
    [side, boutHost(bout, { ...base, physics: undefined }, side, experts[other(side)] ?? null)]));
  try {
    for (;;) {
      if (!bout.active) break;
      const due = sides.filter((side) => experts[side].prepare(hosts[side]));
      for (const side of due) await experts[side].search(hosts[side]);
      if (!bout.step()) break;
      onFrame?.(bout);
    }
    const result = bout.finish();
    return { result, vitality: [bout.left.vitality, bout.right.vitality],
      experts: Object.fromEntries(sides.map((side) => [side, experts[side].summary()])) };
  } finally {
    for (const side of sides) experts[side].dispose();
    bout.dispose();
  }
}
