/**
 * **Where a body goes, against where each model puts it** (the mind plan's step 13, its predict
 * rung): over a mirror of a Mind, each tree search's root (`move-prior-hook.mjs`), and for the foe
 * and for the body itself, h s on, the place each model says against the place it is.
 *
 *   node research/minds/foe-placement.mjs collect <mind.json> <protocol> <from> <to> <rows.jsonl>
 *   node research/minds/foe-placement.mjs read <rows.jsonl>...
 *   node research/minds/foe-placement.mjs own <rows.jsonl>...
 *
 * `collect` plays the match evaluation's `<protocol>` bouts `<from>` to `<to>`, the Mind on both
 * sides, and appends one line a bout: each root's side (`s`), clock (`t`), the body's place and
 * velocity (`w`, `v`), its focus's centre and velocity (`c`, `fv`), and where the first step of its
 * best-worth line and of its best one-step line expect to leave it ([x, z, seconds], `ch`, `st`; each
 * way it ends by its chance, the body's place where it says none), and the chosen line's first
 * Option, its name, kind and target (`o`, `k`, `g`). It changes no result.
 * `read` says each model's median, mean and 90th percentile error, m, 0.5 and 1 s on: for the
 * foe (its centre as the same side sees it at its first root then), standing, its velocity kept
 * for at most 0.5 s, and the foe's own root's lines at or before then (within 0.25 s), each first
 * step moved along linearly over its seconds and standing after, offset to the centre seen; for the
 * body (its own place then), the same of its own.
 * `own` reads the body's own model where the body kept to it: each root whose chosen Option
 * (name and target) every root of the same side chose again until its first step's seconds were
 * up, the place that step expects against the body's place at the first root from then (within
 * 0.25 s), by the Option's kind and by its seconds; with standing's error over the same roots, and
 * the bias, the mean signed error along the move the step expects (the body further, +) and across it.
 */
import { register } from "node:module";
import { appendFileSync, readFileSync } from "node:fs";

const [mode, ...args] = process.argv.slice(2);
if (mode === "collect") await collect(...args);
else if (mode === "read") read(args);
else if (mode === "own") own(args);
else throw new Error("usage: foe-placement.mjs collect <mind.json> <protocol> <from> <to> <rows.jsonl> | read | own <rows.jsonl>...");

/** Play bouts `from` to `to` of `protocol`, the Mind at `mindPath` on both sides, appending each bout's roots to `out`. */
async function collect(mindPath, protocol, from, to, out) {
  register("./move-prior-hook.mjs", import.meta.url);
  await import("../../tests/harness/preload-data.mjs");
  const { EVALUATIONS, playCase } = await import("../../src/app/node/evaluation.ts");
  const { DEFAULT_ENGINE } = await import("../../src/core/physics/engines.ts");
  const { isRefused } = await import("../../src/core/refusal.ts");
  const mind = JSON.parse(readFileSync(mindPath, "utf8")), evaluation = EVALUATIONS.match, cases = evaluation.protocols[protocol];
  if (!cases) throw new Error(`no match protocol ${protocol}`);
  const [subject] = evaluation.subjects([{ id: "mind", label: "mind", value: mind }, { id: "mind2", label: "mind", value: mind }]);
  const r3 = (x) => Math.round(x * 1e3) / 1e3;
  const endOf = (root, terms) => {
    let x = 0, z = 0;
    for (const o of terms.outcomes) { const w = o.leaves.where ?? root.where; x += o.chance * w.x; z += o.chance * w.z; }
    return [r3(x), r3(z), r3(terms.duration)];
  };
  for (let n = Number(from); n < Number(to); n++) {
    const world = cases.world([subject.value, subject.value], cases.conditions[n], cases.engine ?? DEFAULT_ENGINE, [{}, {}]);
    if (isRefused(world)) throw new Error(world.refused);
    let duel = null; const rows = [];
    globalThis.__searchLines = (root, at, edges) => {
      if (!duel || !root.focus || !root.where || edges.length < 1) return;
      let chosen = edges[0], step = edges[0], stepPrice = -Infinity;
      for (const edge of edges) {
        if (edge.worth > chosen.worth) chosen = edge;
        const price = at.price(edge.step, root);
        if (price > stepPrice) { stepPrice = price; step = edge; }
      }
      const f = root.focus, v = root.velocity ?? { x: 0, z: 0 };
      rows.push({ s: f.side === "left" ? "right" : "left", t: r3(duel.clock), w: [r3(root.where.x), r3(root.where.z)], v: [r3(v.x), r3(v.z)],
        c: [r3(f.centre.x), r3(f.centre.z)], fv: [r3(f.velocity.x), r3(f.velocity.z)], ch: endOf(root, chosen.step.terms), st: endOf(root, step.step.terms),
        o: chosen.pair.option.name, k: chosen.pair.option.kind, g: chosen.pair.target });
    };
    const played = await playCase(world, cases.seconds, (built) => {
      duel = built.duel; const reader = cases.read(built, cases.conditions[n]);
      return { afterStep() { reader.afterStep(); }, get ended() { return reader.ended; }, reading: () => reader.reading() };
    }, {});
    if (isRefused(played)) throw new Error(played.refused);
    appendFileSync(out, JSON.stringify({ b: n, rows }) + "\n");
    console.log(`${protocol}/${n}: ${rows.length} roots, ${duel.clock.toFixed(1)} s`);
  }
}

/** Say each model's error for the foe and for the body, over the roots in `files`. */
function read(files) {
  const H = [0.5, 1], errors = new Map();
  const add = (key, e) => (errors.get(key) ?? errors.set(key, []).get(key)).push(e);
  const firstFrom = (rows, t) => { let lo = 0, hi = rows.length; while (lo < hi) { const m = (lo + hi) >> 1; if (rows[m].t < t - 1e-9) lo = m + 1; else hi = m; } return rows[lo]; };
  const lastTo = (rows, t) => { let found = null; for (let lo = 0, hi = rows.length; lo < hi;) { const m = (lo + hi) >> 1; if (rows[m].t <= t + 1e-9) { found = rows[m]; lo = m + 1; } else hi = m; } return found; };
  const along = (w, end, s) => { const f = end[2] > 0 ? Math.min(1, s / end[2]) : 1; return [w[0] + (end[0] - w[0]) * f, w[1] + (end[1] - w[1]) * f]; };
  const kept = (p, v, h) => [p[0] + v[0] * Math.min(h, .5), p[1] + v[1] * Math.min(h, .5)];
  for (const file of files) for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line) continue;
    const { rows } = JSON.parse(line), sides = { left: rows.filter((r) => r.s === "left"), right: rows.filter((r) => r.s === "right") };
    for (const [side, own] of Object.entries(sides)) {
      const foe = sides[side === "left" ? "right" : "left"];
      for (const r of own) for (const h of H) {
        const later = firstFrom(own, r.t + h);
        if (!later || later.t > r.t + h + 0.25) continue;
        const off = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
        for (const [model, p] of Object.entries({ standing: r.w, "velocity, at most 0.5 s": kept(r.w, r.v, h), "one-step best": along(r.w, r.st, h), "search's choice": along(r.w, r.ch, h) }))
          add(`body | ${model} | ${h}`, off(p, later.w));
        const b = lastTo(foe, r.t);
        if (!b || r.t - b.t > 0.25) continue;
        const shift = [r.c[0] - b.w[0], r.c[1] - b.w[1]], s = r.t + h - b.t, seen = (p) => [p[0] + shift[0], p[1] + shift[1]];
        for (const [model, p] of Object.entries({ standing: r.c, "velocity, at most 0.5 s": kept(r.c, r.fv, h), "one-step best": seen(along(b.w, b.st, s)), "search's choice": seen(along(b.w, b.ch, s)) }))
          add(`foe | ${model} | ${h}`, off(p, later.c));
      }
    }
  }
  const q = (xs, p) => xs[Math.min(xs.length - 1, Math.floor(p * xs.length))];
  console.log("whose | model | h s | roots | error m: median, mean, 90th");
  for (const [key, xs] of [...errors.entries()].sort()) {
    xs.sort((a, b) => a - b);
    console.log(`${key} | ${xs.length} | ${q(xs, .5).toFixed(3)}, ${(xs.reduce((s, v) => s + v, 0) / xs.length).toFixed(3)}, ${q(xs, .9).toFixed(3)}`);
  }
}

/** Say the body's own model's error where it kept to the Option it chose, over the roots in `files`, by kind and by seconds. */
function own(files) {
  const groups = new Map(), add = (key, row) => (groups.get(key) ?? groups.set(key, []).get(key)).push(row);
  const bin = (s) => s < .5 ? "under 0.5 s" : s < 1 ? "0.5 to 1 s" : s < 2 ? "1 to 2 s" : "2 s or more";
  let roots = 0, kept = 0;
  for (const file of files) for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line) continue;
    const { rows } = JSON.parse(line);
    for (const side of ["left", "right"]) {
      const own = rows.filter((r) => r.s === side);
      for (let i = 0; i < own.length; i++) {
        const r = own[i];
        if (r.o === undefined) throw new Error("rows without the chosen Option: collect them again");
        roots++;
        const d = r.ch[2], end = r.t + d;
        let j = i + 1;
        while (j < own.length && own[j].t < end - 1e-9 && own[j].o === r.o && own[j].g === r.g) j++;
        if (j >= own.length || own[j].t < end - 1e-9 || own[j].t > end + .25) continue;
        kept++;
        const at = own[j].w, mx = r.ch[0] - r.w[0], mz = r.ch[1] - r.w[1], moved = Math.hypot(mx, mz);
        const ex = at[0] - r.ch[0], ez = at[1] - r.ch[1];
        const ux = moved > 1e-6 ? mx / moved : 0, uz = moved > 1e-6 ? mz / moved : 0;
        const row = { model: Math.hypot(ex, ez), standing: Math.hypot(at[0] - r.w[0], at[1] - r.w[1]), along: moved > 1e-6 ? ex * ux + ez * uz : 0, across: moved > 1e-6 ? ex * uz - ez * ux : 0, moved };
        add(`all`, row); add(`kind ${r.k}`, row); add(`seconds ${bin(d)}`, row);
      }
    }
  }
  const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
  const mean = (xs) => xs.reduce((s, v) => s + v, 0) / xs.length, sd = (xs) => { const m = mean(xs); return Math.sqrt(xs.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, xs.length - 1)); };
  console.log(`${kept} of ${roots} roots kept to their Option until its first step's seconds were up`);
  console.log("group | roots | expected move m, median | model error m: median, 90th | standing's: median, 90th | beyond its end along the move m (+ further): mean ± se, sd | across m: mean ± se, sd");
  for (const [key, xs] of [...groups.entries()].sort()) {
    const f = (k) => xs.map((x) => x[k]), n = xs.length, se = (k) => sd(f(k)) / Math.sqrt(n);
    console.log(`${key} | ${n} | ${q(f("moved"), .5).toFixed(3)} | ${q(f("model"), .5).toFixed(3)}, ${q(f("model"), .9).toFixed(3)} | ${q(f("standing"), .5).toFixed(3)}, ${q(f("standing"), .9).toFixed(3)} | ${mean(f("along")).toFixed(3)} ± ${se("along").toFixed(3)}, ${sd(f("along")).toFixed(3)} | ${mean(f("across")).toFixed(3)} ± ${se("across").toFixed(3)}, ${sd(f("across")).toFixed(3)}`);
  }
}
