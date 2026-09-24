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
 * far as the joints couple them at that instant. **The joints are free**, because a motor cannot
 * respond inside a contact; a joint's locked axes still carry load, which is what a hinge is.
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

/** One velocity-constraint row, sparse: the linear and angular coefficients on each link it touches. */
interface Row { readonly terms: readonly { readonly link: number; readonly linear: Vec3; readonly angular: Vec3 }[] }

/**
 * `1 / m_eff`, the inverse effective mass along the normal: 0 for a contact nothing can move, and
 * the reciprocal of the effective mass otherwise.
 */
export function inverseEffectiveMass(links: readonly RigidLink[], joints: readonly LinkJoint[],
  contact: ContactQuery): number {
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

  const probe: Row = { terms: [{ link: contact.link, linear: normal,
    angular: cross(sub(contact.point, links[contact.link].centre), normal) }] };

  const rows: Row[] = [];
  for (const joint of joints) {
    const ra = sub(joint.pivot, links[joint.a].centre);
    const rb = sub(joint.pivot, links[joint.b].centre);
    const axes: Vec3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    for (const e of axes) {
      rows.push({ terms: [
        { link: joint.a, linear: e, angular: cross(ra, e) },
        { link: joint.b, linear: [-e[0], -e[1], -e[2]], angular: [-cross(rb, e)[0], -cross(rb, e)[1], -cross(rb, e)[2]] },
      ] });
    }
    for (const u of joint.lockedAngular) {
      rows.push({ terms: [
        { link: joint.a, linear: [0, 0, 0], angular: u },
        { link: joint.b, linear: [0, 0, 0], angular: [-u[0], -u[1], -u[2]] },
      ] });
    }
  }
  // A row that touches only pinned links constrains nothing that can move.
  const live = rows.filter((row) => row.terms.some((term) => !links[term.link].pinned));

  const free = product(probe, probe);
  if (live.length === 0) return free;
  const size = live.length;
  const a = new Float64Array(size * size);
  const y = new Float64Array(size);
  for (let i = 0; i < size; i++) {
    y[i] = product(live[i], probe);
    for (let j = 0; j <= i; j++) {
      const value = product(live[i], live[j]);
      a[i * size + j] = value;
      a[j * size + i] = value;
    }
  }
  // Regularised Cholesky: a loop closed on a weld repeats rows, and the repeat is singular. Each row
  // is regularised against its own diagonal rather than the largest one, because a thin link's spin
  // inertia puts rows of wildly different scale into one matrix (a 0.1 mm rod's is 1e8 times its
  // swing's), and a single epsilon sized for the largest swamps the rest.
  const epsilon = new Float64Array(size);
  for (let i = 0; i < size; i++) {
    epsilon[i] = Math.max(a[i * size + i], Number.MIN_VALUE) * 1e-12;
    a[i * size + i] += epsilon[i];
  }
  for (let j = 0; j < size; j++) {
    let diagonal = a[j * size + j];
    for (let k = 0; k < j; k++) diagonal -= a[j * size + k] * a[j * size + k];
    const pivot = Math.sqrt(Math.max(diagonal, epsilon[j]));
    a[j * size + j] = pivot;
    for (let i = j + 1; i < size; i++) {
      let sum = a[i * size + j];
      for (let k = 0; k < j; k++) sum -= a[i * size + k] * a[j * size + k];
      a[i * size + j] = sum / pivot;
    }
  }
  // Solve L z = y; then y^T A^-1 y = z . z.
  let constrained = 0;
  const z = new Float64Array(size);
  for (let i = 0; i < size; i++) {
    let sum = y[i];
    for (let k = 0; k < i; k++) sum -= a[i * size + k] * z[k];
    z[i] = sum / a[i * size + i];
    constrained += z[i] * z[i];
  }
  return Math.max(0, free - constrained);
}

/**
 * The effective mass along the normal, kilograms: `Infinity` for a contact nothing can move, which
 * is what a chain pinned to a keyframed base reads straight along itself.
 */
export function effectiveMassKg(links: readonly RigidLink[], joints: readonly LinkJoint[],
  contact: ContactQuery): number {
  const inverse = inverseEffectiveMass(links, joints, contact);
  // Below a part in a million of the lightest link's inverse, the rows ate the whole response: a
  // million times the lightest link is no body in this game, and it is where the regularised solve's
  // own residue sits for a chain pinned straight along the normal.
  const floor = 1e-6 * Math.max(...links.map((link) => link.pinned ? 0 : 1 / link.massKg), 0);
  return inverse > floor ? 1 / inverse : Infinity;
}
