// The club's haft on the workshop skin, offline: where the core's grip (`inHand`,
// `src/core/human/grip.ts`) puts it, in the GLB's rest coordinates, and how far each hand part
// sits from it. `haft-fit.mjs` fits `CLUB_GRIP` (`src/lab/club-grip.ts`) against it, and
// `tests/lab-grip.test.mjs` holds the fit to it.
import { Matrix } from "@babylonjs/core/Maths/math.vector.js";
import { heldPoint } from "../../src/core/build/rigid.ts";
import { armed } from "../../src/core/human/grip.ts";
import { FIT_SCALE } from "../../src/core/human/model.ts";
import { humanSpec } from "../../src/core/human/spec.ts";
import { woodenClub } from "../../src/core/items/club.ts";

/** A body-frame point in the GLB's rest frame: the loader's root turns x, and the fit scales. */
const toGlb = ([x, y, z]) => [-x / FIT_SCALE.value, y / FIT_SCALE.value, z / FIT_SCALE.value];

/** A node's head in the GLB's rest frame. */
function headOf(glb, name) {
  const at = glb.nodes.findIndex((n) => n.name === name);
  if (at < 0) throw new Error(`no node ${name}`);
  let m = Matrix.Identity();
  for (let i = at; i !== undefined; i = glb.nodes[i].parent) {
    const n = glb.nodes[i];
    m = m.multiply(Matrix.Compose(n.scaling, n.rotation, n.position));
  }
  return m.getTranslation().asArray();
}

/**
 * The club's haft in `model`'s `side` hand ("r" or "l"), in the GLB's rest frame: its capsule's
 * axis `from`, `to` and its `radius`, m at the authored size. Checks the mapping first: the hand's
 * knuckles (the third metacarpal's head) land on the middle finger's first bone's head.
 */
export function haftOf(glb, model, side) {
  const hand = side === "r" ? "right" : "left";
  const club = woodenClub(), spec = armed(humanSpec(model), hand, club);
  const [held] = spec.held, [haft] = club.shapes;
  if (haft.kind !== "capsule") throw new Error("the club's haft is not a capsule");
  const knuckles = toGlb(spec.segments.find((s) => s.name === `hand.${hand}`).points.knuckles.value);
  const head = headOf(glb, `middle_01_${side}`);
  const off = Math.hypot(...knuckles.map((k, i) => k - head[i]));
  if (off > 0.001) throw new Error(`${model} ${hand}: the knuckles map ${(off * 1000).toFixed(1)} mm from middle_01_${side}`);
  return {
    from: toGlb(heldPoint(held, haft.from).value), to: toGlb(heldPoint(held, haft.to).value),
    radius: haft.radius.value / FIT_SCALE.value,
  };
}

/** A point's distance from the haft's surface, m: negative inside. */
export function gapTo(haft, p) {
  const { from: a, to: b, radius } = haft;
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const t = Math.max(0, Math.min(1, (ab[0] * ap[0] + ab[1] * ap[1] + ab[2] * ap[2]) / (ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2)));
  return Math.hypot(ap[0] - t * ab[0], ap[1] - t * ab[1], ap[2] - t * ab[2]) - radius;
}

/** Each hand part's nearest vertex to the haft's surface, mm: negative is that deep inside it. */
export function haftGaps(verts, haft) {
  const out = new Map();
  for (const v of verts) {
    const g = gapTo(haft, v.p) * 1000;
    if (g < (out.get(v.part) ?? Infinity)) out.set(v.part, g);
  }
  return out;
}
