import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Assist } from "../control/assist.ts";
import type { BodyView } from "../body.ts";
import { cos, sin } from "../math/real.ts";
import { spinBetweenToRef, turnAboutToRef } from "../math/turn.ts";

/**
 * **What a gait asks of its body's assist** (`Assist`, from the character's balance), each step it
 * drives the legs: a moment on the root that turns the pelvis to the gait's own, facing its heading,
 * leaning as the gait holds it and banked as it banks into a turn, in `settle` s, as a body whose
 * radius of gyration about its centre of mass is `gyration` m would be turned, less what would lean
 * it further forward. So it rights a pelvis tipping forward, to a side or round, and never tips it
 * forward to carry the body along: that pitch is the run's and the walk's own (Node stand, Rapier,
 * 120 Hz, balance 25 %: holding the pitch both ways, the Warrior brakes slower and falls in 7 of 12
 * stops, against 1 with the forward pitch left out, as unassisted). It gives no force: one across the
 * heading toward the walk asked across it, in 0.25 s, held nothing more up.
 * What it asks past the assist's ceiling the assist shortens; a body with no balance is asked nothing.
 */
const GAIT_ASSIST = Object.freeze({ settle: 0.15, gyration: 0.3 });

/** What a gait would have of its root this step: its heading, and its lean forward and its bank to the right, rad. */
interface GaitAim {
  readonly heading: number;
  readonly lean: number;
  readonly bank: number;
}

/** The pelvis's turn as the last step found it, for its spin, and whether there was one: a gait's memory holds it (`src/core/state.ts`). */
export interface GaitAssistMemory {
  root: Quaternion;
  read: boolean;
}

/** The world's right, +x: the axis a pelvis leans forward about; and its forward, +z: the axis it banks about. */
const RIGHT = new Vector3(1, 0, 0), FORWARD = new Vector3(0, 0, 1);

/**
 * The gait assist (`GAIT_ASSIST`) of a body of `mass` kg with `assist`: `ask` asks it for what
 * `aim` wants of the body as `view` finds it, and `rest` forgets the pelvis's turn as the gait gives
 * the legs back.
 */
export function gaitAssist(assist: Assist, mass: number, settings: typeof GAIT_ASSIST = GAIT_ASSIST) {
  const scratch = { force: new Vector3(), moment: new Vector3(), spin: new Vector3(), wanted: new Vector3(), target: new Quaternion(), pitch: new Quaternion(), roll: new Quaternion() };
  return {
    ask(view: BodyView, aim: GaitAim, memory: GaitAssistMemory, dt: number): void {
      const turn = view.root.rotation;
      if (!assist.on) { memory.root.copyFrom(turn); memory.read = true; return; }
      const spin = memory.read ? spinBetweenToRef(memory.root, turn, dt, scratch.spin) : scratch.spin.setAll(0);
      memory.root.copyFrom(turn);
      memory.read = true;
      turnAboutToRef(Vector3.UpReadOnly, aim.heading, scratch.target).multiplyInPlace(turnAboutToRef(RIGHT, aim.lean, scratch.pitch))
        .multiplyInPlace(turnAboutToRef(FORWARD, aim.bank, scratch.roll));
      const wanted = spinBetweenToRef(turn, scratch.target, settings.settle, scratch.wanted);
      const moment = scratch.moment.copyFrom(wanted).subtractInPlace(spin).scaleInPlace(mass * settings.gyration * settings.gyration / settings.settle);
      // About the heading's right, a positive moment leans the pelvis forward: that part is left out.
      const rx = cos(aim.heading), rz = -sin(aim.heading), forward = moment.x * rx + moment.z * rz;
      if (forward > 0) { moment.x -= forward * rx; moment.z -= forward * rz; }
      assist.ask(scratch.force, moment);
    },
    rest(memory: GaitAssistMemory): void { memory.read = false; },
  };
}
