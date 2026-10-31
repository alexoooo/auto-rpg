import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { SupportEndpoint } from "../control/supported-motor.ts";
import { uprightness } from "../control/ground.ts";
import { effectorTracker } from "../control/effector-tracker.ts";
import { rootFrameToRef, intoFrameToRef } from "../control/kinematics.ts";
import { motionAtToRef, turnOfToRef } from "../read-motion.ts";
import type { BodyHost } from "../mind/host.ts";
import type { MindWiring } from "../mind/minds.ts";
import type { MindReport } from "../mind/report.ts";
import { hosting, type HostMind } from "../mind/sub-mind.ts";
import type { Senses } from "../mind/senses.ts";
import { atan2, cos, sin } from "../math/real.ts";
import { soleGoal, STAND_TRAVEL, type QuadrupedView, type TravelOrders } from "./crawl.ts";
import { headingAligned } from "./trot.ts";
import { REPTILE_TROT, REPTILE_BITE } from "./tuning.ts";
import { recover } from "./recover.ts";
import type { QuadrupedTacticsMaking } from "./parts.ts";
import { navigatorOf } from "../navigation/navigator.ts";
import type { QuadrupedConfig } from "./config.ts";
import { deepFreeze } from "../state.ts";
import { effectorFeedback } from "../control/effector-feedback.ts";
import { pawsOf } from "../spec/body.ts";

/** **The quadruped's stock parts**: what each of its slots holds where its config names none. */
export const QUADRUPED_PARTS = deepFreeze({
  motor: { kind: "paw-motor" }, travel: { kind: "paw-trot" }, crawl: { kind: "paw-crawl" }, bite: { kind: "jaw-bite" }, tactics: { kind: "stalk" },
});

/**
 * A quadruped mind drives its own support chains through its motor (`QuadrupedConfig.motor`),
 * travelling on one gait and crawling on another, biting with its bite where its tactics say; each
 * part is the one its config names, found by its host (`BodyHost.parts`), or the stock one
 * (`QUADRUPED_PARTS`). It travels where it is ordered by the navigation its config names.
 */
export function quadrupedMind(host: BodyHost, wiring: Partial<MindWiring> & { readonly biteTarget?: QuadrupedTacticsMaking["biteTarget"] }, config: QuadrupedConfig) {
  const orders = wiring.orders ?? ((): null => null), parts = host.parts;
  const biteTuning = deepFreeze({ ...REPTILE_BITE, ...config.tuning?.bite });
  // The paws, in the order the crawl lifts them: the ends the spec says it stands on (`pawsOf`).
  const paws: readonly SupportEndpoint[] = pawsOf(host.spec).map(paw => ({ segment: paw.segment, point: paw.point, sole: paw.sole }));
  // What it publishes of itself (`MindReport`), read from its tactics once its host has made them.
  let published: MindReport | null = null;
  host.take((own) => {
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
    const read = (s: Senses) => {
      motor.read(); feedback.read(); turnOfToRef(motor.root, turn); forward.applyRotationQuaternionToRef(turn, front);
      reading.senses = s; look.yaw = atan2(front.x, front.z); look.down = down();
    };
    const biteConfig = config.bite ?? QUADRUPED_PARTS.bite, tacticsConfig = config.tactics ?? QUADRUPED_PARTS.tactics;
    const snap = parts.of("bite", biteConfig).make(own, tracker, biteTuning, { jaw: feedback.state[lower.spec.name]!, head: feedback.state[head.spec.name]! }, biteConfig);
    const tactics = parts.of("quadruped-tactics", tacticsConfig).make({ own, orders: view => orders(view.senses), navigation: navigatorOf(parts, own.built.spec, config.navigation ?? null), bite: biteTuning,
      ...(wiring.biteTarget ? { biteTarget: wiring.biteTarget } : {}) }, tacticsConfig), skills = [travel, creep, snap];
    const sight = { view, bite: snap.state.cycle };
    published = {
      get engagement() { return { phase: tactics.state.phase ?? (tactics.state.target ? "stalk" : "wait"), focus: tactics.state.target?.foe ?? null, details: [{ label: "Gait", value: gait.kind }] }; },
      prospects: null, get heading() { return look.yaw; }, gait: null, navigation: null, kit: null, actions: null, ended: null, menu: null,
    };
    read(senses()); for (const s of skills) s.resume(view);
    const host: HostMind = { name: "crawl", state: { motor: motor.state, travel: travel.state, crawl: creep.state, gait, bite: snap.state, tactics: tactics.state, tracker: tracker.state, feedback: feedback.state, look }, look: read,
      step(s: Senses, dt: number) { read(s); this.act(dt); }, act(dt: number) {
      const intent = tactics.decide(sight, dt);
      const busy = snap.state.cycle.phase !== null;
      const withdrawing = snap.withdraw();
      const heading = intent.face ?? intent.move;
      const misaligned = gait.reacquire && !headingAligned(view.yaw, heading, REPTILE_TROT.resumeAngle);
      const placing = creep.state.steps < gait.homeAt || misaligned || (creep.state.align ?? 0) > 0;
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
          if (gait.kind === "travel") {
            motionAtToRef(motor.root, target.set(...goal.target), carried, spin);
            descending.set(-carried.x, -T.plantSpeed - carried.y, -carried.z).applyRotationQuaternionToRef(inverse, descending);
          }
          intoFrameToRef(frame, goal.target, target);
          tracker.reach(paw.segment, soleGoal(paw.point, target, goal.bearing ? T.plant : T.swing, active.state.sequence, descending, flat, goal.bearing ? still : lift));
        }
      });
      const tracked = tracker.step(own.muscles, command.posture, dt);
      motor.control(command, dt, i => snap.tracked(i) ?? tracked(i), gait.kind === "crawl" || active.state.standing && active.state.phase === "settle" ? support.hold : support.travel,
        i => snap.response(i) ?? tracker.response(own.muscles.channels[i]!.name));
    }, release() { tactics.state.target = null; tactics.state.pending = 0; tactics.state.phase = null; tracker.reset(); for (const s of skills) s.resume(view); }, resume() {
      tactics.state.target = null; tactics.state.pending = 0; tactics.state.phase = null;
      motor.resume(); tracker.reset(); for (const s of skills) s.resume(view);
      gait.kind = "crawl"; gait.reacquire = true; gait.homeAt = creep.state.steps + paws.length; gait.stable = 0;
    } };
    return hosting(host, [recover(own, motor, tracker, paws, view)]);
  });
  return { state: {}, report: { get engagement() { return published?.engagement ?? null; }, get prospects() { return published?.prospects ?? null; }, get heading() { return published?.heading ?? null; }, gait: null, navigation: null,
    kit: null, actions: null, ended: null, menu: null } satisfies MindReport };
}
