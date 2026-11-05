import type { MainModule, MjData, MjModel } from "@mujoco/mujoco";
import { GRAVITY, type Model, type Shape } from "../model.ts";
import { STRIDE } from "../control.ts";
import { sub, type Q4 } from "../math.ts";
import { conditioningOf, describe, FRICTION, type SceneSpec, type Settings, type Sim } from "./types.ts";

/**
 * **MuJoCo** (`@mujoco/mujoco`, Google DeepMind's official WebAssembly bindings), built from an MJCF
 * string. Reduced coordinates: each model's free root has a free joint, and every spec freedom is a
 * hinge in its child body, in freedom order, so a joint of three freedoms is three hinges composed
 * as the controller's target is (`control.ts`), each limited to the spec's range. The world is
 * y-up with gravity along -y, the ground a plane.
 *
 * The state is read between `mj_step1` and `mj_step2`, so the positions and velocities read are the
 * ones the step integrates from (after a plain `mj_step`, MuJoCo's derived quantities are a step
 * old). Torques go in `xfrc_applied` (world, at the centre of mass). A body's velocity is taken from
 * `cvel`, which is about its tree's centre of mass, moved to its own.
 *
 * Knobs: `solver` (Newton, CG, PGS), `iterations`, `ls_iterations`, `integrator` (Euler,
 * implicitfast, implicit), `cone` (pyramidal, elliptic), `noslip`, `tolerance`, `memory` (MB),
 * `timeconst` (every geom's contact time constant, s), `armature` (kg m2 added to every hinge's
 * inertia: solver conditioning, not anatomy), `threads` (a thread pool of that many
 * threads bound to the data; the threaded build only, which needs cross-origin isolation in a page).
 */
const MUJOCO_DEFAULTS = { solver: "Newton", iterations: 100, ls_iterations: 50, integrator: "Euler", cone: "pyramidal", noslip: 0, tolerance: 1e-8 } as const;

const f = (x: number): string => (Math.abs(x) < 1e-15 ? "0" : x.toPrecision(12));
const vec = (v: readonly number[]): string => v.map(f).join(" ");
/** MuJoCo quaternions are w-first. */
const wxyz = (q: Q4): string => vec([q[3], q[0], q[1], q[2]]);

function geomOf(shape: Shape, friction: number): string {
  const fr = `friction="${f(friction)} 0.005 0.0001"`;
  switch (shape.kind) {
    case "capsule": return `<geom type="capsule" fromto="${vec([...shape.a, ...shape.b])}" size="${f(shape.radius)}" ${fr}/>`;
    case "sphere": return `<geom type="sphere" pos="${vec(shape.centre)}" size="${f(shape.radius)}" ${fr}/>`;
    case "box": return `<geom type="box" pos="${vec(shape.centre)}" quat="${wxyz(shape.rotation)}" size="${vec(shape.half)}" ${fr}/>`;
    default: {
      const never: never = shape;
      throw new Error(`unknown shape ${JSON.stringify(never)}`);
    }
  }
}

function mujocoXml(scene: SceneSpec, settings: Settings): string {
  const knob = <K extends keyof typeof MUJOCO_DEFAULTS>(k: K): (typeof MUJOCO_DEFAULTS)[K] | string | number | boolean => settings[k] ?? MUJOCO_DEFAULTS[k];
  const dt = 1 / settings.hz / settings.substeps;
  const friction = scene.friction ?? FRICTION;
  const nSeg = scene.models.reduce((n, m) => n + m.segments.length, 0);
  const memory = Number(settings.memory ?? Math.ceil(8 + nSeg * 0.75));
  const out: string[] = [];
  out.push(`<mujoco model="bakeoff"><compiler angle="radian" autolimits="true" inertiafromgeom="false"/>`);
  out.push(`<option timestep="${f(dt)}" gravity="0 ${f(-GRAVITY)} 0" solver="${knob("solver")}" iterations="${knob("iterations")}" ls_iterations="${knob("ls_iterations")}" integrator="${knob("integrator")}" cone="${knob("cone")}" noslip_iterations="${knob("noslip")}" tolerance="${knob("tolerance")}"/>`);
  // A contact's time constant (`solref`'s first number, MuJoCo's default 0.02 s), when a knob sets it.
  const defaults: string[] = [];
  if (settings.timeconst !== undefined) defaults.push(`<geom solref="${f(Number(settings.timeconst))} 1"/>`);
  // Rotor inertia on every hinge (MuJoCo's `armature`), when a knob sets it: solver conditioning.
  if (settings.armature !== undefined) defaults.push(`<joint armature="${f(Number(settings.armature))}"/>`);
  if (defaults.length) out.push(`<default>${defaults.join("")}</default>`);
  out.push(`<size memory="${memory}M"/><worldbody>`);
  if (scene.ground) out.push(`<geom name="ground" type="plane" size="0 0 1" quat="0.707106781187 -0.707106781187 0 0" friction="${f(friction)} 0.005 0.0001"/>`);
  scene.models.forEach((model, mi) => out.push(...bodiesOf(model, mi, scene, friction)));
  out.push(`</worldbody></mujoco>`);
  return out.join("\n");
}

function bodiesOf(model: Model, mi: number, scene: SceneSpec, friction: number): string[] {
  const lines: string[] = [];
  const jointOf = new Map(model.joints.map((j) => [j.child, j]));
  const emit = (s: number, parentCom: readonly number[] | null): void => {
    const seg = model.segments[s]!;
    const k = conditioningOf(scene, seg.name);
    lines.push(`<body name="m${mi}_${seg.name}" pos="${vec(parentCom ? sub(seg.com, parentCom) : seg.com)}">`);
    const joint = jointOf.get(s);
    if (!joint) lines.push(`<freejoint/>`);
    else for (const d of joint.dofs) {
      lines.push(`<joint type="hinge" pos="${vec(sub(joint.centre, seg.com))}" axis="${vec(d.axis)}" range="${f(d.min)} ${f(d.max)}"/>`);
    }
    lines.push(`<inertial pos="0 0 0" quat="${wxyz(seg.inertiaFrame)}" mass="${f(seg.mass)}" diaginertia="${vec(seg.inertia.map((x) => x * k))}"/>`);
    lines.push(geomOf(seg.shape, friction));
    for (const j of model.joints) if (j.parent === s) emit(j.child, seg.com);
    lines.push(`</body>`);
  };
  model.segments.forEach((_, s) => {
    const joint = jointOf.get(s);
    if (!joint || joint.parent < 0) emit(s, null);
  });
  return lines;
}

export function createMujoco(mj: MainModule, scene: SceneSpec, settings: Settings): Sim & { readonly model: MjModel; readonly data: MjData } {
  const xml = mujocoXml(scene, settings);
  const model = mj.MjModel.from_xml_string(xml);
  const data = new mj.MjData(model);
  // A thread pool bound to the data (`mju_threadpool`): the threaded build (`@mujoco/mujoco/mt`) only.
  if (Number(settings.threads ?? 1) > 1) mj.mju_threadpool(data, Number(settings.threads));
  const names = scene.models.flatMap((m, mi) => m.segments.map((s) => `m${mi}_${s.name}`));
  const bodyType = (mj as unknown as { mjtObj: { mjOBJ_BODY: { value: number } } }).mjtObj.mjOBJ_BODY.value;
  const ids = Int32Array.from(names.map((n) => {
    const id = mj.mj_name2id(model, bodyType, n);
    if (id < 0) throw new Error(`MuJoCo has no body ${n}`);
    return id;
  }));
  const rootOf = Int32Array.from(ids, (id) => (model.body_rootid as Int32Array)[id]!);
  let views = viewsOf(data);
  let prepared = false;
  const substeps = settings.substeps;
  return {
    label: `MuJoCo ${describe(settings)}`,
    segments: ids.length,
    model, data,
    prepare() {
      mj.mj_step1(model, data);
      prepared = true;
    },
    read(state) {
      if (views.xipos.length === 0) views = viewsOf(data);
      const { xipos, xquat, cvel, subtreeCom } = views;
      for (let i = 0; i < ids.length; i++) {
        const b = ids[i]!, r = rootOf[i]!, o = i * STRIDE;
        const cx = xipos[3 * b]!, cy = xipos[3 * b + 1]!, cz = xipos[3 * b + 2]!;
        state[o] = cx; state[o + 1] = cy; state[o + 2] = cz;
        state[o + 3] = xquat[4 * b + 1]!; state[o + 4] = xquat[4 * b + 2]!; state[o + 5] = xquat[4 * b + 3]!; state[o + 6] = xquat[4 * b]!;
        const wx = cvel[6 * b]!, wy = cvel[6 * b + 1]!, wz = cvel[6 * b + 2]!;
        const dx = cx - subtreeCom[3 * r]!, dy = cy - subtreeCom[3 * r + 1]!, dz = cz - subtreeCom[3 * r + 2]!;
        state[o + 7] = cvel[6 * b + 3]! + wy * dz - wz * dy;
        state[o + 8] = cvel[6 * b + 4]! + wz * dx - wx * dz;
        state[o + 9] = cvel[6 * b + 5]! + wx * dy - wy * dx;
        state[o + 10] = wx; state[o + 11] = wy; state[o + 12] = wz;
      }
    },
    applyTorques(torques) {
      if (views.xfrc.length === 0) views = viewsOf(data);
      const x = views.xfrc;
      for (let i = 0; i < ids.length; i++) {
        const b = ids[i]!;
        x[6 * b + 3] = torques[3 * i]!; x[6 * b + 4] = torques[3 * i + 1]!; x[6 * b + 5] = torques[3 * i + 2]!;
      }
    },
    step() {
      if (!prepared) mj.mj_step1(model, data);
      mj.mj_step2(model, data);
      prepared = false;
      for (let k = 1; k < substeps; k++) mj.mj_step(model, data);
    },
    dispose() {
      data.delete();
      model.delete();
    },
  };
}

function viewsOf(data: MjData): { xipos: Float64Array; xquat: Float64Array; cvel: Float64Array; subtreeCom: Float64Array; xfrc: Float64Array } {
  return {
    xipos: data.xipos as Float64Array, xquat: data.xquat as Float64Array, cvel: data.cvel as Float64Array,
    subtreeCom: data.subtree_com as Float64Array, xfrc: data.xfrc_applied as Float64Array,
  };
}
