import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { OwnBody } from "../mind/mind.ts";
import type { SubMind } from "../mind/sub-mind.ts";
import type { effectorTracker } from "../control/effector-tracker.ts";
import type { supportedMotor, SupportEndpoint } from "../control/supported-motor.ts";
import { chainTo, rootFrameToRef, intoFrameToRef } from "../control/kinematics.ts";
import { channelName } from "../muscle/driver.ts";
import { groundContact, turnOfToRef } from "../control/support.ts";
import { servo } from "../control/servo.ts";
import { atan2, cos, hypot, sin } from "../math/real.ts";
import { soleGoal, type QuadrupedView } from "./crawl.ts";
import { REPTILE_CRAWL, REPTILE_MOTOR, REPTILE_RECOVERY as T } from "./tuning.ts";

/** A leg's joints by their place in the chain from the trunk out to its paw. */
const HIP = 0, KNEE = 1;

/**
 * Grounded righting, clear leg routes, and a quiet supported handover to the crawl. Each leg is
 * the chain from the trunk out to its paw (`paws`): a hip, a knee and an ankle. Its side and its
 * end are where its paw is in the reference pose: +x is the body's right, +z its front.
 */
export function recover(own: OwnBody, motor: ReturnType<typeof supportedMotor>, tracker: ReturnType<typeof effectorTracker>, endpoints: readonly SupportEndpoint[], view: QuadrupedView): SubMind {
  const names = endpoints.map(e => e.segment), paws = names.map(name => own.built.segments.get(name)!);
  const legs = paws.map(paw => {
    const chain = chainTo(own.built, paw);
    if (chain.length !== 3) throw new Error(`${paw.spec.name}'s leg has ${chain.length} joints, not a hip, a knee and an ankle`);
    return chain;
  });
  const supports = legs.map(chain => chain.map(joint => joint.child).reverse());
  const parts = [...own.built.segments.values()];
  const hip = legs.map(chain => own.muscles.channel(channelName(chain[HIP]!, 2))), knee = legs.map(chain => own.muscles.channel(channelName(chain[KNEE]!, 0)));
  const sign = paws.map(paw => paw.frame.origin[0] < 0 ? 1 : -1), fore = paws.map(paw => paw.frame.origin[2] > 0 ? 1 : -1);
  const channels = own.muscles.channels.map(channel => {
    const leg = legs.findIndex(chain => chain.includes(channel.joint));
    return { leg, joint: leg < 0 ? -1 : legs[leg]!.indexOf(channel.joint), axis: channel.index };
  });
  const reference = own.spec.segments.reduce((sum, part) => sum + part.mass.value * part.centreOfMass.value[1], 0) / own.spec.mass.value;
  const state = { phase: "idle" as "idle" | "roll" | "place" | "rise", route: "start" as "start" | "sweep" | "fold" | "unwind" | "unfold" | "press",
    time: 0, elapsed: 0, stable: 0, paw: 0, yaw: 0, ground: 0, sequence: 0, retries: 0,
    placed: names.map(() => false), held: names.map(() => 0), loaded: names.map(() => false), direction: [...fore],
    command: { centre: [0, reference * REPTILE_CRAWL.crawlHeight, 0] as [number, number, number], velocity: [0, 0, 0] as [number, number, number],
      rotation: [0, 0, 0, 1] as [number, number, number, number], posture: {} as Record<string, number>,
      endpoints: names.map(() => ({ target: [0, 0, 0] as [number, number, number], bearing: false, rotation: [0, 0, 0, 1] as [number, number, number, number] })) } };
  const turn = new Quaternion(), heading = new Quaternion(), inverse = new Quaternion(), flat = new Quaternion();
  const vertical = new Vector3(0, 1, 0), lateral = new Vector3(1, 0, 0), forward = new Vector3(0, 0, 1), up = new Vector3(), side = new Vector3(), front = new Vector3(), spin = new Vector3(), moment = new Vector3();
  const point = new Vector3(), descending = new Vector3(), frame = { position: new Vector3(), rotation: new Quaternion() };
  const readTurn = () => { turnOfToRef(motor.root, turn); vertical.applyRotationQuaternionToRef(turn, up); lateral.applyRotationQuaternionToRef(turn, side); forward.applyRotationQuaternionToRef(turn, front); };
  const begin = () => {
    tracker.reset(); motor.resume(); readTurn(); state.phase = up.y >= T.rollUpright ? "place" : "roll";
    state.route = "start"; state.time = 0; state.elapsed = 0; state.stable = 0; state.paw = 0; state.sequence++;
    state.placed.fill(false); state.held.fill(0);
  };
  const nextRoute = (route: typeof state.route) => { state.route = route; state.time = 0; };
  const startRise = () => {
    state.phase = "rise"; state.time = 0; state.elapsed = 0; state.sequence++; tracker.reset(); motor.resume(); state.yaw = view.yaw;
    heading.set(0, sin(state.yaw / 2), 0, cos(state.yaw / 2)).multiplyToRef(motor.root.rest, turn);
    state.command.rotation.splice(0, 4, turn.x, turn.y, turn.z, turn.w);
    state.command.centre[0] = view.feet.reduce((sum, foot) => sum + foot.at.x / names.length, 0);
    state.command.centre[2] = view.feet.reduce((sum, foot) => sum + foot.at.z / names.length, 0);
    state.command.endpoints.forEach((goal, i) => {
      heading.multiplyToRef(paws[i]!.rest, turn); goal.rotation.splice(0, 4, turn.x, turn.y, turn.z, turn.w);
      goal.target.splice(0, 3, view.feet[i]!.at.x, state.ground, view.feet[i]!.at.z);
    });
  };
  return { name: "righting", state, wants: () => view.down || state.phase !== "idle", begin,
    end() { state.phase = "idle"; tracker.reset(); motor.resume(); },
    step(_senses, dt) {
      state.time += dt; state.elapsed += dt;
      let ground = 0, contacts = 0;
      for (const part of parts) for (const contact of own.built.physics.contactsOf(part.body))
        if (groundContact(contact, REPTILE_MOTOR.supportNormal)) { ground += contact.point[1]; contacts++; }
      if (contacts) state.ground = ground / contacts;
      supports.forEach((parts, i) => { state.loaded[i] = parts.some(part => own.built.physics.contactsOf(part.body)
        .some(contact => groundContact(contact, REPTILE_MOTOR.supportNormal))); });
      readTurn();
      if (state.phase === "roll" && up.y >= T.rollUpright && contacts) { state.phase = "place"; state.time = 0; state.elapsed = 0; }
      if (state.phase === "rise") {
        const command = state.command;
        command.centre[1] = state.ground + reference * REPTILE_CRAWL.crawlHeight;
        rootFrameToRef(motor.root, frame); Quaternion.InverseToRef(frame.rotation, inverse);
        inverse.multiplyToRef(heading.set(0, sin(state.yaw / 2), 0, cos(state.yaw / 2)), flat).normalize();
        descending.set(0, -REPTILE_CRAWL.plantSpeed, 0).applyRotationQuaternionToRef(inverse, descending);
        command.endpoints.forEach((goal, i) => {
          goal.bearing = view.feet[i]!.contact;
          if (goal.bearing) tracker.release(names[i]!);
          else { intoFrameToRef(frame, goal.target, point);
            tracker.reach(names[i]!, soleGoal(endpoints[i]!.point, point, T.recoveryPath, state.sequence, descending, flat)); }
        });
        motor.control(command, dt, tracker.step(own.muscles, command.posture, dt, false, true));
        const stable = !view.down && view.centre.y - state.ground >= reference * T.recoveryHeight && view.feet.every(foot => foot.contact && foot.flat)
          && view.velocity.lengthSquared() < T.recoveredSpeed * T.recoveredSpeed;
        state.stable = stable ? state.stable + dt : 0;
        if (state.stable >= T.recovered) state.phase = "idle";
        else if (state.elapsed >= T.recoveryLimit) { state.retries++; begin(); }
        return;
      }
      const size = hypot(up.x, up.z), angle = atan2(size, up.y), gain = size > T.rightingEpsilon ? T.rightingGain * angle / size : 0;
      motor.root.body.angularVelocityToRef(spin);
      // A hip's child torque gives the opposite moment to the trunk. Only a loaded leg supplies
      // this grounded push; the ordinary servo solves the other freedoms around it.
      const bank = size <= T.rightingEpsilon && up.y < 0 ? T.rightingGain * atan2(0, -1) : 0;
      moment.set(gain * up.z + bank * front.x + T.rightingDamping * spin.x, T.rightingDamping * spin.y,
        -gain * up.x + bank * front.z + T.rightingDamping * spin.z);
      const roll = atan2(side.y, up.y), moving = state.phase === "place" ? state.paw : -1;
      if (moving >= 0 && state.route === "start") nextRoute(sign[moving]! * own.muscles.angle(hip[moving]!) < T.wrappedHip ? "unfold" : "sweep");
      servo(own.muscles, i => {
        const { leg, joint, axis } = channels[i]!;
        if (leg < 0) return state.phase === "roll" ? 0 : own.muscles.angle(i);
        const s = sign[leg]!, direction = state.direction[leg]!, h = own.muscles.angle(hip[leg]!), k = own.muscles.angle(knee[leg]!);
        if (state.placed[leg]) {
          if (joint === HIP) return axis === 2 ? state.held[leg]! : 0;
          if (joint === KNEE) return s * T.plantedKnee;
          return axis === 1 ? -state.held[leg]! - k - roll : 0;
        }
        if (leg === moving) {
          let yaw = 0, pitch = 0, hipGoal = h, kneeGoal = s * T.plantedKnee;
          switch (state.route) {
            case "start": break;
            case "sweep": yaw = -s * direction * T.sweepYaw; kneeGoal = k; break;
            case "fold": yaw = -s * direction * T.sweepYaw; pitch = -direction * T.foldHip; kneeGoal = s * T.foldKnee; break;
            case "unwind":
              yaw = s * direction * T.sweepYaw * (1 - 2 * Math.max(0, Math.min(1, (s * h + T.foldHip) / (T.unwindHip + T.foldHip))));
              pitch = -direction * T.foldHip; hipGoal = -s * T.foldHip; kneeGoal = s * T.foldKnee; break;
            case "unfold": hipGoal = -s * T.foldHip; break;
            case "press": hipGoal = h + s * (view.feet[leg]!.at.y - state.ground + T.pressDepth) / T.pressLever; break;
            default: { const never: never = state.route; throw new Error(`unknown placement route ${never}`); }
          }
          if (joint === HIP) return axis === 0 ? yaw : axis === 1 ? pitch : hipGoal;
          if (joint === KNEE) return kneeGoal;
          return axis === 1 ? -h - k - roll : 0;
        }
        if (joint === HIP && state.loaded[leg]) {
          const axis = own.muscles.dynamics.axis(i), torque = moment.x * axis[0] + moment.y * axis[1] + moment.z * axis[2];
          const sense = torque >= 0 ? 1 : -1, strength = own.muscles.strength(i, sense);
          own.muscles.velocity[i] = sense * Infinity; own.muscles.activation[i] = strength > 0 ? Math.min(1, Math.abs(torque) / strength) : 0;
          return undefined;
        }
        return state.phase === "roll" ? 0 : own.muscles.angle(i);
      }, state.phase === "roll" ? REPTILE_MOTOR.posture : T.recoveryServo, dt,
      { seconds: i => channels[i]!.leg === moving ? T.placementServo : state.phase === "roll" ? REPTILE_MOTOR.posture : T.recoveryServo, rate: () => 0, acceleration: () => 0 });
      if (moving >= 0) {
        const s = sign[moving]!, near = (joint: number, axis: number, target: number) =>
          Math.abs(own.muscles.angle(own.muscles.channel(channelName(legs[moving]![joint]!, axis))) - target) < T.placementError;
        if (state.route === "sweep" && state.time >= T.foldWait && near(HIP, 0, -s * state.direction[moving]! * T.sweepYaw)) nextRoute("fold");
        else if (state.route === "fold" && state.time >= T.foldWait && !view.feet[moving]!.contact && view.feet[moving]!.low - state.ground > REPTILE_MOTOR.contactMargin) nextRoute("unwind");
        else if (state.route === "unwind" && near(HIP, 2, -s * T.foldHip)) nextRoute("unfold");
        else if (state.route === "unfold" && near(KNEE, 0, s * T.plantedKnee) && near(HIP, 1, 0)) nextRoute("press");
        if (state.route === "press" && state.time >= T.pressWait && view.feet[moving]!.contact) {
          state.placed[moving] = true; state.held[moving] = own.muscles.angle(hip[moving]!); state.paw++; nextRoute("start");
          if (state.paw === names.length) startRise();
        }
        if (state.phase === "place" && state.time >= T.routeLimit) {
          state.direction[moving] *= -1; state.retries++; nextRoute("sweep");
        }
      }
      if (state.elapsed >= T.recoveryLimit) { state.retries++; begin(); }
    } };
}
