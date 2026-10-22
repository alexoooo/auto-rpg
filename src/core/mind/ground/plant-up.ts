import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import poses from "../../../../assets/research/posture-holds.json" with { type: "json" };
import type { BodyView } from "../../body.ts";
import { bearLimbs, carryRoot, limbMotion, makeBearing } from "../../control/bearing.ts";
import { uprightness } from "../../control/ground.ts";
import type { MindKit } from "../kit.ts";
import { servoAsk, servoSolve } from "../../control/servo.ts";
import { turnOfToRef } from "../../control/support.ts";
import { atan2 } from "../../math/real.ts";
import { spinBetweenToRef, turnAboutToRef } from "../../math/turn.ts";
import { humanSpec } from "../../human/spec.ts";
import { deepFreeze } from "../../state.ts";
import type { BodySpec } from "../../spec/body.ts";
import type { Clock } from "../../clock.ts";
import type { Pose } from "../../control/motor.ts";
import type { OwnBody } from "../mind.ts";
import { riseLimbs, type RiseLimbs } from "../rise/limbs.ts";
import { RISE } from "../rise/stages.ts";
import { standReady, type GroundReading, type Position } from "./reading.ts";
import { phaseClock, poseDrive, REACHED_SECONDS, type TechniqueEnd, type TechniqueRun } from "./techniques.ts";

type Phase = "brace" | "plant" | "transfer" | "rise" | "steady";
interface PlantUpTuning {
  readonly within: number; readonly top: number; readonly response: number;
  readonly plantLoad: number; readonly transferLoad: number; readonly height: number; readonly pitch: number;
  readonly posture: Readonly<Partial<Record<Phase, Readonly<Record<string, number>>>>>;
}

/** Initial pose-drive and bearing choices; only the search's control settings vary, never acceptance. */
export const PLANT_UP: PlantUpTuning = deepFreeze({ within: .2, top: 3, response: .35,
  plantLoad: .12, transferLoad: .6, height: .65, pitch: .6, posture: {} });

/** Installed anatomical targets share their channel zero across models, even when their bind differs; the rise and the steady stand end in `guard`, the arms' rest. */
export function plantPostures(spec: BodySpec, guard: Pose) {
  const reference = humanSpec("workshop-fighter");
  const named = (id: string): Readonly<Record<string, number>> => {
    const pose = poses.find(p => p.model === reference.model && p.id === id)!;
    return Object.fromEntries(reference.joints.flatMap(j => j.dofs.map((d, k) =>
      [`${j.name} ${d.positive}`, (pose.placement.joints as Record<string, number[]>)[j.name]![k]! + d.bind.value])));
  };
  const brace = named("fours"), half = named("half-kneel");
  const plant = { ...brace };
  for (const [channel, angle] of Object.entries(half)) if (channel.startsWith("hip.left ") || channel.startsWith("knee.left ") || channel.startsWith("ankle.left ")) plant[channel] = angle;
  const rest = Object.fromEntries(spec.joints.flatMap(j => j.dofs.map(d => [`${j.name} ${d.positive}`,
    (guard[`${j.name} ${d.positive}`] ?? 0) + d.bind.value])));
  return deepFreeze({ brace, plant, transfer: named("squat"), rise: rest, steady: rest });
}

/** One route with retained hand support, a flat lead foot, weight transfer, extension and quiet standing. */
export function plantUp(own: OwnBody, view: BodyView, _clock: Clock, kit: MindKit, tuning: PlantUpTuning = PLANT_UP): TechniqueRun {
  const muscles = own.muscles, postures = plantPostures(own.spec, kit.posture), drive = poseDrive(muscles), clock = phaseClock();
  const phases: readonly Phase[] = ["brace", "plant", "transfer", "rise", "steady"];
  const goals = Object.fromEntries(phases.map(phase => [phase, deepFreeze({ ...postures[phase], ...Object.fromEntries(
    Object.entries(tuning.posture[phase] ?? {}).map(([name, offset]) => [name, (postures[phase][name] ?? 0) + offset])) })])) as Record<Phase, Readonly<Record<string, number>>>;
  const indexed = Object.fromEntries(phases.map(phase => [phase, Float64Array.from(muscles.channels, c =>
    Math.max(c.dof.spec.min.value, Math.min(c.dof.spec.max.value, (goals[phase][c.name] ?? 0) - c.dof.spec.bind.value)))])) as Record<Phase, Float64Array>;
  const parts = own.spec.segments.map(s => s.name), index = (name: string) => parts.indexOf(name);
  const hand = [index("hand.left"), index("hand.right")], shin = [index("shank.left"), index("shank.right")];
  const root = muscles.dynamics.root.segment, low = uprightness(own.built);
  const made: RiseLimbs = riseLimbs(own, RISE);
  const motor = kit.motor(own.built, .1, kit.posture);
  const state = { phase: "brace" as Phase, ended: null as TechniqueEnd | null, begun: false, elapsed: 0, heading: 0,
    initial: Object.fromEntries(muscles.channels.map(c => [c.name, 0])),
    yieldPending: false, clock: clock.state, motor: motor.state,
    bearing: { tasks: made.tasks, memory: made.limbs.map(limb => limb.memory), root: new Float64Array(6),
      helped: { force: new Vector3(), moment: new Vector3() }, held: { channels: [] as number[], z0: [] as number[], Z: [] as number[][] },
      shortfall: { force: new Vector3(), moment: new Vector3() } } };
  // This technique requests no external force, including on bodies whose Balance allows one.
  const solve = makeBearing(null, made.limbs, state.bearing, { effort: true });
  const work = { place: new Vector3(), target: new Vector3(), spin: new Vector3(), rootSpin: new Vector3(), turn: new Quaternion(),
    yaw: new Quaternion(), pitch: new Quaternion(), across: new Vector3(), right: new Vector3(1, 0, 0), moved: new Uint8Array(muscles.channels.length),
    aim: { centre: new Vector3(), spin: new Vector3() } };
  const shares = {
    plant: RISE.limbs.map(l => l.name === "shin.right" ? .5 : l.name.startsWith("hand.") ? .25 : 0),
    transfer: RISE.limbs.map(l => l.name === "foot.left" ? .6 : l.name === "foot.right" ? .1 : l.name.startsWith("hand.") ? .15 : 0),
    rise: RISE.limbs.map(l => l.name.startsWith("foot.") ? .5 : 0),
  };
  const finish = (end: TechniqueEnd) => { state.ended = end; return end; };
  const bearing = (phase: "plant" | "transfer" | "rise", g: GroundReading, dt: number) => {
    const ground = low.lowest(), n = 1 / tuning.response, goal = indexed[phase], weights = shares[phase];
    made.read(ground, true); work.place.setAll(0);
    let total = 0;
    for (let l = 0; l < made.limbs.length; l++) {
      const weight = weights[l]!;
      if (weight > 0 && made.bear(l, goal, n, ground, weight, true)) { work.place.addInPlaceFromFloats(made.over[l]!.x * weight, 0, made.over[l]!.z * weight); total += weight; }
      else made.rest(l);
    }
    if (total > 0) work.place.scaleInPlace(1 / total); else work.place.set(g.centre.x, 0, g.centre.z);
    const height = phase === "plant" ? g.centre.y : ground + view.standing * (phase === "rise" ? .98 : tuning.height);
    work.aim.centre.set(n * n * (work.place.x - g.centre.x) - 2 * n * g.velocity.x,
      n * n * (height - g.centre.y) - 2 * n * g.velocity.y, n * n * (work.place.z - g.centre.z) - 2 * n * g.velocity.z);
    root.body.angularVelocityToRef(work.rootSpin);
    turnAboutToRef(Vector3.UpReadOnly, state.heading, work.yaw);
    turnAboutToRef(work.right, phase === "plant" ? 1.3 : phase === "rise" ? 0 : tuning.pitch, work.pitch);
    work.yaw.multiplyToRef(work.pitch, work.turn).multiplyInPlace(root.rest);
    spinBetweenToRef(root.node.rotationQuaternion!, work.turn, tuning.response, work.spin);
    work.aim.spin.copyFrom(work.spin).scaleInPlace(n).subtractInPlace(work.rootSpin.scaleInPlace(2 * n));
    const asked = servoAsk(muscles, i => goal[i], tuning.within, dt), lever = muscles.dynamics.root.centre[1] - ground;
    const carried = carryRoot(solve, muscles, asked, work.aim, lever);
    limbMotion(solve, asked, work.moved); servoSolve(muscles, asked, carried, work.moved); bearLimbs(solve, muscles, asked, lever, true);
  };
  const reached = (g: GroundReading, to: Position) => to === "standing" && standReady({ down: view.down, ground: g });
  return {
    state, get phase() { return state.phase; },
    get yields() { const pending = state.yieldPending; state.yieldPending = false; return pending || state.ended !== null || state.phase === "brace" || state.phase === "steady"; },
    admits(g, side) {
      if (side !== "left" || g.spin >= 8 || g.velocity.lengthSquared() >= 9) return false;
      return g.lie === "front" || g.footLoad[0]! >= .03 || hand.some(i => g.load[i]! >= .03);
    },
    reached,
    begin(side) {
      state.phase = "brace"; state.ended = side === "left" ? null : "failed"; state.begun = false; state.elapsed = 0; state.yieldPending = true;
      clock.reset(); motor.reset();
      for (let i = 0; i < muscles.channels.length; i++) state.initial[muscles.channels[i]!.name] = muscles.angle(i) + muscles.channels[i]!.dof.spec.bind.value;
      turnOfToRef(root, work.turn); work.across.set(1, 0, 0).applyRotationQuaternionToRef(work.turn, work.across);
      state.heading = atan2(-work.across.z, work.across.x);
    },
    end() { finish("interrupted"); },
    step(g, _senses, dt) {
      if (state.ended !== null) return state.ended;
      state.elapsed += dt;
      if (state.elapsed > 8 + 1e-9) return finish("timed-out");
      if (!state.begun) {
        if (!g.load.some(load => load >= .03)) { drive(state.initial, tuning.within, tuning.top); return null; }
        if (g.height > .35 && g.footLoad[0]! >= .03 && g.footLoad[1]! >= .03 && g.footLoad[0]! + g.footLoad[1]! >= .5) state.phase = "rise";
        else if (g.flat[0] && g.footLoad[0]! >= tuning.plantLoad) state.phase = "transfer";
        else if (hand.every(i => g.load[i]! >= .03) && shin.some(i => g.load[i]! >= .03)) state.phase = "plant";
        else if (g.lie === "front" && g.height < .4) state.phase = "brace";
        else {
          if (state.elapsed > 1) return finish("failed");
          drive(state.initial, tuning.within, tuning.top); return null;
        }
        state.begun = true;
      }
      const retainsHands = state.phase !== "plant" || Boolean(g.flat[0]) && g.footLoad[0]! >= .03 || hand.every(i => g.load[i]! >= .03);
      const outer = g.spin < 15 && g.height > .03 && Number.isFinite(g.centre.y) && retainsHands;
      let event: boolean, measure: number | null = null;
      switch (state.phase) {
        case "brace":
          drive(goals.brace, tuning.within, tuning.top);
          event = hand.every(i => g.load[i]! >= .03) && shin.some(i => g.load[i]! >= .03); break;
        case "plant":
          bearing("plant", g, dt); event = Boolean(g.flat[0]) && g.footLoad[0]! >= tuning.plantLoad;
          measure = g.footLoad[0]!; break;
        case "transfer":
          bearing("transfer", g, dt); event = Boolean(g.flat[0] && g.flat[1]) && g.footLoad[0]! + g.footLoad[1]! >= tuning.transferLoad;
          measure = g.footLoad[0]! + g.footLoad[1]!; break;
        case "rise":
          bearing("rise", g, dt); event = g.height >= .85 && g.upright >= .83 && Boolean(g.flat[0] && g.flat[1]);
          measure = g.height; break;
        case "steady":
          motor.stance.read(); motor.setStance({ feet: ["left", "right"], centre: null, height: view.standing - .03, heading: state.heading });
          motor.control(muscles, dt); event = reached(g, "standing"); break;
        default: { const never: never = state.phase; throw new Error(`unknown plant phase ${never}`); }
      }
      const result = clock.step({ inside: outer, event, deadline: state.phase === "brace" ? 3 : 2.5,
        hold: state.phase === "steady" ? REACHED_SECONDS : 0,
        ...(measure === null ? {} : { progress: { value: measure, gain: .02, window: 1.5 } }) }, dt);
      if (result === "done") {
        if (state.phase === "steady") return finish("done");
        state.yieldPending ||= state.phase === "brace";
        state.phase = phases[phases.indexOf(state.phase) + 1]!; clock.reset();
      } else if (result !== null) return finish(result);
      return null;
    },
  };
}
