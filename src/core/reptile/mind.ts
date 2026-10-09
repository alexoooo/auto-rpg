import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BuiltBody } from "../build/build-body.ts";
import { supportedMotor, type SupportEndpoint } from "../control/supported-motor.ts";
import { uprightness } from "../control/ground.ts";
import { effectorTracker } from "../control/effector-tracker.ts";
import { rootFrameToRef, intoFrameToRef } from "../control/kinematics.ts";
import { motionAtToRef, turnOfToRef } from "../control/support.ts";
import { hostedBody } from "../mind/hosted.ts";
import type { MindWiring } from "../mind/minds.ts";
import type { HostMind } from "../mind/sub-mind.ts";
import type { Senses } from "../mind/senses.ts";
import { STAND_ORDERS, type Orders } from "../mind/orders.ts";
import type { World } from "../world.ts";
import type { BodySpec } from "../spec/body.ts";
import { atan2, cos, sin } from "../math/real.ts";
import { crawl, soleGoal, type QuadrupedView } from "./crawl.ts";
import { headingAligned, trot } from "./trot.ts";
import { REPTILE_CRAWL, REPTILE_TROT, REPTILE_MOTOR, REPTILE_TRAVEL, REPTILE_BITE } from "./tuning.ts";
import { recover } from "./recover.ts";
import { bite } from "./bite.ts";
import { quadrupedTactics } from "./tactics.ts";
import { effectorFeedback } from "../control/effector-feedback.ts";

/**
 * Whether the quadruped mind can drive a body of `spec`: three or more effectors it stands on, so
 * two stay down while one steps, each the end of a hip, a knee and an ankle from the root
 * (`recover`), and a jaw with a bite point hinged to a head with a mouth (`mouthOf`).
 */
export function quadrupedFits(spec: BodySpec): boolean {
  const above = (name: string) => spec.joints.find((joint) => joint.child === name);
  const depth = (name: string): number => { const joint = above(name); return joint ? 1 + depth(joint.parent) : 0; };
  const segment = (name: string | undefined) => spec.segments.find((s) => s.name === name);
  const supports = (spec.effectors ?? []).filter((effector) => effector.support);
  const jaw = spec.segments.find((s) => s.points?.bite), head = segment(jaw && above(jaw.name)?.parent);
  return supports.length >= 3 && supports.every((paw) => depth(paw.segment) === 3)
    && !!head?.points?.mouth && above(head.name) !== undefined;
}

/** A quadruped mind drives its own support chains through the common floating-base solve. */
export function createQuadrupedMind(built: BuiltBody, world: World, wiring: Partial<MindWiring> = {}, tuning: { crawl: typeof REPTILE_CRAWL; trot: typeof REPTILE_TROT; motor: typeof REPTILE_MOTOR; travel: typeof REPTILE_TRAVEL; bite?: typeof REPTILE_BITE } = { crawl: REPTILE_CRAWL, trot: REPTILE_TROT, motor: REPTILE_MOTOR, travel: REPTILE_TRAVEL }) {
  const orders = wiring.orders ?? ((): null => null);
  const upright = uprightness(built), down = (): boolean => upright.down();
  // The paws, in the order the crawl lifts them: the effectors the spec says it stands on.
  const paws: readonly SupportEndpoint[] = (built.spec.effectors ?? []).filter(e => e.support).map(e => ({ segment: e.segment, point: e.point, sole: e.support === "sole" }));
  const body = hostedBody(built, world, wiring, (own, senses) => {
    const motor = supportedMotor(own, paws, tuning.motor), skill = trot(own, motor, paws.map(p => p.segment), tuning.trot);
    const creep = crawl(own, motor, paws.map(p => p.segment), tuning.crawl);
    const gait = { kind: "trot" as "trot" | "crawl", reacquire: false, homeAt: 0, stable: 0 };
    const locomotion = { trot: skill, crawl: creep }, settings = { trot: tuning.trot, crawl: tuning.crawl };
    const tracker = effectorTracker(built, motor.root), frame = { position: new Vector3(), rotation: new Quaternion() }, target = new Vector3();
    const inverse = new Quaternion(), desired = new Quaternion(), flat = new Quaternion(), lift = new Vector3(), descending = new Vector3();
    const turn = new Quaternion(), front = new Vector3(), forward = new Vector3(0, 0, 1), still = new Vector3(), carried = new Vector3(), spin = new Vector3();
    // What the look reads of the body's heading and whether it is down, kept with the body's state.
    const look = { yaw: 0, down: false };
    const view: QuadrupedView = { centre: motor.state.centre, velocity: motor.state.velocity, feet: motor.state.endpoints,
      senses: senses(), get yaw() { return look.yaw; }, get down() { return look.down; } };
    const reading = view as { -readonly [K in keyof QuadrupedView]: QuadrupedView[K] };
    const lower = [...built.segments.values()].find(segment => segment.spec.points?.bite)!;
    const head = [...built.segments.values()].find(segment => segment.spec.points?.mouth)!;
    const feedback = effectorFeedback(built, [lower.spec.name, head.spec.name], wiring.contactIdentity, undefined,
      { [lower.spec.name]: { point: "bite", regions: lower.spec.contacts!.filter(c => c.surface.point).map(c => c.name) },
        [head.spec.name]: { point: "mouth" } });
    const read = (s: Senses) => {
      motor.read(); feedback.read(); turnOfToRef(motor.root, turn); forward.applyRotationQuaternionToRef(turn, front);
      reading.senses = s; look.yaw = atan2(front.x, front.z); look.down = down();
    };
    const snap = bite(own, tracker, tuning.bite, feedback.state[lower.spec.name], feedback.state[head.spec.name]), tactics = quadrupedTactics(own, view => orders(view.senses), tuning.bite), skills = [skill, creep, snap];
    const sight = { view, bite: snap.state.cycle };
    read(senses()); for (const s of skills) s.resume(view);
    const host: HostMind = { name: "crawl", state: { motor: motor.state, crawl: skill.state, creep: creep.state, gait, bite: snap.state, tactics: tactics.state, tracker: tracker.state, feedback: feedback.state, look }, look: read,
      step(s: Senses, dt: number) { read(s); this.act(dt); }, act(dt: number) {
      const intent = tactics.decide(sight, dt);
      const busy = snap.state.cycle.phase !== null;
      const withdrawing = snap.withdraw();
      const heading = intent.face ?? intent.move;
      const misaligned = gait.reacquire && !headingAligned(view.yaw, heading, tuning.trot.resumeAngle);
      const placing = creep.state.steps < gait.homeAt || misaligned || creep.state.align > 0;
      if (gait.reacquire && !placing && creep.state.phase === "settle") {
        const stable = view.feet.every(foot => foot.contact && foot.flat) && view.velocity.lengthSquared() < tuning.trot.resumeSpeed * tuning.trot.resumeSpeed;
        gait.stable = stable ? gait.stable + dt : 0;
        if (gait.stable >= tuning.trot.resumeHold) gait.reacquire = false;
      }
      let movement: Orders = intent;
      if (gait.reacquire) movement = placing ? { ...STAND_ORDERS, move: { x: 0, z: 0 }, face: heading } : STAND_ORDERS;
      else if (withdrawing) movement = { move: { x: -sin(view.yaw), z: -cos(view.yaw) }, face: { x: sin(view.yaw), z: cos(view.yaw) }, attack: null };
      else if (busy || intent.attack) movement = STAND_ORDERS;
      const wanted = gait.reacquire || withdrawing || intent.creep || gait.kind === "crawl" && !intent.travel ? "crawl" : "trot";
      let active = locomotion[gait.kind];
      if (wanted !== gait.kind && active.state.phase === "settle") {
        gait.kind = wanted; active = locomotion[gait.kind];
        active.resume(view); tracker.reset(); motor.resume();
      }
      const T = settings[gait.kind];
      const walking = wanted !== gait.kind ? STAND_ORDERS : movement;
      const command = gait.kind === "crawl"
        ? creep.command(view, walking, dt, intent.prepareBite || busy ? tuning.trot.crawlHeight : tuning.crawl.crawlHeight)
        : skill.command(view, walking, dt);
      snap.command(view, gait.reacquire ? null : intent.attack, active.state.phase === "settle" && (snap.state.cycle.phase === "swing" || snap.state.cycle.phase === "return"
        ? view.feet.reduce((loaded, f) => loaded + (f.contact ? 1 : 0), 0) >= paws.length - 1
        : view.feet.every(f => f.contact)), dt, command, intent.prepareBite, tactics.state.target);
      rootFrameToRef(motor.root, frame);
      desired.set(...command.rotation).multiplyToRef(Quaternion.InverseToRef(motor.root.rest, inverse), desired);
      Quaternion.InverseToRef(frame.rotation, inverse).multiplyToRef(desired, flat).normalize();
      lift.set(0, T.lift, 0).applyRotationQuaternionToRef(inverse, lift);
      descending.set(0, -T.plantSpeed, 0).applyRotationQuaternionToRef(inverse, descending);
      command.endpoints.forEach((goal, i) => {
        const paw = paws[i]!;
        if (goal.bearing && view.feet[i]!.contact) tracker.release(paw.segment);
        else {
          if (gait.kind === "trot") {
            motionAtToRef(motor.root, target.set(...goal.target), carried, spin);
            descending.set(-carried.x, -T.plantSpeed - carried.y, -carried.z).applyRotationQuaternionToRef(inverse, descending);
          }
          intoFrameToRef(frame, goal.target, target);
          tracker.reach(paw.segment, soleGoal(paw.point, target, goal.bearing ? T.plant : T.swing, active.state.sequence, descending, flat, goal.bearing ? still : lift));
        }
      });
      const tracked = tracker.step(own.muscles, command.posture, dt, false, true);
      motor.control(command, dt, i => snap.tracked(i) ?? tracked(i), gait.kind === "crawl" || active.state.standing && active.state.phase === "settle" ? tuning.motor : tuning.travel,
        i => snap.response(i) ?? tracker.response(own.muscles.channels[i]!.name));
    }, release() { tactics.state.target = null; tactics.state.pending = 0; tactics.state.phase = null; tracker.reset(); for (const s of skills) s.resume(view); }, resume() {
      tactics.state.target = null; tactics.state.pending = 0; tactics.state.phase = null;
      motor.resume(); tracker.reset(); for (const s of skills) s.resume(view);
      gait.kind = "crawl"; gait.reacquire = true; gait.homeAt = creep.state.steps + paws.length; gait.stable = 0;
    } };
    // Down as the mind read it at its look, as every body answers: `docs/reference/down-timing.md`.
    return { host, subs: [recover(own, motor, tracker, paws, view)], down: () => look.down };
  });
  return { kind: "quadruped" as const, body, state: {} };
}
