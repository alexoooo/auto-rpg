/**
 * **The flat solves answer as `linalg.ts` does, to the bit.** Each of `flat.ts`'s solves is held to
 * its twin on seeded systems of 1 to 14 unknowns, every entry the same by `Object.is` (a `-0` is
 * not a `0`, a NaN is a NaN): integers with ties in a column, so a pivot's choice shows; zeros on
 * a diagonal; a zero column, whose sums are of `-0`s; a singular system; bounds that all bind, and
 * bounds none does. One work, made for the largest, answers every size in turn as a fresh one does.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { boundedLeastSquares, fixedSolve, solveLinear } from "../src/core/math/linalg.ts";
import { boundedLeastSquaresTo, boundedWork, fixedSolveTo, fixedWork, linearWork, solveLinearTo } from "../src/core/math/flat.ts";

/** A seeded stream in [0, 1): mulberry32. */
function stream(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A system's kind, by its index: what makes its arithmetic show a slip. */
const KINDS = ["real", "ties", "zero-diagonal", "zero-column", "singular"];

/** A `rows` by `columns` matrix of `kind`, its rows. */
function matrix(random, rows, columns, kind) {
  const entry = () => (kind === "ties" ? Math.floor(random() * 5) - 2 : 4 * random() - 2);
  const A = Array.from({ length: rows }, () => Array.from({ length: columns }, entry));
  if (kind === "zero-diagonal") for (let i = 0; i < Math.min(rows, columns); i++) A[i][i] = 0;
  if (kind === "zero-column") for (const row of A) row[columns - 1] = 0;
  if (kind === "singular" && rows > 1) A[rows - 1] = [...A[0]];
  return A;
}

const flat = (A) => Float64Array.from(A.flat());
const vector = (random, n) => Array.from({ length: n }, () => 4 * random() - 2);

/** Every entry of `got` is `want`'s, by `Object.is`. */
function same(got, want, what) {
  assert.equal(got.length >= want.length, true, what);
  for (let i = 0; i < want.length; i++) assert.ok(Object.is(got[i], want[i]), `${what}: entry ${i} is ${got[i]}, not ${want[i]}`);
}

const LARGEST = 14, CASES = 200;

test("solve_linear_to_answers_as_solve_linear", () => {
  const random = stream(1), shared = linearWork(LARGEST);
  let pivoted = 0;
  for (let c = 0; c < CASES; c++) {
    const n = 1 + (c % LARGEST), kind = KINDS[c % KINDS.length];
    const A = matrix(random, n, n, kind), y = vector(random, n);
    const want = solveLinear(A, y), a = flat(A);
    same(solveLinearTo(shared, a, y, n, new Float64Array(n)), want, `case ${c} (${kind}, ${n}), the shared work`);
    same(solveLinearTo(linearWork(n), a, y, n, new Float64Array(n)), want, `case ${c} (${kind}, ${n}), a fresh work`);
    same(a, A.flat(), `case ${c}: A is left as it was`);
    if (kind === "ties" && n > 2) pivoted++;
  }
  assert.ok(pivoted > 10);
});

test("fixed_solve_to_answers_as_fixed_solve", () => {
  const random = stream(2), shared = fixedWork(6, LARGEST);
  const held = { none: 0, some: 0, all: 0 };
  for (let c = 0; c < CASES; c++) {
    const rows = 1 + (c % 6), columns = 1 + (c % LARGEST), kind = KINDS[c % KINDS.length];
    const J = matrix(random, rows, columns, kind), y = vector(random, rows);
    // A third hold nothing, a third some, and some of the rest every entry.
    const fixed = Array.from({ length: columns }, () => (c % 3 === 0 ? NaN : c % 3 === 1 && random() < 0.5 ? NaN : c % 7 === 2 ? 4 * random() - 2 : random() < 0.6 ? NaN : -0.5));
    const count = fixed.filter((v) => !Number.isNaN(v)).length;
    held[count === 0 ? "none" : count === columns ? "all" : "some"]++;
    const damping = 0.01 + 0.1 * random(), want = fixedSolve(J, y, fixed, damping);
    same(fixedSolveTo(shared, flat(J), y, rows, columns, fixed, damping, new Float64Array(columns)), want, `case ${c} (${kind}, ${rows} by ${columns}), the shared work`);
    same(fixedSolveTo(fixedWork(rows, columns), flat(J), y, rows, columns, fixed, damping, new Float64Array(columns)), want, `case ${c}, a fresh work`);
  }
  assert.ok(held.none > 10 && held.some > 10 && held.all > 0, JSON.stringify(held));
});

test("bounded_least_squares_to_answers_as_bounded_least_squares", () => {
  const random = stream(3), shared = boundedWork(LARGEST);
  const bound = { none: 0, all: 0, some: 0 };
  for (let c = 0; c < CASES; c++) {
    const n = 1 + (c % LARGEST), kind = KINDS[c % KINDS.length];
    // A = G' G: symmetric and positive semidefinite, singular where G is.
    const G = matrix(random, n, n, kind), A = G.map((_, i) => G.map((_r, j) => G.reduce((sum, row) => sum + row[i] * row[j], 0)));
    const y = vector(random, n), width = c % 4 === 0 ? 10 : c % 4 === 1 ? 0.01 : 0.6 * random();
    const lo = y.map((v) => (c % 4 === 1 ? v + 1 : -width - random())), hi = lo.map((v) => v + 2 * width);
    const want = boundedLeastSquares(A, y, lo, hi);
    const binding = want.filter((v, i) => v === lo[i] || v === hi[i]).length;
    bound[binding === 0 ? "none" : binding === n ? "all" : "some"]++;
    same(boundedLeastSquaresTo(shared, flat(A), y, lo, hi, n, new Float64Array(n)), want, `case ${c} (${kind}, ${n}), the shared work`);
    same(boundedLeastSquaresTo(boundedWork(n), flat(A), y, lo, hi, n, new Float64Array(n)), want, `case ${c}, a fresh work`);
  }
  assert.ok(bound.none > 10 && bound.all > 10 && bound.some > 10, JSON.stringify(bound));
});

test("a_solve_too_large_for_its_work_says_so", () => {
  assert.throws(() => solveLinearTo(linearWork(2), new Float64Array(9), [1, 2, 3], 3, new Float64Array(3)), /3 rows in a work made for 2/);
  assert.throws(() => fixedSolveTo(fixedWork(2, 2), new Float64Array(6), [1, 2], 2, 3, [NaN, NaN, NaN], 0.1, new Float64Array(3)), /2 by 3 solve/);
  assert.throws(() => boundedLeastSquaresTo(boundedWork(2), new Float64Array(9), [1, 2, 3], [0, 0, 0], [1, 1, 1], 3, new Float64Array(3)), /3 unknowns/);
});
