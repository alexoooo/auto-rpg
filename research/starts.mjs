/**
 * **Starts kept from a protocol's openings** (`.cache/starts/<evaluation>/<protocol>/<subject>/`).
 *
 * A protocol whose trials open with play that is the same whatever is then measured names it
 * (`Cases.opening`: a fight up to its drill's moment). A start is a trial's bout saved `LEAD` steps
 * before its opening ends (`makeStart`), kept with its condition and where it came from
 * (`startBank`). A trial played from it (`playFrom`) is a bout of the trial's world loaded with
 * the save, a fresh reader beside it, played to the reader's end: the opening is played once, for
 * the bank, and a trial costs the steps after it.
 *
 * For the subject that made the start, the trial reads what the whole trial reads. A candidate
 * that is the subject under other settings of its mind loads it too (`Duel.load`), so a candidate
 * and what it is read beside play from one world, the same to the bit until their commands differ.
 * The opening is the subject's own whatever the candidate.
 *
 * A start is found by its condition (`caseName`) under its evaluation, protocol and subject. The
 * code is no part of what finds it: it is a state a play came to, and where it came from
 * (`from`, as a kept row's) gates nothing. An opening that never ends inside its trial's seconds
 * is kept as no start (`<name>.none`), so it is not played again.
 *
 *   import { makeStart, playFrom, startBank } from "../starts.mjs";
 *   const bank = startBank("strike", "fights-twin", "option/straight-punch");
 *   if (bank.kept(condition) === null) bank.keep(condition, await makeStart(BOUT_WORLD, cases, world));
 *   if (bank.kept(condition) === "start") reading = await playFrom(BOUT_WORLD, cases, candidateWorld, condition, bank.read(condition).saved);
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { deserialize, serialize } from "node:v8";
import { threadId } from "node:worker_threads";
import { gunzipSync, gzipSync } from "node:zlib";
import { isRefused } from "../src/core/refusal.ts";
import { caseName } from "../src/evaluation/results.ts";
import { commitOf, uncommittedInputs } from "../scripts/build-identity.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

/**
 * How many steps before its opening's end a start is saved: a reader put beside a bout loaded from
 * it sees the opening's last step, and so that the trial had one, before it sees the first step
 * after.
 */
const LEAD = 2;

/** How often an opening is saved as it is played, steps: where it ends is found by playing it, and its start by playing on from the last save before. */
const EVERY = 120;

/**
 * **The start of `world`'s trial**: its bout played until its opening ends (`cases.opening`), then
 * put back to the last save before and played to `LEAD` steps short of that end, and saved there:
 * `{ step, saved }`. Played on from there it must end its opening at the step it did, or the play
 * does not repeat, which is an error. `{ step: null, saved: null }` where the opening lasts past
 * the trial's seconds or ends within `LEAD` steps of the bout's first.
 */
export async function makeStart(kind, cases, world) {
  if (!cases.opening || !kind.save || !kind.load) throw new Error("a start is of a protocol that names its opening, in a world kind that saves and loads");
  const built = await kind.build(world);
  if (isRefused(built)) throw new Error(built.refused);
  try {
    kind.start?.(built, world);
    let step = 0, kept = [{ step, saved: kind.save(built) }];
    do {
      if (kind.clock(built) > cases.seconds) return { step: null, saved: null };
      built.world.step(); step += 1;
      if (step % EVERY === 0) kept = [kept.at(-1), { step, saved: kind.save(built) }];
    } while (cases.opening(built));
    const at = step - LEAD, from = kept.findLast((one) => one.step <= at);
    if (!from) return { step: null, saved: null };
    kind.load(built, from.saved);
    for (let k = from.step; k < at; k++) built.world.step();
    const saved = kind.save(built);
    for (let k = at; k < step; k++) {
      if (k > at && !cases.opening(built)) throw new Error(`an opening played again from a save of it ends at step ${k}, not ${step}`);
      built.world.step();
    }
    if (cases.opening(built)) throw new Error(`an opening played again from a save of it does not end at step ${step}`);
    return { step: at, saved };
  } finally { built.dispose(); }
}

/**
 * **A trial played from a start**: `world` built, `cases`'s reader of `condition` put beside it as
 * beside a trial begun afresh, the bout loaded with `saved` and played to the reader's end: its
 * reading. `after`, where given, is called after each step the reader has read.
 */
export async function playFrom(kind, cases, world, condition, saved, after) {
  const built = await kind.build(world);
  if (isRefused(built)) throw new Error(built.refused);
  try {
    const reader = cases.read(built, condition);
    kind.start?.(built, world);
    kind.load(built, saved);
    while (!reader.ended) {
      if (kind.clock(built) > cases.seconds + 1) throw new Error("the trial ran past its seconds");
      built.world.step(); reader.afterStep();
      after?.(built);
    }
    return reader.reading();
  } finally { built.dispose(); }
}

/**
 * **The starts kept of `subject`'s trials of `evaluation`'s `protocol`**, each by its condition:
 * what is `kept` of one (`start`; `none` where its opening came to no start; null where it has
 * not been played), `read`, a start as kept (`{ condition, from, step, saved }`), and `keep`, which
 * keeps what `makeStart` made of one with where it came from (the commit checked out, whether a
 * build input differed from it, and when).
 */
export function startBank(evaluation, protocol, subject) {
  const folder = join(ROOT, ".cache/starts", evaluation, protocol, subject.replace(/[^\w.+-]/g, "_"));
  const fileOf = (condition, kind) => join(folder, `${caseName(condition)}.${kind}`);
  let origin = null;
  return {
    kept: (condition) => existsSync(fileOf(condition, "start")) ? "start" : existsSync(fileOf(condition, "none")) ? "none" : null,
    read: (condition) => deserialize(gunzipSync(readFileSync(fileOf(condition, "start")))),
    keep(condition, { step, saved }) {
      if (!origin) { const commit = commitOf(); origin = { commit, changed: commit !== null && uncommittedInputs().length > 0 }; }
      const from = { ...origin, date: new Date().toISOString() }, file = fileOf(condition, saved === null ? "none" : "start"), part = `${file}.${process.pid}-${threadId}.part`;
      mkdirSync(folder, { recursive: true });
      writeFileSync(part, saved === null ? `${JSON.stringify({ condition, from })}\n` : gzipSync(serialize({ condition, from, step, saved })));
      renameSync(part, file);
    },
  };
}
