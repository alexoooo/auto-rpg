import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BodyView } from "../../body.ts";
import type { BodyObservation } from "../../observation.ts";
import type { Side } from "../../spec/body.ts";
import { deepFreeze } from "../../state.ts";
import type { OwnBody } from "../mind.ts";
import { stagedRise } from "./staged.ts";
import { RISE, type Recipe } from "./stages.ts";

/** Bearing response and unloading thresholds are recovery choices within the existing muscle envelope. */
const T = deepFreeze({ transfer: .6, upright: .3, limit: 6, footShare: .6, shinShare: .4, pitch: .2,
  unloaded: 2, minUp: .9, speed: .1, rootSpeed: .2, hold: .1 });

/** The hands' measured floor load is below the unloading threshold. */
export function halfKneelHandsReleased(o: BodyObservation, dt: number): boolean {
  if (!(dt > 0) || !Number.isFinite(dt)) return false;
  return o.contacts.filter(c => c.fixed !== null && -c.normal[1] >= T.minUp && c.segment.startsWith("hand."))
    .reduce((n, c) => n + c.impulse / dt, 0) < T.unloaded;
}

/** A captured supported posture transfers load before the native upright half-kneel asks for its seed. */
export function supportedHalfKneel(own: OwnBody, view: BodyView) {
  const parts = [...own.built.segments.values()], mass = parts.reduce((n, p) => n + p.rigid.mass, 0),
    centre = new Vector3(), velocity = new Vector3(), point = new Vector3();
  const bearingView: BodyView = { ...view, get down() { return view.down; }, stance: { ...view.stance, centre, velocity } };
  const half = RISE.rise.find(stage => stage.name === "half kneel")!.posture as Readonly<Record<string, number>>;
  const make = (lead: Side) => {
    const rear = lead === "left" ? "right" : "left", mirrored = lead === "left" ? half
      : Object.fromEntries(Object.entries(half).map(([name, angle]) => [name.replace(".left ", ".@ ").replace(".right ", ".left ").replace(".@ ", ".right "),
        /lateral flexion right|rotation right/.test(name) ? -angle : angle]));
    const posture = Object.fromEntries(own.muscles.channels.map(c => [c.name,
      Math.max(c.dof.spec.min.value + c.dof.spec.bind.value,
        Math.min(c.dof.spec.max.value + c.dof.spec.bind.value, mirrored[c.name] ?? c.dof.spec.bind.value))]));
    const on = [{ limb: `foot.${lead}`, share: T.footShare }, { limb: `shin.${rear}`, share: T.shinShare }];
    const recipe: Recipe = { ...RISE, rise: [
      { kind: "bear", name: "supported half-kneel transfer", on, leave: ["hand.left", "hand.right"], overProp: false,
        height: null, pitch: null, posture, seconds: T.transfer, limit: T.limit },
      { kind: "bear", name: "supported upright half-kneel", on, leave: [], overProp: false,
        height: null, pitch: T.pitch, posture, seconds: T.upright, limit: T.limit },
    ] };
    return stagedRise(own, bearingView, recipe);
  };
  const left = make("left"), right = make("right"), zero = new Vector3();
  const state = { active: false, lead: "left" as Side, quiet: 0, left: left.state, right: right.state };
  const current = () => state.lead === "left" ? left : right;
  return { state,
    reset() { state.active = false; state.quiet = 0; left.end(); right.end(); },
    begin(lead: Side) {
      const target = lead === "left" ? left : right;
      target.beginSupported(Object.fromEntries(own.muscles.channels.map((c, i) => [c.name,
        Math.max(c.dof.spec.min.value, Math.min(c.dof.spec.max.value, own.muscles.angle(i))) + c.dof.spec.bind.value])));
      state.lead = lead; state.quiet = 0; state.active = true;
    },
    step(o: BodyObservation, dt: number) {
      if (!state.active || !(dt > 0) || !Number.isFinite(dt)) throw new Error("invalid supported half-kneel step");
      centre.setAll(0); velocity.setAll(0);
      for (const part of parts) {
        const s = o.segments.find(s => s.name === part.spec.name)!;
        centre.addInPlace(point.set(...s.centre).scaleInPlace(part.rigid.mass / mass));
        velocity.addInPlace(point.set(...s.velocity).scaleInPlace(part.rigid.mass / mass));
      }
      current().step(view.senses, dt); own.assist.ask(zero, zero);
      const root = o.segments.find(s => s.name === "lowerTrunk")!;
      state.quiet = halfKneelHandsReleased(o, dt) && velocity.lengthSquared() < T.speed * T.speed
        && root.spin.reduce((n, v) => n + v * v, 0) < T.rootSpeed * T.rootSpeed ? state.quiet + dt : 0;
    },
    get released() { return state.quiet >= T.hold; },
  };
}
