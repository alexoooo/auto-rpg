import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { SERVO_SECONDS, type BodyView } from "../../body.ts";
import { motorControl } from "../../control/motor.ts";
import { recoveryReady } from "../../control/recovery-ready.ts";
import { footStatesOf, readSupport } from "../../control/support.ts";
import { atan2 } from "../../math/real.ts";
import { turnAboutToRef } from "../../math/turn.ts";
import type { BodyObservation } from "../../observation.ts";
import { guardPosture } from "../../skills/guard.ts";
import type { Side } from "../../spec/body.ts";
import type { Vec3 } from "../../spec/quantity.ts";
import { deepFreeze } from "../../state.ts";
import type { OwnBody } from "../mind.ts";
import { stagedRise } from "./staged.ts";
import { RISE, type Recipe } from "./stages.ts";
import { extensionCanStand } from "./supported-extension.ts";

/** Low bearing heights, inward step and settling limits are recovery choices within ordinary muscle strength. */
const T = deepFreeze({ low: .55, raised: .8, response: .35, limit: 4, leadShare: .65,
  stepWidth: .32, stepSeconds: .65, stepLift: .15, standingLower: .03, riseSeconds: 2,
  rootUp: .85, leadUp: .995, speed: .2, minimumLoad: 20, hold: .5, slow: .1, minUpNormal: .9, wideStep: .95 });
const SIDES = ["left", "right"] as const;

/** A half-kneel with boot spacing near a full leg length needs an inward step before standing flat. */
export function lungeNeedsStep(o: BodyObservation, leg: number): boolean {
  if (!(leg > 0) || !Number.isFinite(leg)) return false;
  const left = o.segments.find(s => s.name === "foot.left"), right = o.segments.find(s => s.name === "foot.right");
  if (!left || !right) return false;
  const dx = left.position[0] - right.position[0], dz = left.position[2] - right.position[2];
  return dx * dx + dz * dz > leg * leg * T.wideStep * T.wideStep;
}

/** A wide half-kneel raises on its toe, then brings that foot inward before asking for a flat standing stance. */
export function supportedLunge(own: OwnBody, view: BodyView) {
  const { built, muscles } = own, root = built.segments.get("lowerTrunk")!, feet = footStatesOf(built),
    parts = [...built.segments.values()], mass = parts.reduce((n, p) => n + p.rigid.mass, 0),
    centre = new Vector3(), velocity = new Vector3(), work = new Vector3(), turn = new Quaternion(), inverse = new Quaternion(), zero = new Vector3();
  const bearingView: BodyView = { ...view, get down() { return view.down; }, stance: { ...view.stance, centre, velocity } };
  const half = RISE.rise.find(stage => stage.name === "half kneel")!.posture as Readonly<Record<string, number>>;
  const model = { channels: [], segments: parts.map(p => ({ name: p.spec.name, mass: p.rigid.mass })), rest: [root.rest.x, root.rest.y, root.rest.z, root.rest.w] as [number, number, number, number],
    feet: Object.fromEntries(feet.map(f => {
      const rest = f.segment.rest, up = Vector3.UpReadOnly.applyRotationQuaternionToRef(Quaternion.Inverse(rest), new Vector3());
      return [f.side, { rest: [rest.x, rest.y, rest.z, rest.w] as [number, number, number, number], up: [up.x, up.y, up.z] as Vec3,
        edge: f.ahead.slice(0, 2).map(i => { const p = f.sole[i]!; return [p.x, p.y, p.z] as Vec3; }) as unknown as readonly [Vec3, Vec3] }];
    })) as unknown as
      Readonly<Record<Side, { rest: readonly [number, number, number, number]; up: Vec3; edge: readonly [Vec3, Vec3] }>> };
  const make = (lead: Side) => {
    const rear = lead === "left" ? "right" : "left", seed = lead === "left" ? half
      : Object.fromEntries(Object.entries(half).map(([name, angle]) => [name.replace(".left ", ".@ ").replace(".right ", ".left ").replace(".@ ", ".right "),
        /lateral flexion right|rotation right/.test(name) ? -angle : angle]));
    const posture = Object.fromEntries(muscles.channels.map(c => [c.name, Math.max(c.dof.spec.min.value + c.dof.spec.bind.value,
      Math.min(c.dof.spec.max.value + c.dof.spec.bind.value, seed[c.name] ?? c.dof.spec.bind.value))]));
    const recipe: Recipe = { ...RISE, rise: [T.low, T.raised].map((height, i) => ({ kind: "bear", name: `supported lunge ${i}`,
      on: [{ limb: `foot.${lead}`, share: T.leadShare }, { limb: `foot.${rear}`, share: 1 - T.leadShare }], leave: [], overProp: false,
      height, pitch: null, posture, seconds: T.response, limit: T.limit })) };
    return stagedRise(own, bearingView, recipe);
  };
  const left = make("left"), right = make("right"), motor = motorControl(built, SERVO_SECONDS, guardPosture(own.spec), undefined, own.assist);
  const state = { phase: "inactive" as "inactive" | "raise" | "compact" | "hold" | "ready", lead: "left" as Side,
    time: 0, quiet: 0, height: 0, heading: 0, stepped: false,
    target: [0, 0] as [number, number], left: left.state, right: right.state, motor: motor.state };
  const native = () => state.lead === "left" ? left : right;
  const playing = () => (native().state as { phase: string }).phase;
  const rear = () => state.lead === "left" ? "right" : "left";
  const load = (o: BodyObservation, name: string, dt: number) => o.contacts.filter(c => c.fixed !== null && c.segment === name && -c.normal[1] >= T.rootUp)
    .reduce((n, c) => n + c.impulse / dt, 0);
  const canCompact = (o: BodyObservation, dt: number) => {
    const pelvis = o.segments.find(s => s.name === "lowerTrunk")!, lead = o.segments.find(s => s.name === `foot.${state.lead}`)!;
    turn.set(...pelvis.rotation).multiplyToRef(Quaternion.Inverse(inverse.copyFrom(root.rest)), turn);
    if (work.set(0, 1, 0).applyRotationQuaternionToRef(turn, work).y < T.rootUp) return false;
    if (work.set(...model.feet[state.lead].up).applyRotationQuaternionToRef(turn.set(...lead.rotation), work).y < T.leadUp) return false;
    return SIDES.every(side => load(o, `foot.${side}`, dt) > T.minimumLoad)
      && !o.contacts.some(c => c.fixed !== null && c.impulse > 0 && !/^foot\./.test(c.segment))
      && velocity.lengthSquared() < T.speed * T.speed;
  };
  return { state,
    reset() { state.phase = "inactive"; state.time = 0; state.quiet = 0; state.stepped = false; left.end(); right.end(); motor.reset(); },
    begin(lead: Side) {
      const target = lead === "left" ? left : right;
      target.beginSupported(Object.fromEntries(muscles.channels.map((c, i) => [c.name,
        Math.max(c.dof.spec.min.value, Math.min(c.dof.spec.max.value, muscles.angle(i))) + c.dof.spec.bind.value])));
      state.lead = lead; state.phase = "raise"; state.time = 0; state.quiet = 0; state.stepped = false; motor.reset();
    },
    step(o: BodyObservation, dt: number) {
      if (state.phase === "inactive" || !(dt > 0) || !Number.isFinite(dt)) throw new Error("invalid supported lunge step");
      centre.setAll(0); velocity.setAll(0);
      for (const part of parts) {
        const s = o.segments.find(s => s.name === part.spec.name)!;
        centre.addInPlace(work.set(...s.centre).scaleInPlace(part.rigid.mass / mass));
        velocity.addInPlace(work.set(...s.velocity).scaleInPlace(part.rigid.mass / mass));
      }
      if (state.phase === "raise") {
        if (playing() !== "idle") native().step(view.senses, dt);
        if (playing() === "idle" && canCompact(o, dt)) {
          motor.reset(); motor.stance.read(); state.height = centre.y - motor.stance.reading.support.y;
          turn.copyFrom(root.node.rotationQuaternion!).multiplyToRef(Quaternion.Inverse(inverse.copyFrom(root.rest)), turn);
          work.set(1, 0, 0).applyRotationQuaternionToRef(turn, work); state.heading = atan2(-work.z, work.x);
          turnAboutToRef(Vector3.UpReadOnly, state.heading, turn);
          work.set(rear() === "left" ? -T.stepWidth : T.stepWidth, 0, 0).applyRotationQuaternionToRef(turn, work);
          const at = motor.stance.reading.soles[state.lead]; state.target = [at.x + work.x, at.z + work.z];
          state.phase = "compact"; state.time = 0;
        }
      } else {
        motor.stance.read(); const reading = motor.stance.reading;
        if (state.phase === "compact") {
          if (reading.phase !== "stand") state.stepped = true;
          if (state.stepped && reading.phase === "stand") state.phase = "hold";
        }
        const u = Math.min(1, state.time / T.riseSeconds), height = state.height + (view.standing - T.standingLower - state.height) * u * u * (3 - 2 * u);
        motor.setStance({ feet: SIDES, centre: null, height, heading: state.heading, walk: null,
          ...(state.phase === "compact" ? { swing: { foot: rear(), to: state.target, seconds: T.stepSeconds, lift: T.stepLift, shift: true } } : {}) });
        motor.control(muscles, dt); state.time += dt;
        readSupport(feet, feet, work);
        const supports = feet.map(f => ({ segment: f.segment.spec.name, corners: f.corners.map(c => [c.x, c.y, c.z] as Vec3) }));
        state.quiet = state.phase !== "compact" && extensionCanStand(o, model, dt) && recoveryReady(o, supports, T) ? state.quiet + dt : 0;
        if (state.quiet >= T.hold) state.phase = "ready";
      }
      own.assist.ask(zero, zero);
    },
    get ready() { return state.phase === "ready"; },
  };
}
