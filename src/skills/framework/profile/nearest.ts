/**
 * **How alike two starts are, and the trials nearest one**: the numbers starts are compared by
 * (`bodyNumbers`, `STANCES`, `NEAREST`), a profile's trials as a sample of them (`Sample`) and
 * the trees its nearest trials are found through (`Tree`, `eachNearest`).
 */
import type { Asked, ItemNumbers, Stances, StanceNumbers, Start, Trial } from "./profile.ts";
import type { BodySpec } from "../../../core/bodies/spec/body.ts";
import { heldNumbers, struckNumbers } from "./numbers.ts";
import { remembered } from "../../../core/remembered.ts";
import { handSet } from "../../../core/hand-set.ts";

/**
 * **The spans a struck body's stature and mass are compared over**: a tenth of a metre and ten
 * kilograms. Set on no reading of their error: a body reads the trials struck at its own numbers
 * where it was measured, and the spans choose only which measured body one never measured is read
 * as (`profileAgainst`).
 */
export const STRUCK_SPANS = handSet({
  name: "STRUCK_SPANS", sort: "own",
  says: "The spans over which two struck bodies are compared: this much stature, m, and this much mass, kg, count as one step apart.",
  value: { stature: .1, mass: 10 },
});

/** The span each of a body's stance numbers is read over (`STANCES`), m. */
export const STANCE_SPANS = handSet<Readonly<Record<keyof StanceNumbers, number>>>({
  name: "STANCE_SPANS", sort: "own",
  says: "The spans over which two stances are compared: this much of each stance number counts as one step apart.",
  value: { stagger: 1, width: .4, height: .02 },
});

/**
 * **The stance numbers a start is compared by**, beside its range, velocity and place: each body's
 * each number, and the span over which trials are taken as alike, m. A sparring start is mostly a
 * walking one, and a walk swings the feet's stagger 0.3 m either way a stride and their width
 * 0.2 m, staggered or square alike, while a staggered body's centre stands about 0.045 m lower:
 * height tells the two apart, stagger and width little. Tuned on 335 trials of
 * `sparring-stances`, a Warrior at a Warrior: with these spans a start's ten nearest trials were of
 * its own pairing 0.57 to 0.72 of the time (a quarter by chance), and height alone did as well.
 */
const STANCES = Object.freeze(((["own", "target"] as const).flatMap((of) => (["stagger", "width", "height"] as const).map((key) => ({ of, key, span: STANCE_SPANS[key] })))));

/** `stance`'s numbers in `STANCES`' order into `out` from `at`, NaN where it records none. */
function stanceInto(stance: Stances | undefined, out: Float64Array, at = 0): void {
  for (let k = 0; k < STANCES.length; k++) { const { of, key } = STANCES[k]!; out[at + k] = stance?.[of]?.[key] ?? NaN; }
}

/**
 * **A number of a trial's bodies a reading compares starts by**, beside range, velocity, place and
 * stance: a level or what a segment holds, of the body whose skill it is or the body it struck; the
 * span over which trials are taken as alike; what a trial that records none began at; and what a
 * reading of a body of `striker` against one of `struck` (null with none) asks.
 */
export interface BodyNumber {
  readonly span: number;
  trial(start: Start): number;
  asked(striker: BodySpec, struck: BodySpec | null): number;
}

/**
 * **The spans what is held is compared over**: a kilogram of mass and a tenth of a metre of reach.
 * Set on no reading of their error: the edges' profiles hold each loadout's falls apart (a body
 * reads its own loadout's, every one at no distance), and no strike's trials cross loadouts yet.
 */
export const HELD_SPANS = handSet<Readonly<Record<keyof ItemNumbers, number>>>({
  name: "HELD_SPANS", sort: "own",
  says: "The spans over which what two bodies hold is compared: this much mass, kg, and this much reach, m, count as one step apart.",
  value: { mass: 1, reach: .1 },
});

/**
 * **The numbers `trials` are compared by** (`BodyNumber`): the mass and reach held in each segment any trial records holding, a trial that
 * records nothing there at none; and the stature and mass of the body struck, where any trial
 * records one (`Start.struck`). A reading's own body is the striker's, a struck one's the target's;
 * with none struck, it holds nothing.
 */
export function bodyNumbers(trials: readonly Trial[]): readonly BodyNumber[] {
  const numbers: BodyNumber[] = [];
  for (const body of ["own", "target"] as const) {
    const segments = [...new Set(trials.flatMap((trial) => Object.keys(trial.start.held?.[body] ?? {})))].sort();
    for (const segment of segments) for (const key of ["mass", "reach"] as const) numbers.push({ span: HELD_SPANS[key],
      trial: (start) => start.held?.[body]?.[segment]?.[key] ?? 0,
      asked: (striker, struck) => { const spec = body === "own" ? striker : struck; return spec ? heldNumbers(spec)?.[segment]?.[key] ?? 0 : 0; } });
  }
  if (trials.some((trial) => trial.start.struck)) for (const key of ["stature", "mass"] as const) numbers.push({ span: STRUCK_SPANS[key],
    trial: (start) => start.struck?.[key] ?? 0,
    asked: (_, struck) => struck ? struckNumbers(struck)[key] : 0 });
  return numbers;
}

/** **A start's body numbers** in `numbers`' order (`bodyNumbers`). */
export const numbersAt = (start: Start, numbers: readonly BodyNumber[]): Float64Array => Float64Array.from(numbers, (number) => number.trial(start));

/** Still, or at the window's middle: the velocity and the place a start that records none is read at. */
const STILL: readonly [number, number] = Object.freeze([0, 0]) as readonly [number, number];

/**
 * **The trials a reading takes** (`ProfileReading.expect`): the nearest the start asked at, nearer
 * first and ties together, until there are `trials` of them, so a lone trial is read with its
 * neighbours; nearness the distance in range over `range` m, in velocity over `speed` m/s and in
 * the place in its window over `place` m together, each the span over which trials are taken as
 * alike. Tuned: about a stride's worth of neighbours on the range a strike's window spans, a step's
 * change of pace, and a quarter of the depth of a stomp's window.
 */
const NEAREST = handSet({
  name: "NEAREST", sort: "own",
  says: "How many of a profile's nearest trials a reading is the mean of, and the spans their starts are compared over: range, m, velocity, m/s, and place in the window, m.",
  value: { trials: 10, range: .1, speed: .25, place: .1 },
});

/** The spans over which a reading takes its trials' starts as alike (`NEAREST`): range and place in the window, m, and velocity, m/s. */
export const PROFILE_SPANS: { readonly range: number; readonly speed: number; readonly place: number } = Object.freeze({ range: NEAREST.range, speed: NEAREST.speed, place: NEAREST.place });

/** How near two distances are taken as one: the nearest trials' ties. */
const TIE = handSet({
  name: "TIE", sort: "own",
  says: "How near two distances between starts are taken as the same distance.",
  value: 1e-9,
});

/**
 * **Where each of a start's coordinates lies** in a sample's (`Sample.coords`): the range, m; the
 * velocity closing and across, m/s (`startVelocity`); the place in its window ahead and aside, m;
 * from `levels` on, the body numbers its trials differ in (`Sample.kept`); and from `Sample.stanced`
 * on, where any of its trials records how its bodies stood, each stance number (`STANCES`' order).
 */
export const COORDINATE = Object.freeze({ range: 0, closing: 1, across: 2, ahead: 3, aside: 4, levels: 5 });

/**
 * **Trials sorted by the range they began at**, with their starts' coordinates (`COORDINATE`) in one
 * array made once, `dims` a trial, NaN where a trial records no stance number; each coordinate's
 * span (`NEAREST`, the body numbers', `STANCES`), and the least and the most its trials began at,
 * which a start is read within (`readWithin`), the range at no bound. Of its profile's body numbers
 * (`bodyNumbers`) it compares those its trials began at more than one of (`kept`, an index into
 * them): a number every trial began alike says nothing a reading clamped to it would. The nearest
 * to a start are found through trees of its trials (`Tree`), made when first asked.
 */
export interface Sample {
  readonly trials: readonly Trial[];
  readonly kept: Int32Array;
  /** How many coordinates a start has, and where its stance numbers begin: at `dims` where its trials record none. */
  readonly dims: number;
  readonly stanced: number;
  readonly coords: Float64Array;
  readonly spans: Float64Array;
  readonly low: Float64Array;
  readonly high: Float64Array;
  /** Query scratch: a trial's distance from the start asked, where `asked` holds that query's mark. */
  readonly distances: Float64Array;
  readonly asked: Float64Array;
}

/** **`at`'s coordinates** as a sample of its shape keeps them (`COORDINATE`), its bodies at the body numbers `asked` (`bodyNumbers`' order), into `out` from `from`; a stance number it does not record NaN. */
function coordinatesInto(shape: Pick<Sample, "kept" | "dims" | "stanced">, at: Asked, asked: Float64Array, out: Float64Array, from = 0): void {
  const velocity = at.velocity ?? STILL, place = at.window ?? STILL;
  out[from + COORDINATE.range] = at.range; out[from + COORDINATE.closing] = velocity[0]; out[from + COORDINATE.across] = velocity[1];
  out[from + COORDINATE.ahead] = place[0]; out[from + COORDINATE.aside] = place[1];
  for (let k = 0; k < shape.kept.length; k++) out[from + COORDINATE.levels + k] = asked[shape.kept[k]!]!;
  if (shape.dims > shape.stanced) stanceInto(at.stance, out, from + shape.stanced);
}

/** `trials` as a sample, compared by `numbers` (`bodyNumbers`) beside their starts. */
export function sampleOf(trials: readonly Trial[], numbers: readonly BodyNumber[]): Sample {
  const sorted = [...trials].sort((a, b) => a.start.range - b.start.range), n = sorted.length, asked = sorted.map((trial) => numbersAt(trial.start, numbers));
  const kept = Int32Array.from(numbers.keys()).filter((k) => asked.some((one) => one[k] !== asked[0]![k]));
  const stanced = COORDINATE.levels + kept.length, dims = stanced + (sorted.some((trial) => trial.start.stance) ? STANCES.length : 0), shape = { kept, dims, stanced };
  const spans = Float64Array.from([NEAREST.range, NEAREST.speed, NEAREST.speed, NEAREST.place, NEAREST.place, ...Array.from(kept, (k) => numbers[k]!.span),
    ...dims > stanced ? STANCES.map((one) => one.span) : []]);
  const coords = new Float64Array(n * dims), low = new Float64Array(dims).fill(Infinity), high = new Float64Array(dims).fill(-Infinity);
  sorted.forEach((trial, i) => coordinatesInto(shape, trial.start, asked[i]!, coords, i * dims));
  for (let i = 0; i < coords.length; i++) { const d = i % dims, v = coords[i]!; if (v === v) { low[d] = Math.min(low[d]!, v); high[d] = Math.max(high[d]!, v); } }
  low[COORDINATE.range] = -Infinity; high[COORDINATE.range] = Infinity;
  return { trials: sorted, kept, dims, stanced, coords, spans, low, high, distances: new Float64Array(n), asked: new Float64Array(n) };
}

/**
 * **How far `tree`'s trial `i` lies from `query`** (`squaredFrom`, its square root), written to
 * `distances` (`Sample.distances`): `hypot` reads it several times slower. Written, not returned:
 * a number a call returns is a heap object, one an array holds is not.
 */
function measureApart(tree: Tree, i: number, query: Float64Array, distances: Float64Array): void {
  distances[i] = Math.sqrt(squaredFrom(tree, tree.coords, i * tree.dims, i * tree.dims, query));
}

/**
 * **The square distance from `query` to what `tree` holds at `low` and `high`** in `values`: a
 * trial's numbers (`Tree.coords`, `low` and `high` one place) or a node's box (`Tree.box`): each
 * number's part what lies between the query and the span, over its span (`Tree.spans`), none
 * within it. The numbers before the stances' summed, then the stances', a number the question lacks
 * (NaN) no part of it, then the two: the one arithmetic for a trial and a box, so a box's is never
 * more than a trial's within it, and a search that prunes by it misses none.
 */
function squaredFrom(tree: Tree, values: Float64Array, low: number, high: number, query: Float64Array): number {
  const dims = tree.dims, spans = tree.spans;
  let squared = 0, stanced = 0;
  for (let d = 0; d < dims; d++) {
    const q = query[d]!;
    if (q !== q) continue;
    const from = values[low + d]!, to = values[high + d]!, by = (q < from ? from - q : q > to ? q - to : 0) / spans[d]!;
    if (d < tree.stanced) squared += by * by; else stanced += by * by;
  }
  return squared + stanced;
}

/**
 * **Those of a sample's trials that record the same stance numbers, as a tree** (a k-d tree): each
 * trial's numbers a distance reads (`coords`, `dims` a trial: range, velocity, place, the levels
 * where its sample records them, and from `stanced` on the stance numbers its trials record), each
 * one's span (`spans`, `NEAREST`, the body numbers', `STANCES`), its trials (`order`, indices of the
 * sample) in the tree's order, and its nodes, each the trials `[start, end)` of `order`, the box
 * their numbers lie in (`box`, low then high for each number) and its two halves (`left`, `right`;
 * -1 at a leaf). A search reads a node only where the least distance its box allows is within the
 * farthest kept: what a sample's size costs a reading grows as its log, not as its size.
 */
interface Tree {
  readonly dims: number;
  readonly stanced: number;
  readonly spans: Float64Array;
  readonly coords: Float64Array;
  readonly order: Int32Array;
  readonly start: Int32Array;
  readonly end: Int32Array;
  readonly left: Int32Array;
  readonly right: Int32Array;
  readonly box: Float64Array;
  /** Which of its sample's coordinates it holds, in order: every one before the stance numbers, then those of them its trials record. */
  readonly reads: Int32Array;
}

/** How many trials a leaf of a tree holds at most. */
const LEAF = handSet({
  name: "LEAF", sort: "own",
  says: "How many trials a leaf holds at most in the tree a profile's nearest trials are found through.",
  value: 12,
});

/** How many hits and tree nodes a query's work has room for before it grows. */
const WORK_ROOM = handSet({
  name: "WORK_ROOM", sort: "own",
  says: "How many hits and tree nodes the work of a search for nearest trials has room for before it grows.",
  value: 64,
});

/**
 * **`sample`'s trees** (`Tree`), one for the trials that record each set of stance numbers, so each
 * is searched by every number its trials have; made once a sample, when first searched.
 */
const forestOf = remembered((sample: Sample): readonly Tree[] => {
  const { dims, stanced, coords } = sample, groups = new Map<number, number[]>();
  for (let i = 0; i < sample.trials.length; i++) {
    let recorded = 0;
    for (let d = stanced; d < dims; d++) { const v = coords[i * dims + d]!; if (v === v) recorded |= 1 << d - stanced; }
    let group = groups.get(recorded);
    if (!group) groups.set(recorded, group = []);
    group.push(i);
  }
  return [...groups].map(([recorded, trials]) => treeOf(sample, Int32Array.from(trials),
    Int32Array.from({ length: dims }, (_, d) => d).filter((d) => d < stanced || recorded & 1 << d - stanced)));
});

/** **A tree of `sample`'s `trials`**, holding the coordinates `reads` (`Tree`). */
function treeOf(sample: Sample, trials: Int32Array, reads: Int32Array): Tree {
  const n = trials.length, dims = reads.length, stanced = sample.stanced, coords = new Float64Array(sample.trials.length * dims), spans = Float64Array.from(reads, (d) => sample.spans[d]!);
  for (const i of trials) for (let k = 0; k < dims; k++) coords[i * dims + k] = sample.coords[i * sample.dims + reads[k]!]!;
  const order = trials, most = Math.max(1, 2 * Math.ceil(n / LEAF) * 2);
  const start = new Int32Array(most), end = new Int32Array(most), left = new Int32Array(most).fill(-1), right = new Int32Array(most).fill(-1), box = new Float64Array(most * dims * 2);
  let nodes = 0;
  const build = (from: number, to: number): number => {
    const node = nodes++, at = node * dims * 2;
    start[node] = from; end[node] = to;
    for (let d = 0; d < dims; d++) { box[at + d] = Infinity; box[at + dims + d] = -Infinity; }
    for (let p = from; p < to; p++) for (let d = 0, i = order[p]! * dims; d < dims; d++) {
      const v = coords[i + d]!; if (v < box[at + d]!) box[at + d] = v; if (v > box[at + dims + d]!) box[at + dims + d] = v;
    }
    if (to - from <= LEAF) return node;
    let split = 0, widest = -1;
    for (let d = 0; d < dims; d++) { const width = (box[at + dims + d]! - box[at + d]!) / spans[d]!; if (width > widest) { widest = width; split = d; } }
    if (!(widest > 0)) return node;
    const part = order.subarray(from, to).sort((a, b) => coords[a * dims + split]! - coords[b * dims + split]! || a - b), mid = from + (part.length >> 1);
    left[node] = build(from, mid); right[node] = build(mid, to);
    return node;
  };
  build(0, n);
  return { dims, stanced, spans, coords, order, start, end, left, right, box, reads };
}

/** The nearest distances found, ascending, of a search (`nearestOf`): made once, as long as `NEAREST.trials`. */
const BEST = new Float64Array(NEAREST.trials);

/**
 * A nearest query's clamped coordinates and its bound, held through aggregation: the start as its
 * sample reads it (`start`, `readWithin`), what of it the tree searched reads (`query`, NaN where
 * it asks none), and the trials within the bound found (`hits`, `count`), in the sample's order;
 * and the nodes its search has yet to read, each with the least square distance its box allows
 * (`nodes`, `leasts`, a stack).
 */
interface Nearest { bound: number; start: Float64Array; query: Float64Array; hits: Int32Array; count: number; mark: number; nodes: Int32Array; leasts: Float64Array }

/** One query's work; nested queries use a frame of their own until the outer aggregation ends. Its start, query, hits and stack grow to the most a sample asks. */
const nearestWork = (): Nearest => ({ bound: 0, start: new Float64Array(COORDINATE.levels + STANCES.length), query: new Float64Array(COORDINATE.levels + STANCES.length),
  hits: new Int32Array(WORK_ROOM), count: 0, mark: 0, nodes: new Int32Array(WORK_ROOM), leasts: new Float64Array(WORK_ROOM) });
const QUERY_WORK = { depth: 0, frames: [nearestWork()], marks: 0 };

/** Keep `distances`' `i`th among the nearest `want`, returning how many have been found: read from the array, as a number passed is a heap object. */
function keepNearest(distances: Float64Array, i: number, found: number, want: number): number {
  const d = distances[i]!;
  if (found === want && d >= BEST[want - 1]!) return found;
  let k = found < want ? found++ : want - 1;
  while (k > 0 && BEST[k - 1]! > d) { BEST[k] = BEST[k - 1]!; k--; }
  BEST[k] = d;
  return found;
}


/** The least square distance from `query` to `tree`'s `node`'s box (`squaredFrom`). */
const boxSquared = (tree: Tree, node: number, query: Float64Array): number => squaredFrom(tree, tree.box, node * tree.dims * 2, node * tree.dims * 2 + tree.dims, query);

/** **A start as `sample` reads it, to be written by `readWithin`**: as many coordinates as its own. */
export const readStartOf = (sample: Sample): Float64Array => new Float64Array(sample.dims);

/**
 * **`at`, its bodies at the body numbers `asked`, as `sample` reads it**, into `out` (`readStartOf`):
 * its coordinates (`COORDINATE`), each within the span the sample's trials began at, the range as
 * asked. A start no trial began at says nothing the nearest measured one does not: read as it is,
 * its distance would outweigh the range's and take the few trials begun at the sample's extreme,
 * from whatever range they began at. A stance number not asked, NaN, stays NaN.
 */
export function readWithin(sample: Sample, at: Asked, asked: Float64Array, out: Float64Array): void {
  coordinatesInto(sample, at, asked, out);
  for (let d = 0; d < sample.dims; d++) out[d] = Math.min(sample.high[d]!, Math.max(sample.low[d]!, out[d]!));
}

/**
 * **The trials of `sample` nearest `at`** (`NEAREST`), its bodies at the body numbers `asked`,
 * nearer first and ties together: written into `near`, the distance the farthest of them lies at
 * and the tie beyond (`bound`) and each trial within it in the sample's order (`hits`); false
 * where `sample` is empty. The start is read within the span its trials began at (`readWithin`).
 */
function nearestOf(sample: Sample, at: Asked, asked: Float64Array, near: Nearest): boolean {
  const n = sample.trials.length;
  if (n === 0) return false;
  if (near.start.length < sample.dims) { near.start = new Float64Array(sample.dims); near.query = new Float64Array(sample.dims); }
  const start = near.start;
  readWithin(sample, at, asked, start);
  const forest = forestOf(sample), query = near.query, mark = near.mark = ++QUERY_WORK.marks;
  const want = Math.min(NEAREST.trials, n);
  // Each trial measured, once a query; every trial within the bound is among them.
  let found = 0, measured = 0;
  for (let t = 0; t < forest.length; t++) {
    const tree = forest[t]!;
    // The query asked of this tree: the coordinates it holds.
    for (let k = 0; k < tree.dims; k++) query[k] = start[tree.reads[k]!]!;
    // The nearest: each node nearer first, as a stack of the nodes yet to read (the farther child below the nearer), none whose box
    // lies past the farthest kept and the tie beyond it, which is never nearer than the last.
    let top = 0;
    near.nodes[top] = 0; near.leasts[top++] = 0;
    while (top > 0) {
      const node = near.nodes[--top]!, least = near.leasts[top]!;
      if (found === want) { const bound = BEST[want - 1]! + TIE; if (!(least <= bound * bound)) continue; }
      const l = tree.left[node]!;
      if (l < 0) {
        for (let p = tree.start[node]!; p < tree.end[node]!; p++) {
          const i = tree.order[p]!;
          if (sample.asked[i] !== mark) {
            sample.asked[i] = mark;
            if (measured === near.hits.length) { const more = new Int32Array(measured * 2); more.set(near.hits); near.hits = more; }
            near.hits[measured++] = i;
            measureApart(tree, i, query, sample.distances);
          }
          found = keepNearest(sample.distances, i, found, want);
        }
        continue;
      }
      if (top + 2 > near.nodes.length) {
        const nodes = new Int32Array(near.nodes.length * 2), leasts = new Float64Array(near.leasts.length * 2);
        nodes.set(near.nodes); leasts.set(near.leasts); near.nodes = nodes; near.leasts = leasts;
      }
      const r = tree.right[node]!, toLeft = boxSquared(tree, l, query), toRight = boxSquared(tree, r, query);
      if (toLeft <= toRight) { near.nodes[top] = r; near.leasts[top++] = toRight; near.nodes[top] = l; near.leasts[top++] = toLeft; }
      else { near.nodes[top] = l; near.leasts[top++] = toLeft; near.nodes[top] = r; near.leasts[top++] = toRight; }
    }
  }
  const bound = BEST[want - 1]! + TIE;
  // Every trial within the bound, in the sample's order, as a walk along it read them: few, so sorted in place.
  let count = 0;
  const hits = near.hits;
  for (let k = 0; k < measured; k++) { const i = hits[k]!; if (sample.distances[i]! <= bound) hits[count++] = i; }
  for (let k = 1; k < count; k++) { const i = hits[k]!; let j = k - 1; while (j >= 0 && hits[j]! > i) { hits[j + 1] = hits[j]!; j--; } hits[j + 1] = i; }
  near.bound = bound; near.count = count;
  return true;
}

/** Each trial of `sample` nearest `at` (`nearestOf`), by `each`, in the sample's order. */
export function eachNearest(sample: Sample, at: Asked, asked: Float64Array, each: (trial: Trial) => void): number {
  const depth = QUERY_WORK.depth++, near = QUERY_WORK.frames[depth] ??= nearestWork();
  try {
    if (!nearestOf(sample, at, asked, near)) return 0;
    const hits = near.hits, count = near.count;
    for (let k = 0; k < count; k++) each(sample.trials[hits[k]!]!);
    return count;
  } finally { QUERY_WORK.depth--; }
}
