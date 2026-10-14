import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BodyView } from "../../body.ts";
import { bearLimbs, carryRoot, limbMotion, makeBearing } from "../../control/bearing.ts";
import { uprightness } from "../../control/ground.ts";
import { motorControl } from "../../control/motor.ts";
import { servoAsk, servoSolve } from "../../control/servo.ts";
import { turnOfToRef } from "../../control/support.ts";
import { atan2 } from "../../math/real.ts";
import { spinBetweenToRef, turnAboutToRef } from "../../math/turn.ts";
import { guardPosture } from "../../skills/guard.ts";
import { deepFreeze } from "../../state.ts";
import type { OwnBody } from "../mind.ts";
import { riseLimbs } from "../rise/limbs.ts";
import { RISE } from "../rise/stages.ts";
import { armClearance } from "./clearance.ts";
import { standReady, type GroundReading, type Position } from "./reading.ts";
import { phaseClock, poseDrive, REACHED_SECONDS, type TechniqueEnd, type TechniqueRun } from "./techniques.ts";

/** A right hand behind the pelvis and two feet form the preparation's support triangle. */
const POST = deepFreeze({ "hip.left flexion": 1.6, "hip.right flexion": 1.3, "knee.left flexion": 1.8,
  "knee.right flexion": .5, "ankle.left dorsiflexion": .15, "ankle.right dorsiflexion": .15,
  "shoulder.right flexion": -.55, "shoulder.right abduction": .4, "elbow.right flexion": .1,
  "wrist.right flexion": -.8, "shoulder.left flexion": .8, "elbow.left flexion": 1.5,
  "lumbar flexion": .2, "thoracic flexion": .1 });
/** The trailing leg folds and sweeps back while the posted hand keeps carrying weight. */
const SWEEP = deepFreeze({ ...POST, "hip.right flexion": -.15, "hip.right abduction": .3,
  "knee.right flexion": 1.8, "ankle.right dorsiflexion": .3, "hip.left flexion": 1.3, "lumbar flexion": .4 });

/** A technical stand-up on one posted hand; its supports and final standing are measured events. */
export function postUp(own: OwnBody, view: BodyView): TechniqueRun {
  const muscles = own.muscles, drive = poseDrive(muscles), clock = phaseClock(), clear = armClearance(own.built);
  const limbs = riseLimbs(own, RISE), low = uprightness(own.built), motor = motorControl(own.built, .1, guardPosture(own.spec));
  const root = muscles.dynamics.root.segment, hand = own.spec.segments.findIndex(s => s.name === "hand.right");
  const goals = Float64Array.from(muscles.channels, c => Math.max(c.dof.spec.min.value,
    Math.min(c.dof.spec.max.value, (SWEEP[c.name as keyof typeof SWEEP] ?? 0) - c.dof.spec.bind.value)));
  const goal = (i: number) => goals[i];
  const state = { phase: "post" as "post" | "sweep" | "rise", elapsed: 0, ended: null as TechniqueEnd | null, heading: 0,
    yieldPending: true, clock: clock.state, motor: motor.state,
    bearing: { tasks: limbs.tasks, memory: limbs.limbs.map(l => l.memory), root: new Float64Array(6),
      helped: { force: new Vector3(), moment: new Vector3() }, held: { channels: [] as number[], z0: [] as number[], Z: [] as number[][] },
      shortfall: { force: new Vector3(), moment: new Vector3() } } };
  const solve = makeBearing(null, limbs.limbs, state.bearing, { effort: true });
  const work = { place: new Vector3(), spin: new Vector3(), rotation: new Quaternion(), axis: new Vector3(1, 0, 0),
    pitch: new Quaternion(), yaw: new Quaternion(), across: new Vector3(), angular: new Vector3(),
    aim: { centre: new Vector3(), spin: new Vector3() }, moved: new Uint8Array(muscles.channels.length) };
  const shares = RISE.limbs.map(l => l.name === "hand.right" ? .35 : l.name === "foot.left" ? .45 : l.name === "foot.right" ? .2 : 0);
  const reached = (g: GroundReading, to: Position) => to === "standing" && standReady({ down: view.down, ground: g });
  return {
    state, get phase() { return state.phase; },
    get yields() { const value = state.yieldPending; state.yieldPending = false; return value || state.ended !== null || state.phase === "post"; },
    admits(g, side) { return side === "left" && g.height < .7 && g.upright > .3 && g.spin < 2 && g.velocity.lengthSquared() < .25 && clear(); },
    reached,
    begin(side) {
      state.phase = "post"; state.elapsed = 0; state.ended = side === "left" ? null : "failed"; state.yieldPending = true;
      clock.reset(); motor.reset(); turnOfToRef(root, work.rotation);
      work.across.set(1, 0, 0).applyRotationQuaternionToRef(work.rotation, work.across); state.heading = atan2(-work.across.z, work.across.x);
    },
    end() { state.ended = "interrupted"; },
    step(g, _senses, dt) {
      if (state.ended) return state.ended;
      state.elapsed += dt;
      if (state.elapsed > 8) return state.ended = "timed-out";
      let event = false, inside = g.spin < 12 && g.height > .03;
      switch (state.phase) {
        case "post":
          drive(POST); event = g.load[hand]! >= .03 && g.footLoad[0]! >= .03 && g.footLoad[1]! >= .03; break;
        case "sweep": {
          const ground = low.lowest(), response = .4, n = 1 / response;
          limbs.read(ground, true); work.place.setAll(0); let total = 0;
          for (let i = 0; i < limbs.limbs.length; i++) {
            const share = shares[i]!;
            if (share && limbs.bear(i, goals, n, ground, share, true)) {
              work.place.addInPlaceFromFloats(limbs.over[i]!.x * share, 0, limbs.over[i]!.z * share); total += share;
            } else limbs.rest(i);
          }
          if (total) work.place.scaleInPlace(1 / total); else work.place.set(g.centre.x, 0, g.centre.z);
          work.aim.centre.set(n * n * (work.place.x - g.centre.x) - 2 * n * g.velocity.x,
            n * n * (ground + .6 * view.standing - g.centre.y) - 2 * n * g.velocity.y,
            n * n * (work.place.z - g.centre.z) - 2 * n * g.velocity.z);
          turnAboutToRef(Vector3.UpReadOnly, state.heading, work.yaw); turnAboutToRef(work.axis, .5, work.pitch);
          work.yaw.multiplyToRef(work.pitch, work.rotation).multiplyInPlace(root.rest);
          spinBetweenToRef(root.node.rotationQuaternion!, work.rotation, response, work.spin); root.body.angularVelocityToRef(work.angular);
          work.aim.spin.copyFrom(work.spin).scaleInPlace(n).subtractInPlace(work.angular.scaleInPlace(2 * n));
          const asked = servoAsk(muscles, goal, .2, dt), lever = muscles.dynamics.root.centre[1] - ground;
          const carried = carryRoot(solve, muscles, asked, work.aim, lever);
          limbMotion(solve, asked, work.moved); servoSolve(muscles, asked, carried, work.moved); bearLimbs(solve, muscles, asked, lever, true);
          event = Boolean(g.flat[0] && g.flat[1]) && g.footLoad[0]! + g.footLoad[1]! >= .7;
          inside &&= g.load[hand]! >= .03 || event; break;
        }
        case "rise":
          motor.stance.read(); motor.setStance({ feet: ["left", "right"], centre: null, height: view.standing - .03, heading: state.heading });
          motor.control(muscles, dt); event = reached(g, "standing"); break;
        default: { const never: never = state.phase; throw new Error(`unknown post-up phase ${never}`); }
      }
      const result = clock.step({ inside, event, deadline: 3, hold: state.phase === "rise" ? REACHED_SECONDS : 0 }, dt);
      if (result === "done" && state.phase !== "rise") { state.phase = state.phase === "post" ? "sweep" : "rise"; clock.reset(); }
      else if (result) state.ended = result;
      return state.ended;
    },
  };
}
