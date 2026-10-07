import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BuiltBody } from "../build/build-body.ts";
import { supportedMotor, type SupportEndpoint } from "../control/supported-motor.ts";
import { uprightness } from "../control/ground.ts";
import { effectorTracker } from "../control/effector-tracker.ts";
import { rootFrameToRef, intoFrameToRef } from "../control/kinematics.ts";
import { turnOfToRef } from "../control/support.ts";
import { hostedBody } from "../mind/hosted.ts";
import type { MindWiring } from "../mind/minds.ts";
import type { HostMind } from "../mind/sub-mind.ts";
import type { Senses } from "../mind/senses.ts";
import { STAND_ORDERS } from "../mind/orders.ts";
import type { World } from "../world.ts";
import { atan2, cos, sin } from "../math/real.ts";
import { crawl, type QuadrupedView } from "./crawl.ts";
import { REPTILE_CONTROL as T } from "./tuning.ts";
import { recover } from "./recover.ts";
import { bite } from "./bite.ts";
import { quadrupedTactics } from "./tactics.ts";

/** Four physical support endpoints, in the crawl's order. */
const PAWS: readonly SupportEndpoint[] = ["front.left", "hind.right", "front.right", "hind.left"].map(name => ({ segment: `paw.${name}`, point: "sole", sole: true }));

/** A quadruped mind drives its own support chains through the common floating-base solve. */
export function createQuadrupedMind(built: BuiltBody, world: World, wiring: Partial<MindWiring> = {}) {
  const orders = wiring.orders ?? ((): null => null);
  const upright = uprightness(built), down = (): boolean => upright.down();
  const body = hostedBody(built, world, wiring, (own, senses) => {
    const motor = supportedMotor(own, PAWS, T), skill = crawl(own, motor, PAWS.map(p => p.segment));
    const tracker = effectorTracker(built, motor.root), frame = { position: new Vector3(), rotation: new Quaternion() }, target = new Vector3();
    const inverse = new Quaternion(), desired = new Quaternion(), flat = new Quaternion(), lift = new Vector3(), descending = new Vector3();
    const turn = new Quaternion(), front = new Vector3(), forward = new Vector3(0, 0, 1);
    const view: QuadrupedView = { centre: motor.state.centre, velocity: motor.state.velocity, feet: motor.state.endpoints,
      senses: senses(), yaw: 0, down: false };
    const reading = view as { -readonly [K in keyof QuadrupedView]: QuadrupedView[K] };
    const read = (s: Senses) => {
      motor.read(); turnOfToRef(motor.root, turn); forward.applyRotationQuaternionToRef(turn, front);
      reading.senses = s; reading.yaw = atan2(front.x, front.z); reading.down = down();
    };
    const snap = bite(own, tracker), tactics = quadrupedTactics(own, view => orders(view.senses)), skills = [skill, snap];
    const sight = { view, bite: snap.state.cycle };
    read(senses()); for (const s of skills) s.resume(view);
    const host: HostMind = { name: "crawl", state: { motor: motor.state, crawl: skill.state, bite: snap.state, tracker: tracker.state }, look: read,
      step(s: Senses, dt: number) { read(s); this.act(dt); }, act(dt: number) {
      const intent = tactics.decide(sight, dt);
      const busy = snap.state.cycle.phase !== null;
      const withdrawing = snap.withdraw();
      const movement = withdrawing ? { move: { x: -sin(view.yaw), z: -cos(view.yaw) }, face: null, attack: null } : busy ? STAND_ORDERS : intent;
      const command = skill.command(view, movement, dt);
      snap.command(view, intent.attack, skill.state.phase === "settle" && view.feet.every(f => f.contact), dt, command.posture as Record<string, number>, intent.prepareBite);
      rootFrameToRef(motor.root, frame);
      desired.set(...command.rotation).multiplyToRef(Quaternion.InverseToRef(motor.root.rest, inverse), desired);
      Quaternion.InverseToRef(frame.rotation, inverse).multiplyToRef(desired, flat).normalize();
      lift.set(0, T.lift, 0).applyRotationQuaternionToRef(inverse, lift);
      descending.set(0, -T.plantSpeed, 0).applyRotationQuaternionToRef(inverse, descending);
      command.endpoints.forEach((goal, i) => {
        const name = PAWS[i]!.segment;
        if (goal.bearing && view.feet[i]!.contact) tracker.release(name);
        else {
          intoFrameToRef(frame, goal.bearing ? goal.target : skill.state.to, target);
          tracker.reach(name, { places: [{ point: "sole", position: [target.x, target.y, target.z] }], seconds: goal.bearing ? T.plant : T.swing,
            follows: true, sequence: skill.state.sequence, initialVelocity: [0, 0, 0], terminalVelocity: [descending.x, descending.y, descending.z],
            curve: goal.bearing ? [0, 0, 0] : [lift.x, lift.y, lift.z],
            orientation: { target: [flat.x, flat.y, flat.z, flat.w], seconds: goal.bearing ? T.plant : T.swing } });
        }
      });
      const tracked = tracker.step(own.muscles, command.posture, dt, false, true);
      motor.control(command, dt, i => snap.tracked(i) ?? tracked(i));
    }, release() { tracker.reset(); for (const s of skills) s.resume(view); }, resume() { motor.resume(); tracker.reset(); for (const s of skills) s.resume(view); } };
    return { host, subs: [recover(own, motor, tracker, PAWS.map(p => p.segment), view)], down };
  });
  return { kind: "quadruped" as const, body, state: {} };
}
