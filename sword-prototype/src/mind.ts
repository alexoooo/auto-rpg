import type { Vector3 } from "@babylonjs/core/Maths/math.vector.js";

// Explicit `.ts` extensions, for the reason `fighter.ts` gives at length: Node
// runs a TypeScript file by stripping its types, and Node's ESM resolver insists
// on the extension where Vite does not care. The two `import type` lines erase
// to nothing, which is what keeps `input.ts` -- and through it the DOM -- out of
// the graph a headless harness loads; the two below them are real, and
// everything they reach is `config.ts`, which reaches nothing.
import type { InputState } from "./input.ts";
// The dependency on `policies.ts` runs one way only: `policies.ts` takes
// `Intent`, `Mind` and `FighterView` from here and all three of them are types,
// so they erase and there is no module cycle at run time. That is worth the
// small cost it imposes over there -- `policies.ts` writes its own blank intent
// rather than spreading `NEUTRAL` -- because a cycle that happens to work
// because nobody reads the constant during evaluation is a thing that stops
// working when somebody moves a line, and it stops working in the browser rather
// than in a test.
//
// The two cursor inverses come from `policies.ts` rather than being written
// again here, because there are already three copies of that one mapping in the
// tree -- `fighter.ts`'s `spread`, and the two directions in `policies.ts` -- and
// a fourth would be the one that drifts. See `cursorForPose` below for what
// depends on them agreeing.
import {
  cursorForAzimuth,
  cursorForElevation,
  duelistMind,
  swingerMind,
} from "./policies.ts";
import { CONFIG } from "./config.ts";

/**
 * What a fighter can ask for.
 *
 * Identical in shape to `InputState`, and identically so on purpose rather than
 * by coincidence: **a policy plays with the controller you play with**. It gets
 * a cursor position, a reach, a thrust, a guard and movement axes, and nothing
 * else. It cannot set a joint angle, place the blade, or ask for a pose the
 * solver would refuse a person.
 *
 * That is a constraint and not a limitation, and it is worth being explicit
 * about the difference. An AI that could pose the arm directly would be a
 * different game's AI, and beating it would prove nothing about whether *this*
 * arm is worth fighting with. It also makes taking over a body nearly free: it
 * is a swap of which `Mind` a fighter reads from, and the physics never notices
 * that anything happened.
 *
 * It is an alias rather than a separate interface because the two must not be
 * allowed to drift. The day `InputState` grows a field, every policy gets it and
 * every policy that ignores it still compiles -- whereas two structurally
 * identical declarations would part company the first time only one of them was
 * edited, and the compiler would say nothing.
 */
export type Intent = InputState;

/** Which of a fighter's two hands. */
export type HandName = "primary" | "secondary";

/**
 * What one hand is being asked for.
 *
 * These five used to sit at the top of `InputState`, because there used to be
 * one arm. Splitting them out rather than adding a second set of differently
 * named fields is what keeps the two hands genuinely alike: there is no
 * `pointerX` and `offPointerX`, no hand that is the real one and a hand that is
 * the afterthought, and `Arm` takes one of these without caring which it is.
 */
export interface HandIntent {
  /** Cursor position across the window, -1 (left) to +1 (right). */
  pointerX: number;
  /** Cursor position up the window, -1 (bottom) to +1 (top). */
  pointerY: number;
  /**
   * Wrist roll in radians. Absolute, not a per-frame delta, because the control
   * loop runs several times per rendered frame and would otherwise apply the
   * same increment more than once.
   */
  roll: number;
  thrust: boolean;
  guard: boolean;
}

/**
 * Both of them, for the loops that must not favour the one being driven.
 *
 * Declared here rather than in `input.ts` with `InputState`, and that is not
 * arbitrary. `mind.ts` takes `InputState` as a **type**, which erases, so the
 * DOM never reaches a headless harness. Putting this constant on the far side
 * and importing its *value* back reverses that in one line: five test files and
 * the whole bench failed at once with "Cannot find module .../src/config",
 * because `input.ts` is on the side that does not carry `.ts` extensions.
 */
export const HANDS: readonly HandName[] = ["primary", "secondary"];

/** The other one. */
export const otherHand = (hand: HandName): HandName =>
  hand === "primary" ? "secondary" : "primary";

/**
 *
 * `input.ts` is the browser's, and a *value* import of it anywhere in a
 * fighter's graph would take `fighter.ts` out of Node's reach and the headless
 * bench and four test files with it. `HANDS` is the one value that crosses, and
 * it crosses because it is a frozen pair of strings with no DOM anywhere near
 * it -- the alternative was a second copy of `["primary", "secondary"]`, which
 * is exactly the kind of duplication that goes wrong the day a third hand is
 * imagined.
 */

/** One pose per hand, which is what a takeover has to seed from. */
export type ArmPoses = Record<HandName, ArmPose>;

/**
 * How much of each part of a body is left, keyed by `Limb.key`: 1 whole, 0 gone.
 *
 * A fraction rather than a health value, because the numbers a mind compares are
 * only meaningful against a maximum, and a policy that had to know a torso's
 * `maxHealth` to read its torso would be reading `config.ts` through a body.
 * Severed reads as exactly 0, so "is this arm still on it" and "is this arm
 * finished" are one question with one answer.
 *
 * Written into in place by `Fighter.observe`, so a mind must read it during
 * `decide` and not keep it.
 */
export type PartHealth = Record<string, number>;

/** One body as a mind sees it: where it is, where its blade is, what is left of it. */
export interface BodyView {
  /** Position on the floor. */
  ground: Vector3;
  /** Heading in radians, zero down +Z turning toward +X, as everywhere here. */
  facing: number;
  shoulder: Vector3;
  /** The point of the blade, in world space. */
  tip: Vector3;
  /** Speed of that point, m/s. The damage model is built from this number. */
  tipSpeed: number;
  health: PartHealth;
}

/** The same, plus the one thing a body knows about itself that it cannot see. */
export interface SelfView extends BodyView {
  /** How far the hand is currently being held from the shoulder, metres. */
  reach: number;
}

/**
 * What a fighter can see. Published from the world, never from another mind.
 *
 * Positions and speeds only. No access to the other mind, no access to the
 * solver, and no access to what the opponent is *about* to do: a policy that
 * wants to know whether it is being attacked has to read a blade, the same way a
 * person does.
 *
 * There is deliberately no `reach` on the opponent. Both fighters are the same
 * unit today, so a policy's own reach answers for both, and inventing a field
 * that is guaranteed to equal one already present is how a view starts being
 * believed instead of read. The day session 08 gives the two sides different
 * bodies, this is the field to add, and adding it is one line here and one in
 * `Fighter.observe`.
 *
 * **The whole object is republished in place on every control step**, one per
 * fighter, because `decide` runs 240 times a second per side and a freshly
 * allocated view per call would be the largest single source of garbage in the
 * prototype. A mind may read anything here during `decide` and must keep none of
 * it: the vectors it holds are the fighter's own and will have moved by the next
 * call.
 */
export interface FighterView {
  self: SelfView;
  opponent: BodyView;
  /**
   * Distance from this fighter's own shoulder to the nearest part of the
   * opponent, metres.
   *
   * Measured to part *centres* rather than to capsule surfaces, because the
   * nearest point on a capsule is a solve and a centre is a subtraction. The
   * difference is one radius, and a policy that compares this against a reach
   * it also measured this way never sees it.
   */
  measure: number;
  /**
   * Simulation seconds since the bout was built.
   *
   * The same clock `HitReport.at` is stamped with, so a mind can age a blow
   * against it without having to be told how the two relate.
   */
  clock: number;
}

/**
 * Whoever is driving one fighter.
 *
 * The human is a `Mind` too -- one that hands back `controls.state` -- and that
 * is the whole design. There is no branch anywhere in `Fighter` for "is this one
 * the player", no authority to transfer and no mode to be in, because both sides
 * were always producing the same `Intent`.
 *
 * `decide` is handed the control step's `dt` rather than being expected to find
 * a clock, so a policy with a cadence integrates the same number the solver
 * does. It is called once per physics substep, which is 240 times a second, so a
 * policy that allocates per call allocates a great deal; returning a mutable
 * object the policy owns is the right shape, and `Fighter.update` reads the
 * fields immediately and keeps no reference to it.
 */
export interface Mind {
  readonly name: string;
  decide(view: FighterView, dt: number): Intent;
}

/**
 * What a fighter asks for when nobody is asking it for anything.
 *
 * Frozen, and shared by every idle mind, because it is a constant that happens
 * to be shaped like a command rather than a state anyone owns. This was a module
 * constant in `main.ts` until the seam landed, and being a constant with nothing
 * to write through it was not merely untidy: it blocked a measurement. Session
 * 04 wanted the standard cursor sweep run on the *right* fighter's arm, which
 * sits fifteen bodies further down Havok's list than the left one's, and there
 * was no way to feed it an intent -- an observer that swept it drove it a second
 * time per step and inflated its tip speed from 10.67 m/s to 13.41. Assigning
 * `__sword.right.mind` is now the whole of that measurement's setup.
 */
export const NEUTRAL: Intent = Object.freeze({
  forward: 0,
  strafe: 0,
  turn: 0,
  zoom: 1,
  driving: "primary",
  // Frozen too, and separately. `Object.freeze` is shallow, so freezing only the
  // outer object would leave both hands writable through a reference anybody
  // holds -- and the whole point of freezing this is that a policy handed the
  // neutral intent cannot quietly turn it into its own.
  primary: Object.freeze({ pointerX: 0, pointerY: 0, roll: 0, thrust: false, guard: false }),
  secondary: Object.freeze({ pointerX: 0, pointerY: 0, roll: 0, thrust: false, guard: false }),
});

/**
 * Stands there, cursor centred.
 *
 * The control condition, and the thing every claim session 06 makes is measured
 * against. It also has a job beyond measurement: it is what you pick when you
 * want to practise cutting a body that moves the way a body does, which is what
 * the training dummy used to be for and is the only thing lost when the dummy
 * became a fighter.
 *
 * **Not "arms down", which is what session 06's plan asks for and what this
 * comment used to claim.** A centred cursor is `pointerY = 0`, and `aimArm`
 * maps that to an elevation of zero -- so idle holds its blade out level and
 * pointed at whatever it is facing, not by its side. Measured over 100 bouts
 * against `swinger`, that costs nothing: idle takes 17 381 contacts and scores
 * exactly zero damage, because every one of them is below `combat.minCutSpeed`.
 * It is still not what somebody reading "stands there, arms down" would expect
 * to see in the page, and whether a lowered guard is what was meant is a
 * decision somebody should take at a browser rather than a line to quietly
 * change here -- moving it changes what every future policy is measured against.
 *
 * A factory rather than a singleton, because the policies session 06 adds carry
 * timer state and two fighters running one instance of one of those would share
 * a cadence. Idle has no state and would not care; being the odd one out is
 * worse than the allocation.
 */
export function idleMind(): Mind {
  return { name: "idle", decide: () => NEUTRAL };
}

/**
 * A person, as a mind.
 *
 * Structurally typed on purpose -- it asks for anything carrying a live
 * `Intent`, which `Controls` is -- so that this module imports nothing from
 * `input.ts` at run time and stays loadable by Node. `Controls.state` is
 * mutated in place by the pointer and key listeners and read immediately by the
 * fighter, which is exactly the contract `Mind` already describes for a policy
 * that owns its intent.
 */
export function humanMind(source: { readonly state: Intent }, name = "you"): Mind {
  return { name, decide: () => source.state };
}

/**
 * One mouse, two hands.
 *
 * A person has one cursor and a fighter has two arms, so exactly one of them can
 * be the person's at a time and the other has to be driven by something. This is
 * that something: it runs both minds every step, takes the feet and the driven
 * hand from the person, and takes the other hand from the policy.
 *
 * Splitting the *cursor* instead -- half the screen each, or a modifier held
 * down -- was the obvious alternative and is worse. The mouse being spent
 * entirely on one blade is the whole reason this reads as Die by the Sword
 * rather than as a third-person action game, and halving it would make both
 * hands worse to control in order to avoid making a choice. `F` makes the
 * choice, and it can be made mid-swing.
 *
 * The policy is driven every step whichever hand it is on, and at its own `dt`,
 * for the same reason `handover` drives its inner mind through the rebase
 * window: a policy whose cadence stopped while somebody else was using its arm
 * would be a different policy. It writes into its own hand slot -- policies say
 * which hand they mean through `driving` -- and this reads that slot rather
 * than assuming a side, so a policy needs to know nothing about any of this.
 *
 * House rule 1 survives intact: what reaches the fighter is still one `Intent`,
 * still the same nine-field shape a person produces, and there is still nothing
 * anywhere that asks which of the two hands is the real one.
 */
export function splitMind(person: Mind, policy: Mind): Mind {
  const blended: Intent = {
    ...NEUTRAL,
    primary: { ...NEUTRAL.primary },
    secondary: { ...NEUTRAL.secondary },
  };

  return {
    name: person.name,
    decide(view: FighterView, dt: number): Intent {
      const mine = person.decide(view, dt);
      const theirs = policy.decide(view, dt);

      blended.forward = mine.forward;
      blended.strafe = mine.strafe;
      blended.turn = mine.turn;
      blended.zoom = mine.zoom;
      blended.driving = mine.driving;

      const spare = otherHand(mine.driving);
      copyHand(blended[mine.driving], mine[mine.driving]);
      copyHand(blended[spare], theirs[theirs.driving]);
      return blended;
    },
  };
}

/** Five fields, by hand, because a reference would alias two live objects. */
function copyHand(into: HandIntent, from: HandIntent): void {
  into.pointerX = from.pointerX;
  into.pointerY = from.pointerY;
  into.roll = from.roll;
  into.thrust = from.thrust;
  into.guard = from.guard;
}


/**
 * The pose an arm is actually in, exactly as `Fighter.armAngles()` answers it.
 *
 * Declared here rather than imported from `fighter.ts` for the reason every
 * other shape in this file is: `fighter.ts` imports Babylon, and the whole value
 * of this module is that it does not. `Fighter.armAngles()`'s return type
 * satisfies this structurally, so what is handed in is the arm's own reading and
 * not a translation of it.
 */
export interface ArmPose {
  /** Torso-space bearing of the hand from the shoulder, radians. */
  azimuth: number;
  /** Torso-space elevation of the same, radians. */
  elevation: number;
  /** Wrist roll, radians, already inside `arm.rollMin`/`rollMax`. */
  roll: number;
  /** Shoulder to hand centre, metres. */
  reach: number;
}

/**
 * Where the cursor has to sit for the arm to be commanded into the pose it is
 * already in.
 *
 * This is the whole of what stops a blade teleporting when a body changes hands.
 * `Fighter.aimArm` maps the *absolute* cursor position onto an azimuth and an
 * elevation -- which is the property that gives the arm a home you can find
 * again, and is therefore not negotiable -- so the instant a new driver takes a
 * body, the arm is commanded to wherever that driver's cursor happens to be
 * sitting, at the measured 850 N linear ceiling, with a sword on the end. At a
 * full-envelope jump that is roughly 0.7 m of hand travel asked for in one
 * substep.
 *
 * The fix is continuity rather than a clamp. Invert the mapping, and the cursor
 * does not move at all: what moves is its meaning, so that where it sits now is
 * where the arm already is, and the first command after a handover is exactly
 * the command the previous driver had left standing.
 *
 * `reach` is deliberately *not* inverted, and that is not an omission. Reach is
 * not a cursor axis: `aimArm` takes it from the thrust and guard buttons and
 * then filters it toward the wanted value at `arm.reachResponse`, which is 9 per
 * second -- so it is already continuous across a handover by construction, and
 * carries whatever the arm had rather than snapping. A driver who takes a body
 * with the guard button held simply starts pulling the hand in from where it
 * was, at the same rate a guard always pulls it in. There is no cursor position
 * that could express a reach anyway, which is the deeper reason: the controller
 * has two aiming axes and reach is not one of them.
 */
export function cursorForPose(pose: ArmPose): { pointerX: number; pointerY: number; roll: number } {
  return {
    pointerX: cursorForAzimuth(pose.azimuth),
    pointerY: cursorForElevation(pose.elevation),
    roll: pose.roll,
  };
}

/**
 * Where a pose puts the hand, relative to the shoulder, in the torso's own frame.
 *
 * The same three lines `Fighter.aimArm` builds its `dirLocal` from, scaled by the
 * reach -- which makes this the *commanded* hand position and not a reading of
 * where the hand got to. That distinction is the whole reason the takeover
 * measurement is taken from here rather than from the blade: a blade mid-swing
 * moves 42 mm in a single 240 Hz substep entirely legitimately, so a tip
 * displacement measured across a handover cannot tell a teleport from a swing.
 * The commanded point can: it moves at most a couple of millimetres a substep
 * even during the fastest stroke either policy has, so anything above that is
 * the handover and nothing else.
 *
 * Torso-local on purpose. A fighter that is walking is being translated and
 * turned by its own locomotion during the same step, and a world-space
 * difference would fold that in.
 */
export function handOffset(pose: ArmPose): { x: number; y: number; z: number } {
  const cosEl = Math.cos(pose.elevation);
  return {
    x: Math.sin(pose.azimuth) * cosEl * pose.reach,
    y: Math.sin(pose.elevation) * pose.reach,
    z: Math.cos(pose.azimuth) * cosEl * pose.reach,
  };
}

/**
 * How far the hand is being asked to jump between two poses, in millimetres.
 *
 * Millimetres because that is the unit every acceptance and every rig readout in
 * this directory is already written in, and because a handover worth
 * complaining about is hundreds of them while a good one is single figures.
 */
export function poseShiftMm(before: ArmPose, after: ArmPose): number {
  const a = handOffset(before);
  const b = handOffset(after);
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) * 1000;
}

/**
 * A mind that has just been handed a body, and knows what pose it found it in.
 *
 * `settled` is false for as long as the rebase window is open, and true once
 * this is passing the inner mind's intent through untouched.
 */
export interface Handover extends Mind {
  readonly settled: boolean;
}

/**
 * Hand a body to a new mind without the blade noticing.
 *
 * Two things are going on and it is worth separating them, because the plan for
 * this session asks for one of them and one alone is not enough.
 *
 * The first is the seed: `cursorForPose` says where the cursor would have to be
 * for the arm to be commanded into the pose it is already in, and writing that
 * into whoever is taking over makes the very first command after a handover
 * identical to the last command before it. That is exact, it needs no
 * interpolation, and it is what the takeover-frame acceptance measures.
 *
 * The second is that the seed does not survive contact with either kind of
 * driver, which is the correction this session owes the plan. For a person,
 * `Controls.onPointerMove` writes the *absolute* cursor position back into the
 * intent on the very next mouse event -- so seeding the state alone moves the
 * teleport twenty milliseconds later, to a moment nobody is measuring, and the
 * blade still jumps. For a policy it is worse: a freshly built `swinger` parks
 * its cursor at centre guard on its first `decide` and a `duelist` puts it on
 * the covering line, neither of which has any relation to the pose it is being
 * handed, so a body released mid-swing snaps as hard as one taken mid-swing.
 *
 * So the seed is where this *starts* and the rebase is how it *ends*: for
 * `seconds` the commanded cursor walks linearly from the found pose to whatever
 * the new mind is asking for, and after that this object is transparent. The
 * blend is on the two aiming axes and the wrist roll only; the feet, the
 * buttons and the zoom are the new driver's from the first step, because none of
 * them can teleport anything -- reach is filtered at `arm.reachResponse` and the
 * locomotion at `fighter.accelResponse`.
 *
 * Linear rather than exponential, and that is deliberate: an exponential
 * approach never actually arrives, so the wrapper would never become
 * transparent and every fighter in a long bout would end up reading the world
 * through however many handovers it had lived through. This one has an end.
 *
 * The inner mind is driven every step from the first, at its own `dt`, so a
 * policy's cadence runs normally through the window and what is blended is only
 * what it asks the hand for. A policy that was told the fight had paused for a
 * quarter of a second would be a different policy.
 */
export function handover(
  inner: Mind,
  poses: ArmPoses,
  seconds = CONFIG.takeover.rebaseSeconds,
): Handover {
  const seed = { primary: cursorForPose(poses.primary), secondary: cursorForPose(poses.secondary) };
  // Mutable, allocated once, and never handed out except during the window --
  // the same contract `NEUTRAL` documents and every policy already keeps.
  //
  // The two hands are rebuilt rather than spread: `{ ...NEUTRAL }` copies the
  // *references* to NEUTRAL's two frozen hand objects, so the first write to
  // `blended.primary.pointerX` would throw in a module (which is strict) or, far
  // worse, silently do nothing if this ever ran unstrict.
  const blended: Intent = {
    ...NEUTRAL,
    primary: { ...NEUTRAL.primary },
    secondary: { ...NEUTRAL.secondary },
  };
  let elapsed = 0;
  let done = seconds <= 0;

  return {
    // The inner mind's own name, so a readout says `swinger` rather than naming
    // a wrapper nobody chose. What a handover is doing is visible through
    // `settled` and through `__sword.takeover`, which is where somebody looking
    // for it would look.
    name: inner.name,
    get settled(): boolean {
      return done;
    },
    decide(view: FighterView, dt: number): Intent {
      const asked = inner.decide(view, dt);
      if (done) return asked;

      // The fraction is taken *before* the step is counted, so the first call
      // after a handover blends at exactly zero and commands exactly the pose
      // that was found. Counting first would put the first command 1/60th of the
      // way across the envelope -- about 12 mm of hand at a full-width rebase,
      // which is most of the 20 mm the acceptance allows, spent on nothing.
      const t = elapsed / seconds;
      elapsed += dt;
      if (elapsed >= seconds) done = true;

      blended.forward = asked.forward;
      blended.strafe = asked.strafe;
      blended.turn = asked.turn;
      blended.zoom = asked.zoom;
      blended.driving = asked.driving;
      // Both hands, and by the same clock. A takeover that rebased one hand and
      // snapped the other would be exactly half a fix: the cursor is absolute,
      // so whichever hand it is not currently driving is still being commanded
      // from a pose the incoming mind knows nothing about.
      for (const name of HANDS) {
        const to = blended[name];
        const from = seed[name];
        const want = asked[name];
        to.thrust = want.thrust;
        to.guard = want.guard;
        to.pointerX = from.pointerX + (want.pointerX - from.pointerX) * t;
        to.pointerY = from.pointerY + (want.pointerY - from.pointerY) * t;
        to.roll = from.roll + (want.roll - from.roll) * t;
      }
      return blended;
    },
  };
}

/**
 * One entry in the policy picker.
 *
 * The list is the registry the setup screen builds its `select` from, so a
 * policy that exists is selectable and a policy that is selectable exists. That
 * is the only defence against the failure this sort of picker always has, which
 * is an option that names something the code no longer has.
 */
export interface Policy {
  /** What a `Matchup` stores, and what appears in a URL or a console command. */
  readonly name: string;
  /** What the picker shows. */
  readonly label: string;
  /**
   * Build one.
   *
   * The seed is optional and the picker never passes one, so a policy chosen
   * from the screen draws its own and two fighters on the same policy do not
   * fight in lockstep. What passes one is `scripts/measure.mjs`, because "a
   * hundred bouts" has to mean a hundred *different* bouts and the only honest
   * place for that variety is the policies' own cadence -- nudging the physics
   * to make a distribution measures a slightly different simulator every time,
   * and then the distribution is of the harness rather than of the policy.
   * `idle` ignores it, having nothing to vary.
   */
  create(seed?: number): Mind;
}

export const POLICIES: readonly Policy[] = [
  { name: "idle", label: "Idle", create: idleMind },
  { name: "swinger", label: "Swinger", create: swingerMind },
  { name: "duelist", label: "Duelist", create: duelistMind },
];

/**
 * The mind a policy name asks for.
 *
 * Refuses by name rather than falling back to idle. A picker that quietly
 * substitutes something else for an option it does not recognise is how a
 * measurement of `duelist` ends up being a measurement of `idle`, and the
 * distribution it produces looks perfectly reasonable.
 */
export function policyMind(name: string, seed?: number): Mind {
  const found = POLICIES.find((policy) => policy.name === name);
  if (!found) {
    const known = POLICIES.map((policy) => policy.name).join(", ");
    throw new Error(`unknown policy "${name}" -- the picker offers ${known}`);
  }
  return found.create(seed);
}
