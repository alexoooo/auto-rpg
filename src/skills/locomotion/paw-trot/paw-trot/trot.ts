import { Quaternion } from "../../../../core/math/vector.ts";
import type { ReadBody } from "../../../../core/bodies/read-body.ts";
import { atan2, cos, sin } from "../../../../core/math/real.ts";
import type { Vec3 } from "../../../../core/quantity.ts";
import { REPTILE_TROT } from "../../shared/quadruped/tuning.ts";
import type { Gait, PawGaitBody } from "../../shared/quadruped/parts.ts";
import type { PawView } from "../../../../control/quadruped/paws.ts";
import { chainTo, reachWork, solveReach } from "../../../../control/kinematics.ts";
import { anchorAt, anchorsOf, completeSettings, gaitPoser, gaitStart, headingError, meanOf, overMean, settledCentre } from "../../shared/quadruped/gait.ts";

/**
 * Diagonal support pairs carry continuous travel; every counted paw clears and reloads the ground.
 * Each pair stands under the centre of mass (`stanceOf`) and lands led by the travel it will bear
 * through; the trunk goes no faster than its bearing paws' reach lets it, and turns as it travels.
 * A gait of `body` by the settings `T`.
 */
export function trot(body: PawGaitBody, T: typeof REPTILE_TROT): Gait {
  if (!validTrot(T)) throw new Error("invalid trot settings");
  const { built, paws, names } = body, start = gaitStart(body), { nominal, reference } = start;
  const groups = pairsOf(nominal);
  const stance = stanceOf(built, names, nominal, groups, reference, T.lift), room = T.reach * stance.room, neutral = stance.neutral;
  const over = overMean(reference, neutral);
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
    centre: start.centre,
    anchors: start.anchors,
    targets: anchorsOf(paws),
    liftedPaws: names.map(() => false),
    pace: [0, 0, 0] as [number, number, number],
    command: start.command,
  };
  const pose = gaitPoser(body);
  /** A paw is down that touches the floor or rests within `touch` of it. */
  const down = (e: PawView["feet"][number]) => e.contact || e.low - e.ground < T.touch;
  const resume = (view: PawView) => {
    state.phase = "settle"; state.time = 0; state.sequence++; state.yaw = view.yaw; state.standing = false;
    state.centre[0] = view.centre.x; state.centre[2] = view.centre.z;
    state.command.velocity.fill(0); state.pace.fill(0);
    view.feet.forEach((e, i) => anchorAt(state.anchors[i]!, e));
  };
  return {
    state, resume, settings: T, grounded: T.swingResponse,
    get holding() { return state.standing && state.phase === "settle"; },
    // It carries the body forward at its speed, no faster than its stance's sweep lets it; aside and back at what it keeps of travel across its heading.
    reach: { forward: Math.min(T.speed, fastest), aside: T.sideways, turn: T.turnRate },
    travel: { speed: T.speed, stopping: T.acceleration },
    command(view, intent, dt) {
      const error = headingError(intent, state.yaw), move = intent.move;
      const length = move ? Math.sqrt(move.x * move.x + move.z * move.z) : 0;
      // The trunk travels as fast as it faces the way it is ordered, and mostly along itself; asked a way behind it, it backs
      // along itself, no faster than its share of travel aside and back (`sideways`), facing as it faces.
      const along = length ? cos(atan2(move!.x, move!.z) - view.yaw) : 0, facing = Math.max(0, along), backing = along < 0;
      // It steps to travel or to turn: asked a way it would not travel, it would only tread in place on two paws, and stands on four.
      const moving = facing > 0 || backing || Math.abs(error) > T.turnError;
      state.time += dt; state.since += dt;
      const free = groups[state.paw]!;
      view.feet.forEach((e, i) => { if (e.contact && (!free.includes(i) || state.phase === "settle")) anchorAt(state.anchors[i]!, e); });
      const average = meanOf(state.anchors), ground = average[1]!;
      let vx = 0, vz = 0;
      const delayed = state.phase === "return" || state.phase === "land" && state.time >= T.landingWait
        || state.phase === "settle" && state.time >= T.landingWait && !view.feet.every(foot => foot.contact);
      if (move && backing && !delayed) {
        const back = Math.min(T.speed, fastest) * Math.min(1, length) * -along, most = Math.min(T.speed, fastest) * T.sideways;
        vx = -sin(view.yaw) * Math.min(back, most); vz = -cos(view.yaw) * Math.min(back, most);
      } else if (move && !delayed) {
        const scale = length ? Math.min(T.speed, fastest) * facing * Math.min(1, length) / length : 0;
        vx = move.x * scale; vz = move.z * scale;
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
      else if (!state.standing) settledCentre(state, average, over);
      state.standing = !travelling;
      state.command.centre[0] = state.centre[0]; state.command.centre[2] = state.centre[2];
      state.command.centre[1] = ground + reference[1] * (travelling || state.phase !== "settle" ? (intent.height ?? T.height) : 1);
      // It steps while it is asked to travel or turn, and on while it still carries pace: planted paws under a trunk that slows by
      // `acceleration` would let it vault over them.
      if (state.phase === "settle" && travelling && state.time >= T.settle && view.feet.every(down)) {
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
          for (const i of free) anchorAt(state.anchors[i]!, view.feet[i]!);
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
      const swinging = state.phase === "swing" || state.phase === "land" || state.phase === "return";
      return pose(state, (i) => swinging && groups[state.paw]!.includes(i) ? state.targets[i]! : null);
    },
  };
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
export function validTrot(settings: typeof REPTILE_TROT): boolean {
  return completeSettings(REPTILE_TROT, settings) && settings.speed > 0 && settings.acceleration > 0 && settings.swing + settings.settle > 0;
}
