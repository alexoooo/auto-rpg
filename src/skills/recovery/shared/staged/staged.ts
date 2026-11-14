import { Quaternion, Vector3 } from "../../../../core/math/vector.ts";

import type { BodyView } from "../../../../control/body.ts";
import { bearLimbs, carryRoot, limbMotion, makeBearing } from "../../../../control/bearing.ts";
import { patchSupport } from "./patch-support.ts";
import { uprightness } from "../../../../control/ground.ts";
import { lieOf, type Lie } from "../../../../control/ground-reading.ts";
import { servoAsk, servoSolve } from "../../../../control/servo.ts";
import { DOWN, footStatesOf, readSupport, withinSupport, type FootState } from "../../../../control/support.ts";
import type { MuscleReading } from "../../../../core/bodies/muscle/driver.ts";
import type { BodyControl } from "../../../../core/bodies/body-control.ts";
import { bellyOf, type BodySpec } from "../../../../core/bodies/spec/body.ts";
import { turnOfToRef } from "../../../../core/bodies/read-motion.ts";
import { atan2 } from "../../../../core/math/real.ts";
import { spinBetweenToRef, turnAboutToRef } from "../../../../core/math/turn.ts";
import type { OwnBody } from "../../../../core/bodies/own-body.ts";
import type { Senses } from "../../../../core/bodies/senses.ts";
import { riseLimbs } from "./limbs.ts";
import { RISE, stageFaults, stagesOf, type BearStage, type PoseStage, type Recipe, type Stage, type Until } from "./stages.ts";
import type { ReadSegment } from "../../../../core/bodies/read-body.ts";
import { rollCoast } from "./roll-coast.ts";
import { SIDES } from "../../../../core/bodies/bilateral.ts";

/**
 * The pose drive: a freedom is asked the speed that would close its error in `POSE_SECONDS`, no
 * faster than `POSE_SPEED`, rad/s, at full activation. Speeds, not the joint servo, which takes
 * the root as held and knows no contact, as a body pressing off the ground is not.
 */
const POSE_SECONDS = 0.2, POSE_SPEED = 3;
/**
 * Lying still: the centre of mass under `SLOW`, m/s, for `STILL_SECONDS`. The centre of mass, not
 * the segments, since a limp hand can turn for as long as it is watched.
 */
const SLOW = 0.1, STILL_SECONDS = 0.5;
/**
 * How near its aim the centre of mass is, m, for a bearing stage to be done, once it is slower
 * than `SLOW`.
 */
const NEAR = 0.05;
/**
 * How near its aim the pelvis's turn is, rad, for a bearing stage to be done.
 */
const TURNED = 0.15;
/**
 * A limb a stage leaves, while it still bears: its part of the load against the limbs the stage
 * bears on, whose shares sum to 1. Small, so it bears what they cannot, and is let go once the
 * centre of mass is within their outline (`withinSupport`); a larger share holds it down.
 */
const LEFT = 0.01;
/**
 * How far over the ground, m, every segment of the trunk (`Recipe.trunk`) is, in or after the
 * rise's first bearing stage, for the rise to have raised it: from then, one of them down again
 * (within `DOWN`) ends the attempt.
 */
const RAISED = 0.1;
/** A contact whose normal is within this cosine of straight down is with the ground under the body, not a wall. */
const GROUND_UP = 0.7;

/** What a rise reads of its recipe for a body of a spec: tables of data, read and never written (`riseTables`). */
interface RiseTables {
  /** A stage's goal by channel, from the reference pose, as the muscles read their angles. */
  readonly goalsOf: ReadonlyMap<Stage, Float64Array>;
  /**
   * For a bearing stage, by the recipe's limb: whether it bears, and its share; and whether the
   * stage leaves it. `keeps`: it leaves none.
   */
  readonly bearsOf: ReadonlyMap<BearStage, { readonly on: readonly boolean[]; readonly share: readonly number[]; readonly leaves: readonly boolean[]; readonly toes: readonly boolean[]; readonly keeps: boolean }>;
  /** Each foot's ball: the middle of its sole's front edge with its toes bent (`FootState.fits`), in the foot's own frame. */
  readonly balls: readonly Vector3[];
  /** For a pose stage ended by its channels' angles, each one's index and angle as the muscles read it. */
  readonly pastOf: ReadonlyMap<PoseStage, readonly { readonly index: number; readonly angle: number }[]>;
  /** For a pose stage that presses, by foot, each channel it presses and how hard, rad a metre. */
  readonly pressOf: ReadonlyMap<PoseStage, readonly (readonly { readonly index: number; readonly gain: number }[])[]>;
  /** For a pose stage that levels, the left side's channels then the right's, and how hard each, rad. */
  readonly levelOf: ReadonlyMap<PoseStage, readonly (readonly { readonly index: number; readonly gain: number }[])[]>;
  readonly followOf: ReadonlyMap<PoseStage, { readonly channels: readonly number[]; readonly leads: readonly { readonly index: number; readonly angle: number }[] }>;
}

/** Each recipe's tables for each spec (`riseTables`): recipes and specs are data, so every body of a spec shares them. */
const TABLES = new WeakMap<Recipe, WeakMap<BodySpec, RiseTables>>();

/** `recipe`'s tables for a body of `spec`, whose muscles' `channels` and `feet` they are read by: made once for each recipe and spec. */
function riseTables(recipe: Recipe, spec: BodySpec, channels: MuscleReading["channels"], feet: readonly FootState[]): RiseTables {
  let bySpec = TABLES.get(recipe);
  if (!bySpec) TABLES.set(recipe, bySpec = new WeakMap());
  let tables = bySpec.get(spec);
  if (!tables) bySpec.set(spec, tables = readTables(recipe, spec, channels, feet));
  return tables;
}

function readTables(recipe: Recipe, spec: BodySpec, channels: MuscleReading["channels"], feet: readonly FootState[]): RiseTables {
  const ends = spec.ends ?? [];
  const goalsOf = new Map<Stage, Float64Array>();
  const bearsOf = new Map<BearStage, { readonly on: readonly boolean[]; readonly share: readonly number[]; readonly leaves: readonly boolean[]; readonly toes: readonly boolean[]; readonly keeps: boolean }>();
  const balls = feet.map((foot) => { const { sole, ahead } = foot.fits.bent; return sole[ahead[0]!]!.add(sole[ahead[1]!]!).scaleInPlace(0.5); });
  /** A channel's index by name. */
  const channelOf = (name: string): number => channels.findIndex((channel) => channel.name === name);
  const pastOf = new Map<PoseStage, readonly { readonly index: number; readonly angle: number }[]>();
  const pressOf = new Map<PoseStage, readonly (readonly { readonly index: number; readonly gain: number }[])[]>();
  const levelOf = new Map<PoseStage, readonly (readonly { readonly index: number; readonly gain: number }[])[]>();
  const followOf = new Map<PoseStage, { readonly channels: readonly number[]; readonly leads: readonly { readonly index: number; readonly angle: number }[] }>();
  for (const stage of stagesOf(recipe)) {
    if (stage.kind === "pose" && stage.follow) followOf.set(stage, {
      channels: stage.follow.channels.map(channelOf),
      leads: Object.entries(stage.follow.past).map(([name, angle]) => { const index = channelOf(name); return { index, angle: angle - channels[index]!.dof.spec.bind.value }; }),
    });
    if (stage.kind === "pose" && stage.until?.past) {
      pastOf.set(stage, Object.entries(stage.until.past).map(([name, angle]) => { const index = channelOf(name); return { index, angle: angle - channels[index]!.dof.spec.bind.value }; }));
    }
    if (stage.kind === "pose" && stage.press) {
      const gains = stage.press.gains;
      pressOf.set(stage, feet.map((foot) => Object.entries(gains).map(([name, gain]) => ({ index: channelOf(name.replace("@", foot.side)), gain }))));
    }
    if (stage.kind === "pose" && stage.level) {
      const gains = stage.level.gains;
      levelOf.set(stage, SIDES.map((side) => Object.entries(gains).map(([name, gain]) => ({ index: channelOf(name.replace("@", side)), gain }))));
    }
    const posture = stage.posture;
    goalsOf.set(stage, Float64Array.from(channels, (channel) => (posture === "reference" ? 0 : (posture[channel.name] ?? 0) - channel.dof.spec.bind.value)));
    if (stage.kind !== "bear") continue;
    const shares = ends.map((limb) => stage.on.find((on) => on.limb === limb.name)), leaves = ends.map((limb) => stage.leave.includes(limb.name));
    bearsOf.set(stage, { on: shares.map((share) => share !== undefined), share: shares.map((share) => share?.share ?? 0), leaves,
      toes: ends.map((limb) => stage.toes?.includes(limb.name) ?? false), keeps: stage.leave.length === 0 });
  }
  return Object.freeze({ goalsOf, bearsOf, balls: Object.freeze(balls), pastOf, pressOf, levelOf, followOf });
}

/**
 * **Rising by stages.** It wants the body from the step it is down until it stands or is taken
 * from it. It lies slack until it is still; reads how it lies; if not on its front, plays that
 * lie's roll and lies slack again; on its front, plays the rise to its last stage. Its host's
 * stance has the body from there if it is up, or stands on its feet alone (`onFeet`). A rise that
 * ends with the body still down, a bearing stage that runs out of time, or the trunk down again
 * once the rise had raised it (`RAISED`), is followed by another attempt, from the body as it
 * is, as often as it takes.
 *
 * A pose stage drives every freedom toward its posture for its time, at its drive or the pose
 * drive (`POSE_SECONDS`, `POSE_SPEED`). A bearing stage is a step of
 * motor control's shape on the body's bearing ends (`riseLimbs`): the centre of mass asked toward the
 * place over the limbs it bears on, the pelvis toward its pitch, the bearing solve
 * (`src/control/bearing.ts`) for the root's acceleration and those limbs' torques, and the
 * servo for the rest of the body toward the stage's posture. A limb bears once it is down, where
 * it is, and until then is brought straight down onto the ground. The place is the middle of where
 * the body is held over the limbs that bear (`RiseLimbs.over`), weighed by their shares, and the
 * same shares weigh how the ground's wrench is split among them, so the load each is asked is
 * the one that holds the body there, as far as the muscles that carry it can give it
 * (`makeBearing`'s `effort`). A limb the stage leaves bears too, a small part (`LEFT`),
 * until the centre of mass is over the others. The stage is done when every limb it bears on is
 * down, those it leaves are let go, the centre of mass is at the place and slow, and the pelvis
 * is at its pitch. What its patches cannot give it asks of its assist, within the body's ceiling.
 *
 * `view` is its host's, read this step before it is asked (`hosting`): whether the body is down
 * and how its centre of mass moves are the host's readings, so a body its host holds low on
 * purpose is not taken from it. What only a rise needs it reads itself: how it lies, the ground's
 * level, and where its limbs are.
 */
export function stagedRise(own: OwnBody, view: BodyView, recipe: Recipe = RISE): {
  readonly state: { readonly phase: "idle" | "settle" | "roll" | "rise"; readonly tries: number; readonly lie: Lie; readonly stage: number; readonly time: number };
  wants(): boolean;
  begin(): void;
  end(): void;
  step(senses: Senses, control: BodyControl, dt: number): void;
  /** How many stages `phase` plays, as the body lies now. */
  stages(phase: "roll" | "rise"): number;
  /** Join the rise at its first bearing stage, its supports bearing and the trunk clear; false, nothing begun, where they are not. */
  beginSupported(): boolean;
  /** Join the rise at its first stage now, the body as it is. */
  beginRising(): void;
  /** Play the roll of the lie the body is in now, the body as it is, then lie slack and read again; on its front, the rise. */
  beginRolling(): void;
} {
  const faults = stageFaults(recipe, own.spec);
  if (faults.length > 0) throw new Error(`${own.spec.model} cannot play this rise: ${faults.join("; ")}`);
  const speed = recipe.progress?.speed ?? SLOW, near = recipe.progress?.near ?? NEAR, turnTolerance = recipe.progress?.turn ?? TURNED;
  const settleSpeed = recipe.progress?.settleSpeed ?? SLOW, settleSeconds = recipe.progress?.settleSeconds ?? STILL_SECONDS;
  const restSeconds = recipe.progress?.restSeconds ?? null, restWiden = recipe.progress?.restWiden ?? 1;
  const muscles = own.muscles, root = muscles.dynamics.root.segment, count = muscles.channels.length;
  const upright = uprightness(own.built), made = riseLimbs(own, recipe), ends = own.spec.ends ?? [];
  const feet = footStatesOf(own.built), footSegments: ReadonlySet<ReadSegment> = new Set(feet.map((foot) => foot.segment)), soles = new Vector3();
  const lying = { turn: new Quaternion(), way: new Vector3() }, belly = bellyOf(own.spec);
  const coasts = rollCoast();
  /**
   * Whether the body stands on its feet alone: every other segment more than `DOWN` over the
   * ground, and its centre of mass over the outline of its soles.
   */
  const onFeet = (): boolean => {
    if (upright.clearance(footSegments) <= DOWN) return false;
    readSupport(feet, feet, soles);
    const c = view.stance.centre, [x, z] = withinSupport(feet, c.x, c.z, 0);
    return x === c.x && z === c.z;
  };
  /** Whether the body is down and not on its feet alone. */
  const fallen = (): boolean => view.down && !onFeet();
  /** Every segment but the trunk's: the trunk's clearance is the ground's gap under the rest of the body's complement. */
  const notTrunk: ReadonlySet<ReadSegment> = new Set([...own.built.segments.entries()].filter(([name]) => !recipe.trunk.includes(name)).map(([, segment]) => segment));
  /** The rise's first bearing stage: before it the pose stages carry the body up from lying, and the trunk is not yet raised. */
  const borne = recipe.rise.findIndex((stage) => stage.kind === "bear");
  const { goalsOf, bearsOf, balls, pastOf, pressOf, levelOf, followOf } = riseTables(recipe, own.spec, muscles.channels, feet);

  const state = {
    /** What it is doing: nothing (the body is not its own, or its rise is over), lying slack, rolling, or rising. */
    phase: "idle" as "idle" | "settle" | "roll" | "rise",
    lie: "front" as Lie,
    /** The stage under way, in the roll or the rise; the time in it, s; how long it has lain still, s; how long a bearing stage's body has rested short of its aims, s. */
    stage: 0, time: 0, still: 0, rested: 0,
    /** A pose stage's reading held toward its end, s; a paced one's way along, of 1, and whether pacing or following has read its entry posture, `from`. */
    reached: 0, along: 0, paced: false, from: new Float64Array(count),
    /** How many attempts this fall has had, and the furthest stage of the rise any reached, -1 for none. */
    tries: 0, furthest: -1,
    /** Whether the bearing stage under way has let go the limbs it leaves: the centre of mass has been over the others. */
    lifted: false,
    /** Whether this attempt has had every segment of the trunk `RAISED` over the ground. */
    raised: false,
    /**
     * The weight transfer's integral of the centre's horizontal error from the borne place, m: it
     * grows at the stage's rate while a stage leaves a limb and the centre is not yet over the
     * others, takes up the steady error the posture and the contacts leave, is capped at the
     * body's standing height and is cleared at each stage's entry. Completion reads the stage's
     * target without it.
     */
    transfer: new Vector3(),
    /**
     * A bearing stage's records, each written by a step before it reads it: each limb's task, the
     * aims and the root's acceleration found for them, what the assist is asked, the freedoms held
     * at a torque, and what of the ground's wrench the patches could not give.
     */
    bear: {
      tasks: made.tasks, limbs: made.state,
      aim: { spin: new Vector3(), centre: new Vector3(), root: new Float64Array(6) },
      helped: { force: new Vector3(), moment: new Vector3() },
      held: { channels: [] as number[], z0: [] as number[], Z: [] as number[][] },
      shortfall: { force: new Vector3(), moment: new Vector3() },
    },
  };
  const solve = makeBearing(own.assist, made.limbs, { root: state.bear.aim.root, helped: state.bear.helped, held: state.bear.held, shortfall: state.bear.shortfall }, { effort: true });
  const patches = made.limbs.map(() => patchSupport()), supports: { readonly corners: readonly Vector3[] }[] = [];
  /** What a bearing step works in: each written by the step before it reads it. */
  const work = {
    place: new Vector3(), target: new Vector3(), across: new Vector3(), spin: new Vector3(), rootSpin: new Vector3(),
    turn: new Quaternion(), yaw: new Quaternion(), pitch: new Quaternion(), moved: new Uint8Array(count),
    ball: new Vector3(), heights: new Float64Array(feet.length), goals: new Float64Array(count), rates: new Float64Array(count),
  };
  /** Whether a contact is with the ground under the body: a fixed collider below it. */
  const underfoot = (other: unknown): boolean => other === null;
  /**
   * The ground's level, m: the body's lowest point raised by how far it is pressed into the ground,
   * its ground contacts' deepest gap (a loaded hand sinks a centimetre into the solver's ground).
   */
  const groundLevel = (): number => {
    let deepest = 0;
    for (const segment of own.built.segments.values()) {
      for (const contact of own.built.physics.contactManifoldsOf(segment.body, underfoot)) {
        if (contact.fixed === null || -contact.normal[1] < GROUND_UP) continue;
        for (const point of contact.points) if (point.distance < deepest) deepest = point.distance;
      }
    }
    return upright.lowest() - deepest;
  };
  /** Each foot's ball's height over the ground, into `work.heights`. */
  const readBalls = (): void => {
    const ground = groundLevel();
    feet.forEach((foot, k) => {
      const pose = foot.segment.pose;
      work.heights[k] = balls[k]!.applyRotationQuaternionToRef(pose.rotation, work.ball).y + pose.position.y - ground;
    });
  };

  const slack = (control: BodyControl): void => {
    control.muscles.activation.fill(0);
    control.muscles.velocity.fill(0);
  };
  const settle = (): void => {
    state.phase = "settle";
    state.still = 0;
    state.raised = false;
  };
  /** The stages the phase plays. */
  const playing = (phase: "roll" | "rise"): readonly Stage[] => (phase === "rise" ? recipe.rise : state.lie === "front" ? [] : recipe.roll[state.lie]);
  /** Begin stage `index` of `phase`, or what follows its last: after a roll it lies slack and reads again, after the rise it is done. */
  const enter = (phase: "roll" | "rise", index: number): void => {
    if (index >= playing(phase).length) {
      if (phase === "roll") settle();
      else state.phase = "idle";
      return;
    }
    const stage = playing(phase)[index]!;
    if (phase === "roll" && stage.kind === "pose" && stage.coast
      && coasts(turnOfToRef(root, lying.turn), root.body.angularVelocityToRef(work.rootSpin), stage, belly)) {
      enter(phase, index + 1);
      return;
    }
    state.phase = phase;
    state.stage = index;
    state.time = 0;
    state.rested = 0;
    state.reached = 0;
    state.along = 0;
    state.paced = false;
    state.lifted = false;
    state.transfer.setAll(0);
    if (phase === "rise" && index > state.furthest) state.furthest = index;
  };
  const pose = (stage: PoseStage, control: BodyControl, dt: number): void => {
    const top = stage.drive?.speed ?? POSE_SPEED, within = stage.drive?.within ?? POSE_SECONDS, { pace, press, level, follow } = stage;
    let goals = goalsOf.get(stage)!;
    if (pace || press || level || follow) {
      const asked = work.goals;
      asked.set(goals);
      if ((pace || follow) && !state.paced) { for (let i = 0; i < count; i++) state.from[i] = muscles.angle(i); state.paced = true; }
      if (pace) {
        // The way on from the posture it began in, while the balls are down and the body slow.
        const v = view.stance.velocity;
        let down = v.x * v.x + v.y * v.y + v.z * v.z < pace.slow * pace.slow;
        for (let k = 0; k < feet.length; k++) if (work.heights[k]! >= pace.lift) down = false;
        if (down) state.along = Math.min(1, state.along + pace.rate * dt);
        for (let i = 0; i < count; i++) asked[i] = state.from[i]! + (goals[i]! - state.from[i]!) * state.along;
      }
      // Following channels retain their entry pose until every lead enters its angle span.
      if (follow) {
        const table = followOf.get(stage)!;
        let along = 1;
        for (const lead of table.leads) along = Math.min(along, Math.max(0, 1 + (muscles.angle(lead.index) - lead.angle) / follow.span));
        for (const i of table.channels) asked[i] = state.from[i]! + (asked[i]! - state.from[i]!) * along;
      }
      // Each ball that is up presses its channels.
      if (press) pressOf.get(stage)!.forEach((gains, k) => {
        const over = Math.max(0, work.heights[k]! - press.above);
        for (const { index, gain } of gains) asked[index] += gain * over;
      });
      // Each side's channels by how far the pelvis tips down toward that side: its right's height
      // is how far it tips down toward the left.
      if (level) {
        const tip = lying.way.set(1, 0, 0).applyRotationQuaternionToRef(turnOfToRef(root, lying.turn), lying.way).y;
        levelOf.get(stage)!.forEach((gains, k) => {
          const down = k === 0 ? tip : -tip;
          for (const { index, gain } of gains) asked[index] += gain * down;
        });
      }
      for (let i = 0; i < count; i++) { const dof = muscles.channels[i]!.dof.spec; asked[i] = Math.max(dof.min.value, Math.min(dof.max.value, asked[i]!)); }
      goals = asked;
    }
    for (let i = 0; i < goals.length; i++) {
      control.muscles.velocity[i] = Math.max(-top, Math.min(top, (goals[i]! - muscles.angle(i)) / within));
      control.muscles.activation[i] = 1;
    }
    if (!stage.drive?.turning) return;
    // Each freedom's rate asked of its joint as the joint turns it.
    const rates = work.rates;
    rates.set(control.muscles.velocity);
    for (let i = 0; i < count; i++) {
      const channel = muscles.channels[i]!, first = i - channel.index;
      let speed = 0;
      for (let k = 0; k < channel.joint.dofs.length; k++) speed += muscles.turning(i, k) * rates[first + k]!;
      control.muscles.velocity[i] = speed;
    }
  };
  /** Whether the readings `until` names hold for pose `stage`, its balls read this step. */
  const endsAt = (stage: PoseStage, until: Until): boolean => {
    if (until.balls !== undefined) for (let k = 0; k < feet.length; k++) if (work.heights[k]! >= until.balls) return false;
    const v = view.stance.velocity;
    if (until.slow !== undefined && v.x * v.x + v.y * v.y + v.z * v.z >= until.slow * until.slow) return false;
    if (until.along !== undefined && state.along < until.along) return false;
    for (const { index, angle } of pastOf.get(stage) ?? []) if (muscles.angle(index) < angle) return false;
    return true;
  };
  /** Whether pose `stage` is held past its time: its body not yet turned onto its side by the hold's turn, within the hold's time. */
  const held = (stage: PoseStage, dt: number): boolean => {
    if (!stage.hold || !stage.over || state.time + dt / 2 >= stage.seconds * stage.hold.most) return false;
    const away = lying.way.set(stage.over === "right" ? -1 : 1, 0, 0).applyRotationQuaternionToRef(turnOfToRef(root, lying.turn), lying.way);
    return away.y < stage.hold.turned;
  };
  /** A step of `stage`; whether its limbs are down, those it leaves let go, the centre of mass at its aim and slow, and the pelvis turned to its. */
  const bear = (stage: BearStage, control: BodyControl, dt: number): boolean => {
    const { aim } = state.bear, { place, target, across, spin, rootSpin, turn, yaw, pitch, moved } = work;
    const seconds = stage.seconds, n = 1 / seconds;
    const goals = goalsOf.get(stage)!, { on, share, leaves, toes, keeps } = bearsOf.get(stage)!;
    const ground = upright.lowest(), standing = upright.standing;
    // The way the pelvis faces, about up: its left-to-right axis says it however far forward it is pitched.
    across.set(1, 0, 0).applyRotationQuaternionToRef(turnOfToRef(root, turn), across);
    const heading = atan2(-across.z, across.x);
    turnAboutToRef(Vector3.UpReadOnly, heading, yaw);
    // The limbs: those the stage names bear where they are once they are down, and are the
    // servo's until then; the place is the middle of where the body is held over those that
    // bear, by their shares, and with none down, where the centre of mass is.
    const c = view.stance.centre, v = view.stance.velocity;
    made.read(ground, stage.overProp, toes, c);
    place.setAll(0);
    let borne = 0, down = true;
    made.over.forEach((over, l) => {
      if (!on[l]) return;
      if (!made.bear(l, goals, n, ground, share[l]!, !keeps)) { down = false; return; }
      place.addInPlaceFromFloats(share[l]! * over.x, 0, share[l]! * over.z);
      borne += share[l]!;
    });
    if (borne > 0) place.scaleInPlace(1 / borne);
    else place.set(c.x, 0, c.z);
    // Those it leaves bear where they are, while they are down, until the centre of mass is over
    // the others (within the outline of where they bear, drawn in as a stance's is); the rest
    // are the servo's.
    let supporting = 0;
    for (let l = 0; l < made.limbs.length; l++) if (on[l] && made.limbs[l]!.task.bearing) {
      const patch = patches[l]!; patch.read(made.limbs[l]!.work.patch!); supports[supporting++] = patch;
    }
    supports.length = supporting;
    if (!state.lifted && down && borne > 0) {
      const [x, z] = withinSupport(supports, c.x, c.z);
      state.lifted = x === c.x && z === c.z;
    }
    if (!keeps && !state.lifted && down && borne > 0) {
      state.transfer.x += n * (place.x - c.x) * dt;
      state.transfer.z += n * (place.z - c.z) * dt;
      const accumulated = Math.sqrt(state.transfer.x * state.transfer.x + state.transfer.z * state.transfer.z);
      if (accumulated > standing) state.transfer.scaleInPlace(standing / accumulated);
    }
    for (let l = 0; l < made.limbs.length; l++) {
      if (!on[l] && !(leaves[l] && !state.lifted && made.bear(l, goals, n, ground, LEFT, !keeps))) made.rest(l);
    }
    // The centre of mass: toward the place, at the stage's height over the ground if it has one, critically damped.
    target.set(place.x, (stage.height === null ? c.y : ground + stage.height * standing), place.z);
    aim.centre.set(n * n * (target.x - c.x + state.transfer.x) - 2 * n * v.x, n * n * (target.y - c.y) - 2 * n * v.y, n * n * (target.z - c.z + state.transfer.z) - 2 * n * v.z);
    // The pelvis: toward its reference turn pitched forward, then turned about up to the way it faces now.
    root.body.angularVelocityToRef(rootSpin);
    if (stage.pitch === null) spin.setAll(0);
    else {
      turnAboutToRef(across.set(1, 0, 0), stage.pitch, pitch);
      yaw.multiplyToRef(pitch, turn).multiplyInPlace(root.rest);
      spinBetweenToRef(root.pose.rotation, turn, seconds, spin);
    }
    aim.spin.copyFrom(spin).scaleInPlace(n).subtractInPlace(rootSpin.scaleInPlace(2 * n));
    // Motor control's order: the servo's asks, the root's acceleration, the servo's solve around
    // the limbs' motion, and the limbs' torques. Every freedom is asked toward the posture: a
    // bearing limb's are then the solve's, and its stem moves as the servo asked.
    const asked = servoAsk(muscles, control.muscles, (i) => goals[i], stage.postureSeconds ?? stage.seconds, dt);
    // A moment the patches miss is weighed as a force missed at the root's height over the ground.
    const lever = muscles.dynamics.root.centre[1] - ground;
    const carried = carryRoot(solve, muscles, asked, aim, lever);
    limbMotion(solve, asked, moved);
    servoSolve(muscles, control.muscles, asked, carried, moved);
    bearLimbs(solve, muscles, control, asked, lever, true);
    const dx = place.x - c.x, dy = target.y - c.y, dz = place.z - c.z;
    // `spin` closes the pelvis's turn in the stage's time constant: the turn left is the two's product.
    const tolerance = stage.progress?.turn ?? turnTolerance;
    const turnLeft = (spin.x * spin.x + spin.y * spin.y + spin.z * spin.z) * seconds * seconds, apart = dx * dx + dy * dy + dz * dz;
    const slow = stage.progress?.speed ?? speed, close = stage.progress?.near ?? near;
    const borneAndSlow = down && (keeps || state.lifted) && v.x * v.x + v.y * v.y + v.z * v.z < slow * slow;
    if (restSeconds === null) return borneAndSlow && turnLeft < tolerance * tolerance && apart < close * close;
    // At rest short of its aims: within the tolerances widened at rest, slow, for the recipe's time.
    const w = restWiden * restWiden;
    state.rested = borneAndSlow && turnLeft < tolerance * tolerance * w && apart < close * close * w ? state.rested + dt : 0;
    return borneAndSlow && turnLeft < tolerance * tolerance && apart < close * close || state.rested + dt / 2 >= restSeconds;
  };

  /** Whether the rise's first stage, a bearing one, has every limb it bears on pressed on the ground and the trunk clear. */
  function supported(): boolean {
    const first = recipe.rise[0];
    if (first?.kind !== "bear") throw new Error("a supported rise begins with a bearing stage");
    return upright.clearance(notTrunk) > DOWN && first.on.every(on => {
      const name = ends.find(limb => limb.name === on.limb)!.segment;
      return own.built.physics.contactsOf(own.built.segments.get(name)!.body, other => other === null)
        .some(contact => contact.impulse > 0 && -contact.normal[1] >= .9);
    });
  }
  /** The rise from its first stage, as one attempt. */
  function rising(): void {
    state.tries = 1; state.furthest = -1; state.raised = false;
    enter("rise", 0);
  }

  return {
    state,
    stages: (phase) => playing(phase).length,
    // Lying slack, rolling or rising; or, its rise over, down and off its feet.
    wants: () => state.phase !== "idle" || fallen(),
    begin() {
      settle();
      state.tries = 0;
      state.furthest = -1;
    },
    beginSupported() {
      if (!supported()) return false;
      rising();
      return true;
    },
    beginRising: rising,
    beginRolling() {
      state.lie = lieOf(root, belly, lying);
      state.tries = 1; state.furthest = -1; state.raised = false;
      enter(state.lie === "front" ? "rise" : "roll", 0);
    },
    end() { state.phase = "idle"; },
    step(_senses, control, dt) {
      switch (state.phase) {
        case "idle":
          // Its rise is over and the body is still down: it lies slack and begins another.
          settle();
          slack(control);
          return;
        case "settle": {
          slack(control);
          const v = view.stance.velocity;
          state.still = v.x * v.x + v.y * v.y + v.z * v.z < settleSpeed * settleSpeed ? state.still + dt : 0;
          if (state.still + dt / 2 < settleSeconds) return;
          state.lie = lieOf(root, belly, lying);
          state.tries++;
          enter(state.lie === "front" ? "rise" : "roll", 0);
          return;
        }
        case "roll":
        case "rise": {
          // A body rolled from its back onto the side its roll does not go over goes on over that side.
          if (state.phase === "roll" && state.lie === "back") {
            const over = recipe.roll.back[state.stage]!.over, now = lieOf(root, belly, lying);
            if (over && (now === "left" || now === "right") && now !== over && recipe.roll[now].length > 0) { state.lie = now; enter("roll", 0); }
          }
          const stage = playing(state.phase)[state.stage]!;
          if (state.phase === "rise") {
            const gap = upright.clearance(notTrunk);
            if (gap > RAISED && state.stage >= borne) state.raised = true;
            else if (state.raised && gap <= DOWN) {
              settle();
              slack(control);
              return;
            }
          }
          // A time summed from steps falls a rounding short of a whole number of them: to the nearest step.
          switch (stage.kind) {
            case "pose": {
              if (stage.pace || stage.press || stage.until?.balls !== undefined) readBalls();
              pose(stage, control, dt);
              state.time += dt;
              if (stage.until) {
                // Ended by its reading, held; past its time, the attempt is over.
                const now = endsAt(stage, stage.until);
                state.reached = now ? state.reached + dt : 0;
                if (now && state.reached + dt / 2 >= stage.until.for) enter(state.phase, state.stage + 1);
                else if (state.time + dt / 2 >= stage.seconds) settle();
                return;
              }
              if (state.time + dt / 2 >= stage.seconds && !held(stage, dt)) enter(state.phase, state.stage + 1);
              return;
            }
            case "bear": {
              const there = bear(stage, control, dt);
              state.time += dt;
              // A recipe that holds its last stage stays in it.
              if (recipe.holds && state.phase === "rise" && state.stage === recipe.rise.length - 1) return;
              if (there) enter(state.phase, state.stage + 1);
              else if (state.time + dt / 2 >= stage.limit) settle();
              return;
            }
            default: return unknownStage(stage);
          }
        }
        default: unknownPhase(state.phase);
      }
    },
  };
}

function unknownPhase(phase: never): never {
  throw new Error(`no phase ${JSON.stringify(phase)}`);
}

function unknownStage(stage: never): never {
  throw new Error(`a stage of no known kind: ${JSON.stringify(stage)}`);
}
