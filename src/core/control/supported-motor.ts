import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { OwnBody } from "../mind/mind.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { frameOf } from "../spec/body.ts";
import { lowsOf } from "./ground.ts";
import { chainTo } from "./kinematics.ts";
import { bearLimbs, carryRoot, limbMotion, makeBearing, type Limb } from "./bearing.ts";
import { groundContact, massCentreToRef, massOf, motionAtToRef, pointOfToRef } from "./support.ts";
import { servoAsk, servoSolve } from "./servo.ts";
import { spinBetweenToRef } from "../math/turn.ts";
import { channelName } from "../muscle/driver.ts";

/** Named anatomical endpoints; no assumption about the number or names of supporting limbs. */
export interface SupportEndpoint { readonly segment: string; readonly point: string; readonly sole?: boolean }

/** Physical acceleration goals, interpreted through the body's own muscles and contact patches. */
export interface SupportedCommand {
  readonly centre: Vec3;
  readonly velocity: Vec3;
  readonly rotation: readonly [number, number, number, number];
  readonly endpoints: readonly { readonly target: Vec3; readonly bearing: boolean; readonly rotation?: readonly [number, number, number, number] }[];
  readonly posture: Readonly<Record<string, number>>;
}

/** Response settings are controller inputs, separate from anatomical strength. */
interface Response { readonly centre: number; readonly endpoint: number; readonly turn: number; readonly posture: number; readonly lever: number; readonly damping: number; readonly rootMotion: number; readonly supportNormal: number; readonly contactMargin: number }

/** Arbitrary support chains share the ordinary floating-base bearing solve and joint servo. */
export function supportedMotor(own: OwnBody, endpoints: readonly SupportEndpoint[], response: Response) {
  const { built, muscles } = own, root = muscles.dynamics.root.segment;
  if (!endpoints.length || new Set(endpoints.map(e => e.segment)).size !== endpoints.length) throw new Error("support endpoints must be distinct");
  const definitions = endpoints.map(e => {
    const segment = built.segments.get(e.segment), point = segment?.spec.points?.[e.point]?.value;
    if (!segment || !point) throw new Error(`unknown support endpoint ${e.segment}/${e.point}`);
    const chain = chainTo(built, segment);
    const channels = chain.flatMap(j => j.dofs.map((_, k) => muscles.channel(channelName(j, k))));
    const shape = segment.spec.shape;
    if (e.sole && shape.kind !== "box") throw new Error("a rectangular support sole needs a box");
    return { segment, point, channels, stem: [] as number[], lows: lowsOf(shape, frameOf(segment.spec)), sole: e.sole && shape.kind === "box" ? { width: shape.size.value[0] / 2, length: shape.size.value[2] / 2 } : null };
  });
  const uses = new Map<number, number>();
  for (const definition of definitions) for (const channel of definition.channels) uses.set(channel, (uses.get(channel) ?? 0) + 1);
  for (const definition of definitions) {
    const shared = definition.channels.findIndex(channel => uses.get(channel) === 1);
    if (shared < 0) throw new Error("support endpoints need separate terminal chains");
    definition.stem = definition.channels.slice(0, shared);
    definition.channels = definition.channels.slice(shared);
  }
  const state = {
    centre: new Vector3(), velocity: new Vector3(),
    motion: { started: false, velocity: new Float64Array(6), acceleration: new Float64Array(6) },
    endpoints: definitions.map(() => ({ at: new Vector3(), velocity: new Vector3(), contactAt: new Vector3(), contactVelocity: new Vector3(), contact: false, flat: false, low: 0, ground: 0 })),
    tasks: definitions.map(d => ({ on: true, bearing: false, linear: new Vector3(), angular: new Vector3(), accel: new Float64Array(d.channels.length) })),
    aim: { centre: new Vector3(), spin: new Vector3(), root: new Float64Array(6) },
    helped: { force: new Vector3(), moment: new Vector3() }, held: { channels: [] as number[], z0: [] as number[], Z: [] as number[][] },
    shortfall: { force: new Vector3(), moment: new Vector3() },
  };
  const soles = definitions.map((d, i) => d.sole ? { kind: "sole" as const, middle: state.endpoints[i]!.at, along: new Vector3(), ...d.sole } : null);
  const points = definitions.map((_d, i) => ({ kind: "point" as const, at: state.endpoints[i]!.contactAt }));
  const positionRows: Limb["work"]["rows"] = [[[3, 1]], [[4, 1]], [[5, 1]]];
  const toward = definitions.map(d => d.channels.map(() => 0));
  const limbs: Limb[] = definitions.map((d, i) => ({ segment: d.segment, memory: { channels: d.channels }, stem: d.stem, reach: response.lever,
    task: state.tasks[i]!, work: { at: state.endpoints[i]!.contactAt, rows: positionRows, ahead: d.channels.map(() => NaN),
      toward: toward[i]!, patch: points[i]!, share: 1 } }));
  const bearing = makeBearing(own.assist, limbs, { root: state.aim.root, helped: state.helped, held: state.held, shortfall: state.shortfall }, { effort: true, damping: response.damping });
  const parts = [...built.segments.values()], mass = massOf(parts);
  const scratch = { at: new Vector3(), velocity: new Vector3(), angular: new Vector3(), target: new Quaternion(), moved: new Uint8Array(muscles.channels.length) };
  const read = () => {
    massCentreToRef(parts, mass, state.centre, scratch.at, state.velocity);
    definitions.forEach((d, i) => {
      const e = state.endpoints[i]!;
      pointOfToRef(d.segment, d.point, e.at);
      motionAtToRef(d.segment, e.at, e.velocity, scratch.angular);
      e.contactAt.setAll(0);
      let impulse = 0;
      for (const c of built.physics.contactsOf(d.segment.body)) if (groundContact(c, response.supportNormal)) {
        e.contactAt.x += c.point[0] * c.impulse; e.contactAt.y += c.point[1] * c.impulse; e.contactAt.z += c.point[2] * c.impulse; impulse += c.impulse;
      }
      e.contact = impulse > 0;
      e.low = Infinity;
      for (const low of d.lows) { pointOfToRef(d.segment, low.at, scratch.at); e.low = Math.min(e.low, scratch.at.y - low.radius); }
      if (impulse) { e.contactAt.scaleInPlace(1 / impulse); e.ground = e.contactAt.y; } else e.contactAt.copyFrom(e.at);
      motionAtToRef(d.segment, e.contactAt, e.contactVelocity, scratch.angular);
      scratch.at.set(0, 1, 0).applyRotationQuaternionToRef(d.segment.node.rotationQuaternion!, scratch.velocity);
      e.flat = e.contact && Math.abs(scratch.velocity.y) >= response.supportNormal && Math.abs(e.at.y - e.contactAt.y) <= response.contactMargin;
      const sole = soles[i];
      if (sole) {
        scratch.at.set(0, 0, 1).applyRotationQuaternionToRef(d.segment.node.rotationQuaternion!, sole.along);
        sole.along.y = 0; sole.along.normalize();
      }
    });
  };
  read();
  return { state, root, read, resume() { state.motion.started = false; state.motion.acceleration.fill(0); }, control(command: SupportedCommand, dt: number, tracked: (channel: number) => readonly [number, number, number] | undefined = () => undefined, timing: Pick<Response, "centre" | "endpoint" | "turn" | "posture"> = response) {
    if (command.endpoints.length !== limbs.length) throw new Error("support goal count differs from anatomy");
    const nc = 1 / timing.centre, ne = 1 / timing.endpoint, nt = 1 / timing.turn;
    state.aim.centre.set(...command.centre).subtractInPlace(state.centre).scaleInPlace(nc * nc);
    scratch.velocity.set(...command.velocity).subtractInPlace(state.velocity).scaleInPlace(2 * nc);
    state.aim.centre.addInPlace(scratch.velocity);
    scratch.target.set(...command.rotation);
    spinBetweenToRef(root.node.rotationQuaternion!, scratch.target, timing.turn, state.aim.spin);
    state.aim.spin.scaleInPlace(nt).subtractInPlace(root.body.angularVelocityToRef(scratch.angular).scaleInPlace(2 * nt));
    limbs.forEach((limb, i) => {
      const goal = command.endpoints[i]!, actual = state.endpoints[i]!, task = limb.task;
      task.bearing = goal.bearing && actual.contact; task.on = task.bearing;
      task.linear.copyFrom(actual.contactVelocity).scaleInPlace(-2 * ne);
      limb.work.rows = goal.rotation || actual.flat && soles[i] ? null : positionRows;
      limb.work.patch = actual.flat && soles[i] ? soles[i]! : points[i]!;
      task.angular.copyFrom(limb.segment.body.angularVelocityToRef(scratch.angular)).scaleInPlace(-2 * ne);
      if (goal.rotation) {
        scratch.target.set(...goal.rotation);
        spinBetweenToRef(limb.segment.node.rotationQuaternion!, scratch.target, timing.endpoint, scratch.angular);
        task.angular.addInPlace(scratch.angular.scaleInPlace(ne));
      }
    });
    const work = servoAsk(muscles, i => tracked(i)?.[0] ?? command.posture[muscles.channels[i]!.name] ?? 0, timing.posture, dt,
      { rate: i => tracked(i)?.[1] ?? 0, acceleration: i => tracked(i)?.[2] ?? 0 });
    definitions.forEach((d, i) => { for (let k = 0; k < d.channels.length; k++) toward[i]![k] = work.accel[d.channels[k]!]!; });
    carryRoot(bearing, muscles, work, state.aim, response.lever);
    limbMotion(bearing, work, scratch.moved);
    // A free chain compensates the root motion observed in physics. The support plan's root
    // acceleration is an ask; using it as achieved motion drives a free paw away when support yields.
    const motion = state.motion, weight = dt / (response.rootMotion + dt);
    root.body.angularVelocityToRef(scratch.angular); root.body.linearVelocityToRef(scratch.velocity);
    for (let k = 0; k < 6; k++) {
      const v = k === 0 ? scratch.angular.x : k === 1 ? scratch.angular.y : k === 2 ? scratch.angular.z
        : k === 3 ? scratch.velocity.x : k === 4 ? scratch.velocity.y : scratch.velocity.z;
      const acceleration = motion.started ? (v - motion.velocity[k]!) / dt : 0;
      motion.acceleration[k] += weight * (acceleration - motion.acceleration[k]!);
      motion.velocity[k] = v;
    }
    motion.started = true;
    servoSolve(muscles, work, motion.acceleration, scratch.moved);
    bearLimbs(bearing, muscles, work, response.lever, true);
  } };
}
