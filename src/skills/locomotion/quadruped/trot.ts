import { Quaternion } from "../../../core/math/vector.ts";
import type { Skill } from "../../framework/skill.ts";
import type { SupportedCommand } from "../../../control/supported-motor.ts";
import type { ReadBody, ReadSegment } from "../../../core/bodies/read-body.ts";
import { atan2, cos, sin } from "../../../core/math/real.ts";
import type { Vec3 } from "../../../core/bodies/spec/quantity.ts";
import { REPTILE_TROT } from "./tuning.ts";
import { deepFreeze } from "../../../core/world/state.ts";
import { fitsPaws } from "../../../control/quadruped/fit.ts";
import { type PawGaitPart } from "./parts.ts";
import type { TravelOrders } from "./travel.ts";
import type { PawReading, PawView } from "../../../control/quadruped/paws.ts";
import { chainTo, reachWork, solveReach } from "../../../control/kinematics.ts";

/**
 * Diagonal support pairs carry continuous travel; every counted paw clears and reloads the ground.
 * Each pair stands under the centre of mass (`stanceOf`) and lands led by the travel it will bear
 * through; the trunk goes no faster than its bearing paws' reach lets it, and turns as it travels.
 */
function trot(built: ReadBody, root: ReadSegment, paws: PawReading, names: readonly string[], T = REPTILE_TROT) {
  if (!validTrot(T)) throw new Error("invalid trot settings");
  const nominal = names.map(name => built.segments.get(name)!.spec.points!.sole!.value);
  const mass = built.spec.mass.value, reference = built.spec.segments.reduce((c, p) => {
    const m = p.mass.value / mass, at = p.centreOfMass.value;
    return [c[0] + m * at[0], c[1] + m * at[1], c[2] + m * at[2]] as Vec3;
  }, [0, 0, 0] as Vec3);
  const q = root.pose.rotation;
  const groups = pairsOf(nominal);
  const stance = stanceOf(built, names, nominal, groups, reference, T.lift), room = T.reach * stance.room, neutral = stance.neutral;
  const over: readonly [number, number] = [reference[0] - neutral.reduce((s, n) => s + n[0], 0) / names.length, reference[2] - neutral.reduce((s, n) => s + n[1], 0) / names.length];
  /** The fastest the trot carries the body: a stance's sweep within the room at its cycle. */
  const fastest = 2 * room / (T.swing + T.settle);
  /**
   * Where a free paw lands: its place about the centre, led by the travel until it lands (the last
   * pair's swing and landing took `stride`) and half the time it then bears (a settle, the other
   * pair's swing and landing, and a settle), no further than the room.
   */
  const place = (view: PawView, i: number, ground: number) => {
    const n = neutral[i]!, c = cos(state.yaw), s = sin(state.yaw), x = n[0] - reference[0], z = n[1] - reference[2], v = state.pace;
    const speed = Math.sqrt(v[0] * v[0] + v[2] * v[2]), half = (state.stride + 2 * T.settle) / 2, within = speed * half > room ? room / (speed * half) : 1;
    const ahead = state.stride + half * within;
    state.targets[i]![0] = view.centre.x + c * x + s * z + v[0] * ahead;
    state.targets[i]![1] = ground;
    state.targets[i]![2] = view.centre.z - s * x + c * z + v[2] * ahead;
  };
  const state = {
    phase: "settle" as "settle" | "swing" | "land" | "return", time: 0, stride: T.swing as number, since: 0, paw: 0, steps: 0, placed: 0, sequence: 0, yaw: 0, standing: false,
    centre: [paws.centre.x, reference[1], paws.centre.z] as [number, number, number],
    anchors: paws.feet.map(e => [e.at.x, e.ground, e.at.z] as [number, number, number]),
    targets: paws.feet.map(e => [e.at.x, e.ground, e.at.z] as [number, number, number]),
    liftedPaws: names.map(() => false),
    pace: [0, 0, 0] as [number, number, number],
    command: {
      centre: [paws.centre.x, reference[1], paws.centre.z] as [number, number, number],
      velocity: [0, 0, 0] as [number, number, number], rotation: [q.x, q.y, q.z, q.w] as [number, number, number, number],
      endpoints: paws.feet.map((e, i) => ({ target: [e.at.x, nominal[i]![1], e.at.z] as [number, number, number],
        bearing: true, rotation: [0, 0, 0, 1] as [number, number, number, number] })),
      posture: {} as Record<string, number>,
    },
  };
  const rotation = new Quaternion(), turned = new Quaternion();
  /** A paw is down that touches the floor or rests within `touch` of it. */
  const down = (e: PawView["feet"][number]) => e.contact || e.low - e.ground < T.touch;
  const resume = (view: PawView) => {
    state.phase = "settle"; state.time = 0; state.sequence++; state.yaw = view.yaw; state.standing = false;
    state.centre[0] = view.centre.x; state.centre[2] = view.centre.z;
    state.command.velocity.fill(0); state.pace.fill(0);
    view.feet.forEach((e, i) => { state.anchors[i]![0] = e.at.x; state.anchors[i]![1] = e.ground; state.anchors[i]![2] = e.at.z; });
  };
  const skill: Skill<PawView> & { readonly state: typeof state; readonly fastest: number; command(view: PawView, intent: TravelOrders, dt: number): SupportedCommand } = {
    state, resume, fastest,
    command(view, intent, dt) {
      const face = intent.face ?? intent.move;
      let error = 0;
      if (face && (face.x * face.x + face.z * face.z) > 0) {
        const angle = atan2(face.x, face.z), d = angle - state.yaw;
        error = atan2(sin(d), cos(d));
      }
      const moving = !!intent.move || Math.abs(error) > T.turnError;
      state.time += dt; state.since += dt;
      const free = groups[state.paw]!;
      view.feet.forEach((e, i) => {
        if (e.contact && (!free.includes(i) || state.phase === "settle")) {
          state.anchors[i]![0] = e.at.x; state.anchors[i]![1] = e.ground; state.anchors[i]![2] = e.at.z;
        }
      });
      const average = [0, 0, 0];
      for (const anchor of state.anchors) for (let k = 0; k < 3; k++) average[k] += anchor[k]! / names.length;
      const ground = average[1]!;
      let vx = 0, vz = 0;
      const delayed = state.phase === "return" || state.phase === "land" && state.time >= T.landingWait
        || state.phase === "settle" && state.time >= T.landingWait && !view.feet.every(foot => foot.contact);
      if (intent.move && !delayed) {
        const length = Math.sqrt(intent.move.x * intent.move.x + intent.move.z * intent.move.z);
        // The trunk travels as fast as it faces the way it is ordered, and mostly along itself.
        const facing = length ? Math.max(0, cos(atan2(intent.move.x, intent.move.z) - view.yaw)) : 0;
        const scale = length ? Math.min(T.speed, fastest) * facing * Math.min(1, length) / length : 0;
        vx = intent.move.x * scale; vz = intent.move.z * scale;
        const s = sin(view.yaw), c = cos(view.yaw), sideways = (vx * c - vz * s) * (1 - T.sideways);
        vx -= sideways * c; vz += sideways * s;
      }
      const dvx = vx - state.pace[0], dvz = vz - state.pace[2], change = Math.sqrt(dvx * dvx + dvz * dvz);
      const fraction = change ? Math.min(1, T.acceleration * dt / change) : 0;
      state.pace[0] += fraction * dvx; state.pace[2] += fraction * dvz;
      state.command.velocity[0] = state.pace[0]; state.command.velocity[2] = state.pace[2];
      {
        // The trunk travels no faster than its bearing paws' floor reach lets it until the free pair lands.
        const v = state.command.velocity, f = sin(view.yaw), g = cos(view.yaw), forward = v[0] * f + v[2] * g;
        const left = state.phase === "swing" ? T.swing - state.time + T.settle : state.phase === "settle" ? T.settle - state.time + T.swing : T.settle;
        let most = Infinity;
        view.feet.forEach((e, i) => {
          if (free.includes(i) || !e.contact) return;
          const along = (e.at.x - view.centre.x) * f + (e.at.z - view.centre.z) * g + reference[2], [back, ahead] = stance.limits[i]!;
          most = Math.min(most, forward >= 0 ? along - back : ahead - along);
        });
        most = Math.max(0, most) / Math.max(left, dt);
        const speed = Math.abs(forward);
        if (speed > most) { const cut = (speed - most) * (forward >= 0 ? 1 : -1); v[0] -= cut * f; v[2] -= cut * g; }
      }
      // The heading asked turns at `turnRate`, never further than `turnLead` ahead of the trunk's own.
      state.yaw += Math.max(-T.turnRate * dt, Math.min(T.turnRate * dt, error));
      const lead = atan2(sin(state.yaw - view.yaw), cos(state.yaw - view.yaw));
      if (Math.abs(lead) > T.turnLead) state.yaw = view.yaw + (lead > 0 ? T.turnLead : -T.turnLead);
      const travelling = moving || Math.abs(state.pace[0]) + Math.abs(state.pace[2]) > 0;
      if (travelling) { state.centre[0] = view.centre.x; state.centre[2] = view.centre.z; }
      else if (!state.standing) {
        const c = cos(state.yaw), s = sin(state.yaw);
        state.centre[0] = average[0]! + c * over[0] + s * over[1];
        state.centre[2] = average[2]! - s * over[0] + c * over[1];
      }
      state.standing = !travelling;
      state.command.centre[0] = state.centre[0]; state.command.centre[2] = state.centre[2];
      state.command.centre[1] = ground + reference[1] * (travelling || state.phase !== "settle" ? T.crawlHeight : 1);
      if (state.phase === "settle" && moving && state.time >= T.settle && view.feet.every(down)) {
        state.phase = "swing"; state.time = 0; state.since = 0; state.sequence++;
        state.liftedPaws.fill(false);
        for (const i of free) place(view, i, ground);
      } else if (state.phase !== "settle") {
        if (state.phase === "swing") {
          for (const i of free) if (!view.feet[i]!.contact && view.feet[i]!.low - view.feet[i]!.ground > T.liftConfirm) state.liftedPaws[i] = true;
          if (state.time >= T.swing) { state.phase = "land"; state.time = 0; }
        } else if (state.phase === "land" && free.every(i => down(view.feet[i]!))) {
          // A pair whose paws all bear has landed, a paw that never cleared the floor (dragged, or
          // already at its target) where it stands: waiting on its lift would hold the step while
          // the body travels over its other pair. Only a paw that cleared the floor counts a step.
          for (const i of free) { state.anchors[i]![0] = view.feet[i]!.at.x; state.anchors[i]![1] = view.feet[i]!.ground; state.anchors[i]![2] = view.feet[i]!.at.z; }
          state.placed += free.length; state.stride = state.since;
          for (const i of free) if (state.liftedPaws[i]) state.steps++;
          state.paw = (state.paw + 1) % groups.length; state.phase = "settle"; state.time = 0;
        } else if ((state.phase === "land" || state.phase === "return") && state.time >= T.placementLimit) {
          if (free.every(i => view.feet[i]!.contact)) { state.phase = "settle"; state.time = 0; }
          else {
            state.phase = "return"; state.time = 0; state.sequence++;
            for (const i of free) state.targets[i]!.splice(0, 3, ...state.anchors[i]!);
          }
        } else if (state.phase === "return" && state.time >= T.plant && free.every(i => view.feet[i]!.contact)) {
          state.phase = "settle"; state.time = 0;
        }
      }
      rotation.set(0, sin(state.yaw / 2), 0, cos(state.yaw / 2));
      rotation.multiplyToRef(root.rest, turned);
      state.command.rotation.splice(0, 4, turned.x, turned.y, turned.z, turned.w);
      state.command.endpoints.forEach((goal, i) => {
        rotation.multiplyToRef(built.segments.get(names[i]!)!.rest, turned);
        goal.rotation.splice(0, 4, turned.x, turned.y, turned.z, turned.w);
        goal.target.splice(0, 3, ...state.anchors[i]!); goal.bearing = true;
        if (groups[state.paw]!.includes(i) && (state.phase === "swing" || state.phase === "land" || state.phase === "return")) {
          goal.target.splice(0, 3, ...state.targets[i]!);
          goal.bearing = false;
        }
      });
      return state.command;
    },
  };
  return skill;
}

/** The diagonal pairs of four paws (the first paw and the one farthest from it, and the other two); any other count steps one paw at a time. */
function pairsOf(nominal: readonly Vec3[]): number[][] {
  if (nominal.length !== 4) return nominal.map((_n, i) => [i]);
  let opposite = 1, farthest = 0;
  for (let i = 1; i < nominal.length; i++) {
    const dx = nominal[i]![0] - nominal[0]![0], dz = nominal[i]![2] - nominal[0]![2], squared = dx * dx + dz * dz;
    if (squared > farthest) { opposite = i; farthest = squared; }
  }
  return [[0, opposite], nominal.map((_n, i) => i).filter(i => i !== 0 && i !== opposite)];
}

/**
 * How far a paw's sole reaches along the body `height` above the floor, back and ahead of where it
 * stands, m: the trunk at its reference pose, the paw flat, its leg's freedoms within their ranges.
 */
function floorReach(built: ReadBody, name: string, height: number): readonly [number, number] {
  const segment = built.segments.get(name)!, sole = segment.spec.points!.sole!.value, chain = chainTo(built, segment);
  const free = chain.flatMap((joint, j) => joint.dofs.map((dof, k) => ({ joint: j, k, min: dof.spec.min.value, max: dof.spec.max.value, preferred: 0 })));
  const work = reachWork(free.length), flat = { target: new Quaternion(), lever: REACH_LEVER };
  const reaches = (along: number) => {
    const angles = chain.map(joint => joint.dofs.map(() => 0));
    return solveReach(chain, angles, free, [{ point: sole, target: [sole[0], sole[1] + height, sole[2] + along] }], undefined, work, flat) < REACH_MISS;
  };
  const edge = (sense: 1 | -1) => {
    let near = 0, far = REACH_SEARCH;
    for (let n = 0; n < REACH_STEPS; n++) { const middle = (near + far) / 2; if (reaches(sense * middle)) near = middle; else far = middle; }
    return near;
  };
  return [edge(-1), edge(1)];
}

/**
 * Where each paw stands in the trot, body frame (x, z), and the room each has to sweep: each pair's
 * midpoint along the body at the centre of mass, its two paws split within their reach on the floor
 * and at the swing's lift (`floorReach`), so that the least room either way is the most it can be. A pair whose reaches
 * cannot share a midpoint there stands each paw at its reach's middle.
 */
function stanceOf(built: ReadBody, names: readonly string[], nominal: readonly Vec3[], groups: readonly number[][], centre: Vec3, lift: number) {
  const floors = names.map(name => floorReach(built, name, 0));
  const reach = names.map((name, i) => {
    const floor = floors[i]!, lifted = floorReach(built, name, lift);
    return [Math.min(floor[0], lifted[0]), Math.min(floor[1], lifted[1])] as const;
  });
  const limits = floors.map(([back, ahead], i) => [nominal[i]![2] - back, nominal[i]![2] + ahead] as const);
  const neutral = nominal.map(n => [n[0], n[2]] as [number, number]);
  let room = Infinity;
  const middle = (i: number) => { const [back, ahead] = reach[i]!; neutral[i]![1] = nominal[i]![2] + (ahead - back) / 2; room = Math.min(room, (ahead + back) / 2); };
  for (const group of groups) {
    if (group.length !== 2) { group.forEach(middle); continue; }
    const [a, b] = group as [number, number], twice = 2 * centre[2];
    const a0 = nominal[a]![2] - reach[a]![0], a1 = nominal[a]![2] + reach[a]![1], b0 = nominal[b]![2] - reach[b]![0], b1 = nominal[b]![2] + reach[b]![1];
    const low = Math.max(a0, twice - b1), high = Math.min(a1, twice - b0);
    if (high >= low) { neutral[a]![1] = (low + high) / 2; neutral[b]![1] = twice - neutral[a]![1]; room = Math.min(room, (high - low) / 2); }
    else group.forEach(middle);
  }
  return { neutral, room, limits };
}

/** The lever a paw's turn is weighed by in its reach, m: a few centimetres, a paw's own size. */
const REACH_LEVER = .05;
/** A reach that misses its place by less than this reaches it, m. */
const REACH_MISS = .003;
/** The farthest a reach is sought along the body, m, and the halvings that find its edge. */
const REACH_SEARCH = .5, REACH_STEPS = 16;

/** The trot's complete settings keep travel and every consumed time divisor positive. */
function validTrot(settings: typeof REPTILE_TROT): boolean {
  return !!settings && typeof settings === "object" && !Array.isArray(settings)
    && Object.keys(REPTILE_TROT).every(key => Object.hasOwn(settings, key))
    && Object.entries(settings).every(([key, value]) => Object.hasOwn(REPTILE_TROT, key) && Number.isFinite(value) && value >= 0)
    && settings.speed > 0 && settings.acceleration > 0 && settings.swing + settings.settle > 0;
}

/** **The trot**'s config: research settings over `REPTILE_TROT`, none in the game. */
interface TrotConfig { readonly kind: "paw-trot"; readonly tuning?: Partial<typeof REPTILE_TROT> }

/** **The trot** as a gait: the quadruped's travel. */
export const TROT_PART: PawGaitPart<TrotConfig> = deepFreeze({
  role: "paw-gait", label: "Trot", stage: "game", fields: [], slots: [], defaults: { kind: "paw-trot" }, keys: { kind: true, tuning: true },
  tuning: Object.keys(REPTILE_TROT), fits: (spec, config) => fitsPaws(spec) ?? (validTrot({ ...REPTILE_TROT, ...config.tuning }) ? null : "invalid trot settings"),
  faults: (config: TrotConfig) => config.tuning === undefined || !!config.tuning && typeof config.tuning === "object" && !Array.isArray(config.tuning)
    && validTrot({ ...REPTILE_TROT, ...config.tuning }) ? [] : ["invalid trot settings"],
  make(built: ReadBody, root: ReadSegment, paws: PawReading, names: readonly string[], config: TrotConfig) {
    const settings = { ...REPTILE_TROT, ...config.tuning }, skill = trot(built, root, paws, names, settings);
    // It carries the body forward at its speed, no faster than its stance's sweep lets it; aside and back at what it keeps of travel across its heading.
    const reach = { forward: Math.min(settings.speed, skill.fastest), aside: settings.sideways, turn: settings.turnRate };
    return { state: skill.state, settings, reach, travel: { speed: settings.speed, stopping: settings.acceleration }, resume: skill.resume, command: skill.command };
  },
});
