import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { SupportedCommand, SupportEndpoint } from "../control/supported-motor.ts";
import { uprightness } from "../control/ground.ts";
import { effectorTracker } from "../control/effector-tracker.ts";
import { effectorFeedback } from "../control/effector-feedback.ts";
import { rootFrameToRef, intoFrameToRef } from "../control/kinematics.ts";
import { motionAtToRef, turnOfToRef } from "../read-motion.ts";
import type { OwnBody } from "../mind/mind.ts";
import type { SubMind } from "../mind/sub-mind.ts";
import type { Senses } from "../mind/senses.ts";
import type { PartLookup } from "../parts/lookup.ts";
import { atan2, cos, sin } from "../math/real.ts";
import { pawsOf } from "../spec/body.ts";
import { deepFreeze } from "../state.ts";
import { soleGoal, STAND_TRAVEL, type QuadrupedView, type TravelOrders } from "./crawl.ts";
import { REPTILE_TROT, REPTILE_BITE } from "./tuning.ts";
import { recover } from "./recover.ts";
import { RIGHTING, rightingByRecipe } from "./righting.ts";
import type { QuadrupedConfig } from "./config.ts";
import type { BiteTuning, QuadrupedIntent } from "./parts.ts";

/** **The quadruped's stock parts**: what each of its slots holds where its config names none. */
export const QUADRUPED_PARTS = deepFreeze({
  motor: { kind: "paw-motor" }, travel: { kind: "paw-trot" }, crawl: { kind: "paw-crawl" }, bite: { kind: "jaw-bite" }, tactics: { kind: "stalk" },
});

/** What a quadruped's layers are made of: its motor, gaits and bite, each the part its config names or the stock one (`QUADRUPED_PARTS`), and its bite's settings. */
export type QuadrupedBodyConfig = Pick<QuadrupedConfig, "motor" | "travel" | "crawl" | "bite" | "tuning">;

/** A foe's part a bite is aimed at, and the tooth that aims (`Bite.command`'s selection). */
export type BiteSelection = { readonly foe: string; readonly part: string; readonly tooth?: string } | null;

/**
 * **A quadruped's layers**, any quadruped mind's to build on its own body: its paws (`pawsOf`)
 * carried by its support motor, travelling on one gait and crawling on another, biting with its
 * bite, its paws' goals followed by its effector tracker, read through its view each step, and
 * its righting (`recover`) over the same motor and tracker. Whatever decides hands it an intent
 * each step (`act`): the travel, where and whether to bite, and the foe's part it bites at; the
 * layers choose the gait, reacquire their footing after another had the body, and write the
 * muscles. Released, the tracker forgets its goals and every skill resumes; resumed, they crawl
 * until their paws are placed again and still.
 */
export function quadrupedLayers(own: OwnBody, parts: PartLookup, config: QuadrupedBodyConfig) {
  const biteTuning: BiteTuning = deepFreeze({ ...REPTILE_BITE, ...config.tuning?.bite });
  // The paws, in the order the crawl lifts them: the ends the spec says it stands on (`pawsOf`).
  const paws: readonly SupportEndpoint[] = pawsOf(own.spec).map(paw => ({ segment: paw.segment, point: paw.point, sole: paw.sole }));
  const senses = own.senses, built = own.built, upright = uprightness(built), down = (): boolean => upright.down();
  const motorConfig = config.motor ?? QUADRUPED_PARTS.motor, support = parts.of("support-motor", motorConfig).make(own, paws, motorConfig), motor = support.motor;
  const travelConfig = config.travel ?? QUADRUPED_PARTS.travel, travel = parts.of("gait", travelConfig).make(own, motor, paws.map(p => p.segment), travelConfig);
  const crawlConfig = config.crawl ?? QUADRUPED_PARTS.crawl, creep = parts.of("gait", crawlConfig).make(own, motor, paws.map(p => p.segment), crawlConfig);
  const gait = { kind: "travel" as "travel" | "crawl", reacquire: false, homeAt: 0, stable: 0 };
  const locomotion = { travel, crawl: creep };
  const tracker = effectorTracker(built, motor.root, { seedActual: true }), frame = { position: new Vector3(), rotation: new Quaternion() }, target = new Vector3();
  const inverse = new Quaternion(), desired = new Quaternion(), flat = new Quaternion(), lift = new Vector3(), descending = new Vector3();
  const turn = new Quaternion(), front = new Vector3(), forward = new Vector3(0, 0, 1), still = new Vector3(), carried = new Vector3(), spin = new Vector3();
  // What the look reads of the body's heading and whether it is down, kept with the body's state.
  const look = { yaw: 0, down: false };
  const view: QuadrupedView = { centre: motor.state.centre, velocity: motor.state.velocity, feet: motor.state.endpoints,
    senses: senses(), get yaw() { return look.yaw; }, get down() { return look.down; } };
  const reading = view as { -readonly [K in keyof QuadrupedView]: QuadrupedView[K] };
  const lower = [...built.segments.values()].find(segment => segment.spec.points?.bite)!;
  const head = [...built.segments.values()].find(segment => segment.spec.points?.mouth)!;
  const feedback = effectorFeedback(built, [lower.spec.name, head.spec.name], own.contactIdentity, undefined,
    { [lower.spec.name]: { point: "bite", regions: lower.spec.contacts!.filter(c => c.surface.directed?.mechanism === "point").map(c => c.name) },
      [head.spec.name]: { point: "mouth" } });
  // Its own body as it stands: the motor's support, its heading and whether it is down.
  const feel = () => {
    motor.read(); turnOfToRef(motor.root, turn); forward.applyRotationQuaternionToRef(turn, front);
    look.yaw = atan2(front.x, front.z); look.down = down();
  };
  const read = (s: Senses) => { feel(); feedback.read(); reading.senses = s; };
  const biteConfig = config.bite ?? QUADRUPED_PARTS.bite;
  const snap = parts.of("bite", biteConfig).make(own, tracker, biteTuning, { jaw: feedback.state[lower.spec.name]!, head: feedback.state[head.spec.name]! }, biteConfig);
  const skills = [travel, creep, snap];
  const resumeSkills = () => { for (const s of skills) s.resume(view); planned.command = null; };
  // Where its decisions are late (`OwnBody.delay`), the gait's command its motor part carries out on the next step, and whether that holds still.
  const late = own.delay > 0, planned = { command: null as SupportedCommand | null, hold: false };
  if (own.delay > 1) throw new Error(`a quadruped's motor part carries out a step's decision on the next step, not ${own.delay} steps later`);
  const drive = (command: SupportedCommand, hold: boolean, dt: number) => {
    const tracked = tracker.step(own.muscles, command.posture, dt);
    motor.control(command, dt, i => snap.tracked(i) ?? tracked(i), hold ? support.hold : support.travel,
      i => snap.response(i) ?? tracker.response(own.muscles.channels[i]!.name));
  };
  return {
    view, motor, tracker, paws, gait, biteTuning, bite: snap, late,
    /** What the body's skills keep, by name, for its mind's state. */
    state: { motor: motor.state, travel: travel.state, crawl: creep.state, gait, bite: snap.state, tracker: tracker.state, feedback: feedback.state, look, planned },
    /** Read the body as the last step left it. */
    read,
    /** Read its own body alone, as its motor part does: its support, heading and whether it is down. */
    feel,
    /** Its motor part, where its decisions are late: the gait's command the last step decided, carried out on the body as it is. */
    move(dt: number) { if (planned.command) drive(planned.command, planned.hold, dt); },
    /** Read the body as built, once, and resume every skill from it. */
    begin() { read(senses()); resumeSkills(); },
    /**
     * Carry out `intent` this step, its bite at `selection`: the gait it asks, unless the layers
     * are reacquiring their footing, withdrawing from a bite or holding still to bite.
     */
    act(intent: QuadrupedIntent, selection: BiteSelection, dt: number) {
      const busy = snap.state.cycle.phase !== null;
      const withdrawing = snap.withdraw();
      const heading = intent.face ?? intent.move;
      const placing = creep.state.placed < gait.homeAt;
      if (gait.reacquire && !placing && creep.state.phase === "settle") {
        const stable = view.feet.every(foot => foot.contact && foot.flat) && view.velocity.lengthSquared() < REPTILE_TROT.resumeSpeed * REPTILE_TROT.resumeSpeed;
        gait.stable = stable ? gait.stable + dt : 0;
        if (gait.stable >= REPTILE_TROT.resumeHold) gait.reacquire = false;
      }
      let movement: TravelOrders = intent;
      if (gait.reacquire) movement = placing ? { ...STAND_TRAVEL, move: { x: 0, z: 0 }, face: heading } : STAND_TRAVEL;
      else if (withdrawing) movement = { move: { x: -sin(view.yaw), z: -cos(view.yaw) }, face: { x: sin(view.yaw), z: cos(view.yaw) } };
      else if (busy || intent.biteAt) movement = STAND_TRAVEL;
      const wanted = gait.reacquire || withdrawing || intent.creep || gait.kind === "crawl" && !intent.travel ? "crawl" : "travel";
      let active = locomotion[gait.kind];
      if (wanted !== gait.kind && active.state.phase === "settle") {
        gait.kind = wanted; active = locomotion[gait.kind];
        active.resume(view); tracker.reset(); motor.resume();
      }
      const T = active.settings;
      const walking = wanted !== gait.kind ? STAND_TRAVEL : movement;
      const command = gait.kind === "crawl"
        ? creep.command(view, walking, dt, intent.prepareBite || busy ? travel.settings.crawlHeight : creep.settings.crawlHeight)
        : travel.command(view, walking, dt);
      snap.command(view, gait.reacquire ? null : intent.biteAt, active.state.phase === "settle" && (snap.state.cycle.phase === "swing" || snap.state.cycle.phase === "return"
        ? view.feet.reduce((loaded, f) => loaded + (f.contact ? 1 : 0), 0) >= paws.length - 1
        : view.feet.every(f => f.contact)), dt, command, intent.prepareBite, selection);
      rootFrameToRef(motor.root, frame);
      desired.set(...command.rotation).multiplyToRef(Quaternion.InverseToRef(motor.root.rest, inverse), desired);
      Quaternion.InverseToRef(frame.rotation, inverse).multiplyToRef(desired, flat).normalize();
      lift.set(0, T.lift, 0).applyRotationQuaternionToRef(inverse, lift);
      descending.set(0, -T.plantSpeed, 0).applyRotationQuaternionToRef(inverse, descending);
      command.endpoints.forEach((goal, i) => {
        const paw = paws[i]!;
        if (goal.bearing && view.feet[i]!.contact) tracker.release(paw.segment);
        else {
          if (gait.kind === "travel") {
            motionAtToRef(motor.root, target.set(...goal.target), carried, spin);
            descending.set(-carried.x, -T.plantSpeed - carried.y, -carried.z).applyRotationQuaternionToRef(inverse, descending);
          }
          intoFrameToRef(frame, goal.target, target);
          tracker.reach(paw.segment, soleGoal(paw.point, target, goal.bearing ? T.plant : T.swing, active.state.sequence, descending, flat, goal.bearing ? still : lift));
        }
      });
      const hold = gait.kind === "crawl" || active.state.standing && active.state.phase === "settle";
      if (late) { planned.command = command; planned.hold = hold; } else drive(command, hold, dt);
    },
    /** Another has the body: the tracker forgets its goals and every skill resumes. */
    release() { tracker.reset(); resumeSkills(); },
    /** The body is its own again: it crawls until its paws are placed again and still. */
    resume() {
      motor.resume(); tracker.reset(); resumeSkills();
      gait.kind = "crawl"; gait.reacquire = true; gait.homeAt = creep.state.placed + paws.length; gait.stable = 0;
    },
    /** Its righting (`recover`), over its motor and tracker: wanted while the body is down or righting itself. */
    righting(): SubMind {
      const recipe = config.tuning?.righting?.[own.spec.model] ?? RIGHTING[own.spec.model];
      return recipe ? rightingByRecipe(own, motor, tracker, view, recipe) : recover(own, motor, tracker, paws, view);
    },
  };
}

/** A quadruped's layers (`quadrupedLayers`). */
export type QuadrupedLayers = ReturnType<typeof quadrupedLayers>;
