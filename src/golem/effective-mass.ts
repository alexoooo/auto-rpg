/**
 * **What a blow arrives with, and what it arrives against** (physical contact session 05,
 * 2026-09-24): the effective mass of a jointed body at a contact point, along the contact normal.
 *
 * A blow is worth `0.5 * mu * v^2`, where `mu` is the reduced mass of the two sides at the contact.
 * Until this session each striker declared its side as a number (`impactMassKg`: the blade's 1.30 kg,
 * the ram's "plate plus a hinge-mass of trunk") and the struck side was the struck part's bare mass.
 * Neither is what a contact feels. What it feels is the operational-space mass
 *
 *     m_eff = 1 / (n^T J M^-1 J^T n)
 *
 * of the chain behind the point: the terminal, the links behind it and the trunk they hang from, as
 * far as the joints couple them at that instant. `effectiveMassKg` reads **the joints free**, and a
 * joint's locked axes still carry load, which is what a hinge is. That is the lightest a chain can
 * be, and until 2026-09-28 it was what a blow was priced on: the reasoning was that a motor cannot
 * respond inside a contact. It does not need to. A motor already holding its joint keeps holding up
 * to its ceiling, so a bout prices a blow on `contactGive`, which holds each motored axis for as long
 * as the contact lasts and lets it give past that.
 *
 * Worked in maximal coordinates: every link is a free rigid body, and every joint is a set of
 * velocity constraints -- three rows holding its pivot together and one for each locked angular
 * axis. The constrained inverse mass seen by a contact row `j` is
 *
 *     j^T W j = j^T M^-1 j - y^T (C M^-1 C^T)^-1 y,   y = C M^-1 j
 *
 * which needs no root, no joint ordering and no special case for a loop -- the maul's second hand is
 * one -- or for a pinned link, which simply has no inverse mass. A redundant row (a loop closed on a
 * weld) makes `C M^-1 C^T` singular, and the solve is regularised for it; the consistent right-hand
 * side keeps the answer the pseudo-inverse's.
 *
 * **Pure and loadable in Node**, and it imports nothing: the caller hands it plain numbers. Which
 * links, which joints and which inertias is the caller's business (`src/body-inertia.ts` reads a
 * live body); this file is only the mechanics, so it can be argued with in
 * `tests/effective-mass.test.mjs` against closed forms.
 */

export type Vec3 = readonly [number, number, number];
/** Row-major 3x3. */
export type Mat3 = readonly [number, number, number, number, number, number, number, number, number];

/** One rigid link, in world terms: its mass, its centre and its inertia about that centre. */
export interface RigidLink {
  readonly massKg: number;
  readonly centre: Vec3;
  readonly inertia: Mat3;
  /** A link that cannot move at all: a keyframed stand, the ground. It has no inverse mass. */
  readonly pinned?: boolean;
}

/**
 * A joint between links `a` and `b`, at a world pivot, with the angular axes it locks (world, unit).
 * Every joint holds its pivot together; a weld locks three angular axes, a hinge two, a ball none.
 */
export interface LinkJoint {
  readonly a: number;
  readonly b: number;
  readonly pivot: Vec3;
  readonly lockedAngular: readonly Vec3[];
  /**
   * Free axes a motor holds, each with the most angular impulse it can put out over a contact, N m s:
   * the joint is locked on the axis until the contact asks more of it than that, and gives past it.
   * Absent or empty: every free axis is free (`contactGive`).
   */
  readonly heldAngular?: readonly HeldAxis[];
}

/** A free joint axis (world, unit) and the angular impulse its motor can hold over a contact, N m s. */
export interface HeldAxis {
  readonly axis: Vec3;
  readonly holdNms: number;
}

/** A contact on link `link`, at a world point, along a world normal (either sign; it is squared). */
export interface ContactQuery {
  readonly link: number;
  readonly point: Vec3;
  readonly normal: Vec3;
}

/** The shapes a part is built from, in its own frame: a capsule and a cylinder run along local Y. */
export type PrimitiveShape =
  | { readonly kind: "box"; readonly size: Vec3 }
  | { readonly kind: "sphere"; readonly radius: number }
  | { readonly kind: "capsule"; readonly height: number; readonly radius: number }
  | { readonly kind: "cylinder"; readonly height: number; readonly radius: number };

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 =>
  [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const mul = (m: Mat3, v: Vec3): Vec3 => [
  m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
  m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
  m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
];

/**
 * A solid's principal moments about its centre, kg m2, along its own X, Y and Z, at a uniform
 * density. A capsule's `height` is tip to tip, as `capsulePart` builds it: a cylinder of
 * `height - 2 * radius` with a hemisphere on each end, each hemisphere's own moment taken about its
 * own centroid (83/320 m r^2) and carried out to the capsule's centre.
 */
export function principalInertia(shape: PrimitiveShape, massKg: number): Vec3 {
  switch (shape.kind) {
    case "box": {
      const [x, y, z] = shape.size;
      return [massKg * (y * y + z * z) / 12, massKg * (x * x + z * z) / 12, massKg * (x * x + y * y) / 12];
    }
    case "sphere": {
      const moment = 0.4 * massKg * shape.radius * shape.radius;
      return [moment, moment, moment];
    }
    case "cylinder": {
      const r = shape.radius;
      const h = shape.height;
      const across = massKg * (3 * r * r + h * h) / 12;
      return [across, massKg * r * r / 2, across];
    }
    case "capsule": {
      const r = shape.radius;
      const length = Math.max(0, shape.height - 2 * r);
      const cylinderVolume = Math.PI * r * r * length;
      const sphereVolume = (4 / 3) * Math.PI * r * r * r;
      const cylinder = massKg * cylinderVolume / (cylinderVolume + sphereVolume);
      const caps = massKg - cylinder;
      const out = length / 2 + 3 * r / 8;
      const along = cylinder * r * r / 2 + caps * 0.4 * r * r;
      const across = cylinder * (length * length / 12 + r * r / 4) + caps * (83 / 320 * r * r + out * out);
      return [across, along, across];
    }
    default: {
      const never: never = shape;
      throw new Error(`effective-mass: no inertia for ${JSON.stringify(never)}`);
    }
  }
}

/** A principal inertia turned into the world by a unit quaternion (x, y, z, w): `R diag(I) R^T`. */
export function worldInertia(principal: Vec3, rotation: readonly [number, number, number, number]): Mat3 {
  const [x, y, z, w] = rotation;
  const r: Mat3 = [
    1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w),
    2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w),
    2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y),
  ];
  const out = new Array<number>(9).fill(0);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    let sum = 0;
    for (let k = 0; k < 3; k++) sum += r[i * 3 + k] * principal[k] * r[j * 3 + k];
    out[i * 3 + j] = sum;
  }
  return out as unknown as Mat3;
}

/**
 * Several links welded into one: their summed mass at their common centre, and each inertia carried
 * there by the parallel-axis rule. Pinned if any of them is.
 */
export function lumpLinks(links: readonly RigidLink[]): RigidLink {
  let massKg = 0;
  const centre = [0, 0, 0];
  for (const link of links) {
    massKg += link.massKg;
    for (let k = 0; k < 3; k++) centre[k] += link.massKg * link.centre[k];
  }
  if (massKg > 0) for (let k = 0; k < 3; k++) centre[k] /= massKg;
  const c = centre as unknown as Vec3;
  const inertia = new Array<number>(9).fill(0);
  for (const link of links) {
    const d = sub(link.centre, c);
    const dd = dot(d, d);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      inertia[i * 3 + j] += link.inertia[i * 3 + j] + link.massKg * ((i === j ? dd : 0) - d[i] * d[j]);
    }
  }
  return { massKg, centre: c, inertia: inertia as unknown as Mat3, pinned: links.some((link) => link.pinned) };
}

function invert(m: Mat3): Mat3 {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (!(Math.abs(det) > 0)) throw new Error("effective-mass: a free link has a singular inertia");
  const s = 1 / det;
  return [
    A * s, -(b * i - c * h) * s, (b * f - c * e) * s,
    B * s, (a * i - c * g) * s, -(a * f - c * d) * s,
    C * s, -(a * h - b * g) * s, (a * e - b * d) * s,
  ];
}

/**
 * One velocity-constraint row, sparse: the linear and angular coefficients on each link it touches,
 * and the most impulse it can carry over a contact (`Infinity` for a row that never gives).
 */
interface Row {
  readonly terms: readonly { readonly link: number; readonly linear: Vec3; readonly angular: Vec3 }[];
  readonly hold: number;
}

/** A contact's rows, assembled once: `A = R M^-1 R^T`, `y = R M^-1 j` and `free = j^T M^-1 j`. */
interface Assembly {
  readonly free: number;
  readonly size: number;
  readonly a: Float64Array;
  readonly y: Float64Array;
  readonly hold: Float64Array;
}

function assemble(links: readonly RigidLink[], joints: readonly LinkJoint[], contact: ContactQuery,
  held: boolean): Assembly {
  if (!(contact.link >= 0 && contact.link < links.length)) {
    throw new Error(`effective-mass: contact on link ${contact.link} of ${links.length}`);
  }
  const length = Math.hypot(...contact.normal);
  if (!(length > 0)) throw new Error("effective-mass: a contact normal must not be zero");
  const normal: Vec3 = [contact.normal[0] / length, contact.normal[1] / length, contact.normal[2] / length];

  const inverseMass = links.map((link) => {
    if (link.pinned) return 0;
    if (!(link.massKg > 0)) throw new Error("effective-mass: a free link needs a positive mass");
    return 1 / link.massKg;
  });
  const zero: Mat3 = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  const inverseInertia = links.map((link) => link.pinned ? zero : invert(link.inertia));

  /** `a^T M^-1 b` over the links two rows share. */
  const product = (a: Row, b: Row): number => {
    let sum = 0;
    for (const s of a.terms) for (const t of b.terms) {
      if (s.link !== t.link) continue;
      sum += inverseMass[s.link] * dot(s.linear, t.linear) + dot(s.angular, mul(inverseInertia[s.link], t.angular));
    }
    return sum;
  };

  const probe: Row = { hold: Infinity, terms: [{ link: contact.link, linear: normal,
    angular: cross(sub(contact.point, links[contact.link].centre), normal) }] };

  const rows: Row[] = [];
  const angularRow = (joint: LinkJoint, u: Vec3, hold: number): Row => ({ hold, terms: [
    { link: joint.a, linear: [0, 0, 0], angular: u },
    { link: joint.b, linear: [0, 0, 0], angular: [-u[0], -u[1], -u[2]] },
  ] });
  for (const joint of joints) {
    const ra = sub(joint.pivot, links[joint.a].centre);
    const rb = sub(joint.pivot, links[joint.b].centre);
    const axes: Vec3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    for (const e of axes) {
      rows.push({ hold: Infinity, terms: [
        { link: joint.a, linear: e, angular: cross(ra, e) },
        { link: joint.b, linear: [-e[0], -e[1], -e[2]], angular: [-cross(rb, e)[0], -cross(rb, e)[1], -cross(rb, e)[2]] },
      ] });
    }
    for (const u of joint.lockedAngular) rows.push(angularRow(joint, u, Infinity));
    // An axis nothing holds is free and has no row, and so is every held one when none is asked for.
    if (held) {
      for (const { axis, holdNms } of joint.heldAngular ?? []) if (holdNms > 0) rows.push(angularRow(joint, axis, holdNms));
    }
  }
  // A row that touches only pinned links constrains nothing that can move.
  const live = rows.filter((row) => row.terms.some((term) => !links[term.link].pinned));

  const size = live.length;
  const a = new Float64Array(size * size);
  const y = new Float64Array(size);
  const hold = new Float64Array(size);
  for (let i = 0; i < size; i++) {
    y[i] = product(live[i], probe);
    hold[i] = live[i].hold;
    for (let j = 0; j <= i; j++) {
      const value = product(live[i], live[j]);
      a[i * size + j] = value;
      a[j * size + i] = value;
    }
  }
  return { free: product(probe, probe), size, a, y, hold };
}

/**
 * The lower Cholesky factor of the rows `pick` names out of `a` (row-major, `size` wide), packed
 * `n x n` for `n = pick.length`.
 *
 * Regularised: a loop closed on a weld repeats rows, and the repeat is singular. Each row is
 * regularised against its own diagonal rather than the largest one, because a thin link's spin
 * inertia puts rows of wildly different scale into one matrix (a 0.1 mm rod's is 1e8 times its
 * swing's), and a single epsilon sized for the largest swamps the rest.
 */
function factor(a: Float64Array, size: number, pick: readonly number[]): Float64Array {
  const n = pick.length;
  const l = new Float64Array(n * n);
  const epsilon = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) l[i * n + j] = a[pick[i] * size + pick[j]];
    epsilon[i] = Math.max(l[i * n + i], Number.MIN_VALUE) * 1e-12;
    l[i * n + i] += epsilon[i];
  }
  for (let j = 0; j < n; j++) {
    let diagonal = l[j * n + j];
    for (let k = 0; k < j; k++) diagonal -= l[j * n + k] * l[j * n + k];
    const pivot = Math.sqrt(Math.max(diagonal, epsilon[j]));
    l[j * n + j] = pivot;
    for (let i = j + 1; i < n; i++) {
      let sum = l[i * n + j];
      for (let k = 0; k < j; k++) sum -= l[i * n + k] * l[j * n + k];
      l[i * n + j] = sum / pivot;
    }
  }
  return l;
}

/** `L z = b`, in place. */
function forward(l: Float64Array, n: number, b: Float64Array): Float64Array {
  for (let i = 0; i < n; i++) {
    let sum = b[i];
    for (let k = 0; k < i; k++) sum -= l[i * n + k] * b[k];
    b[i] = sum / l[i * n + i];
  }
  return b;
}

/** `L^T x = z`, in place. */
function backward(l: Float64Array, n: number, b: Float64Array): Float64Array {
  for (let i = n - 1; i >= 0; i--) {
    let sum = b[i];
    for (let k = i + 1; k < n; k++) sum -= l[k * n + i] * b[k];
    b[i] = sum / l[i * n + i];
  }
  return b;
}

/**
 * `1 / m_eff`, the inverse effective mass along the normal, with every free axis free: 0 for a
 * contact nothing can move, and the reciprocal of the effective mass otherwise.
 */
export function inverseEffectiveMass(links: readonly RigidLink[], joints: readonly LinkJoint[],
  contact: ContactQuery): number {
  const { free, size, a, y } = assemble(links, joints, contact, false);
  if (size === 0) return free;
  const all = Array.from({ length: size }, (_, i) => i);
  // y^T A^-1 y = z . z, with L z = y.
  const z = forward(factor(a, size, all), size, Float64Array.from(y));
  let constrained = 0;
  for (let i = 0; i < size; i++) constrained += z[i] * z[i];
  return Math.max(0, free - constrained);
}

/** Below a part in a million of the lightest link's inverse mass, the rows ate the whole response. */
const inverseFloor = (links: readonly RigidLink[]): number =>
  1e-6 * Math.max(...links.map((link) => link.pinned ? 0 : 1 / link.massKg), 0);

/**
 * The effective mass along the normal, kilograms, with every free axis free: `Infinity` for a
 * contact nothing can move, which is what a chain pinned to a keyframed base reads straight along
 * itself.
 */
export function effectiveMassKg(links: readonly RigidLink[], joints: readonly LinkJoint[],
  contact: ContactQuery): number {
  const inverse = inverseEffectiveMass(links, joints, contact);
  // A million times the lightest link is no body in this game, and it is where the regularised
  // solve's own residue sits for a chain pinned straight along the normal.
  return inverse > inverseFloor(links) ? 1 / inverse : Infinity;
}

/**
 * How one side of a contact gives: the velocity it gives up along the normal to an impulse
 * `impulseNs` there, m/s, and that response's slope at that impulse, m/s per N s. A lone mass gives
 * `P / m`; a jointed body gives less than its free joints would, as far as its motors hold.
 */
export type Give = (impulseNs: number) => { readonly give: number; readonly slope: number };

/** A lone mass, or `Infinity` for a body nothing moves. */
export const massGive = (massKg: number): Give => {
  const slope = massKg > 0 && Number.isFinite(massKg) ? 1 / massKg : 0;
  return (impulseNs) => ({ give: slope * impulseNs, slope });
};

/**
 * **Joint give** (Session 2 step 5 of `docs/plans/2026-09-27-warrior-rogue-reptile.md`): the
 * response of a jointed body at a contact when each motor-held axis holds its joint up to the
 * angular impulse it can put out over the contact (`LinkJoint.heldAngular`), and gives past it.
 *
 * A bounded row is a friction-like constraint: locked while `|lambda| < hold`, and at `+-hold`
 * moving the way the load pushes it, never against. That is a box-constrained problem in the rows'
 * impulses, solved exactly by an active set for each impulse asked; with the active set fixed the
 * response is linear in the impulse, so the answer is piecewise linear -- stiff at a light touch,
 * the free-joint answer once every held axis has given.
 */
export function contactGive(links: readonly RigidLink[], joints: readonly LinkJoint[],
  contact: ContactQuery): Give {
  const { free, size, a, y, hold } = assemble(links, joints, contact, true);
  const floor = inverseFloor(links);
  const saturated = new Int8Array(size);
  const lambda = new Float64Array(size);
  let bounded = 0;
  for (let i = 0; i < size; i++) if (Number.isFinite(hold[i])) bounded += 1;
  return (impulseNs) => {
    const p = Math.max(0, impulseNs);
    let slope = free;
    for (let pass = 0; pass <= 3 * bounded + 4; pass++) {
      const active: number[] = [];
      for (let i = 0; i < size; i++) {
        if (saturated[i] === 0) active.push(i);
        else lambda[i] = saturated[i] * hold[i];
      }
      const n = active.length;
      const rhs = new Float64Array(n);
      const unit = new Float64Array(n);
      for (let r = 0; r < n; r++) {
        const i = active[r];
        let sum = y[i] * p;
        for (let j = 0; j < size; j++) if (saturated[j] !== 0) sum += a[i * size + j] * lambda[j];
        rhs[r] = -sum;
        unit[r] = -y[i];
      }
      if (n > 0) {
        const l = factor(a, size, active);
        backward(l, n, forward(l, n, rhs));
        backward(l, n, forward(l, n, unit));
      }
      slope = free;
      for (let r = 0; r < n; r++) {
        lambda[active[r]] = rhs[r];
        slope += y[active[r]] * unit[r];
      }
      // One change a pass: the held row loaded furthest past its hold gives, or else the given row
      // the solve now drives against its own load is held again.
      let worst = -1;
      let excess = 1e-9;
      for (const i of active) {
        const over = Number.isFinite(hold[i]) ? Math.abs(lambda[i]) / hold[i] - 1 : 0;
        if (over > excess) { excess = over; worst = i; }
      }
      if (worst >= 0) { saturated[worst] = lambda[worst] > 0 ? 1 : -1; continue; }
      let back = 1e-12 * Math.max(free * p, 1e-12);
      for (let i = 0; i < size; i++) {
        if (saturated[i] === 0) continue;
        let w = y[i] * p;
        for (let j = 0; j < size; j++) w += a[i * size + j] * lambda[j];
        const wrong = saturated[i] * w;
        if (wrong > back) { back = wrong; worst = i; }
      }
      if (worst < 0) break;
      saturated[worst] = 0;
    }
    let give = free * p;
    for (let i = 0; i < size; i++) give += y[i] * lambda[i];
    // The regularised solve leaves a residue where the rows hold everything; see `effectiveMassKg`.
    return { give: give > floor * p ? give : 0, slope: Math.max(0, slope) };
  };
}

/**
 * The impulse an inelastic contact passes between two sides closing at `closingSpeed`, N s: the one
 * at which what they give up together is the closing speed. `Infinity` when neither side can move.
 *
 * Newton on a piecewise-linear sum from its stiffest slope, guarded by a bracket that bisects if a
 * step leaves it.
 */
export function sharedImpulseNs(a: Give, b: Give, closingSpeed: number): number {
  if (!(closingSpeed > 0)) return 0;
  const at = (p: number) => {
    const s = a(p);
    const t = b(p);
    return { give: s.give + t.give, slope: s.slope + t.slope };
  };
  const start = at(0);
  if (!(start.slope > 0)) return Infinity;
  let lo = 0;
  let hi = Infinity;
  let p = closingSpeed / start.slope;
  for (let step = 0; step < 64; step++) {
    const { give, slope } = at(p);
    const miss = give - closingSpeed;
    if (Math.abs(miss) <= 1e-9 * closingSpeed) return p;
    if (miss < 0) lo = p; else hi = p;
    const next = slope > 0 ? p - miss / slope : NaN;
    p = next > lo && next < hi ? next : Number.isFinite(hi) ? (lo + hi) / 2 : 2 * p;
  }
  return p;
}

/** The mass one side acted as in a contact that passed `impulseNs`: `P / give(P)`, or `Infinity`. */
export function actedMassKg(side: Give, impulseNs: number): number {
  if (!(impulseNs > 0) || !Number.isFinite(impulseNs)) return Infinity;
  const { give } = side(impulseNs);
  return give > 0 ? impulseNs / give : Infinity;
}
