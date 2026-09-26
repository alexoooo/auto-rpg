/**
 * One bout of a side mirror, with the trajectory it took hashed as it went.
 *
 * `research/side-mirror.mjs` runs these through `runJobs` in `research/runner.mjs` (a fresh Havok
 * per bout, one bout per worker realm at a time); `tests/side-mirror.test.mjs` calls `playMirror`
 * directly, one bout after another in its own realm.
 *
 * **Why a trajectory hash.** Every bout of one mind pairing plays the same opening whatever its
 * seeds (`docs/analysis/2026-09-25-rate-control-clock.md`), and a mind whose seed reaches nothing
 * plays the same *whole* bout whatever its seeds. Such a mirror's 128 bouts are one bout counted
 * 128 times, and a band taken on 128 would be a band on nothing. So every bout carries a running
 * hash of both bodies -- every limb's position and health, both bars -- taken every
 * `SAMPLE_FRAMES` frames, with its prefix read off at each of `CHECKPOINTS`. Equal final hashes are
 * one bout; the prefixes say how long a mirror's bouts share their opening before they part.
 *
 * **Seeding.** Each side's mind is built from its own seed, `seeds[0]` on the left and `seeds[1]` on
 * the right, which is what `createBout` does for a mind named by string. A mind built here and handed
 * over must reproduce that split, or the right side shares its opponent's stream (the memory
 * `probe-minds-need-side-correct-seeds`). `makeMind` exists for a caller that wants to hand in
 * something other than the registered mind -- a handicapped side, in the test's control -- and it is
 * given the seed of its own side.
 */
import { parentPort } from "node:worker_threads";
import { createHash } from "node:crypto";
import { Logger } from "@babylonjs/core/Misc/logger.js";
import { createBout, freshHavok } from "../tests/harness/bout-runner.mjs";
import { policyMind } from "../src/mind.ts";
import { CHECKPOINTS, SAMPLE_FRAMES } from "./side-mirror.mjs";
Logger.LogLevels = Logger.ErrorLogLevel;


const sideMind = (name, seed) => policyMind(name, seed);

/**
 * Plays one job: `{ left, right, seeds, build? }`, and `manifest.protocol` for the bout's cap and
 * locomotion mode. Returns the row `summarizeMirror` reads.
 */
export async function playMirror(job, manifest, { makeMind = sideMind } = {}) {
  const setup = manifest.build ?? undefined;
  const bout = createBout({
    left: job.left, right: job.right, seeds: job.seeds,
    leftMind: makeMind(job.left, job.seeds[0], "left"), rightMind: makeMind(job.right, job.seeds[1], "right"),
    leftGolem: setup, rightGolem: setup,
    ...manifest.protocol, physics: await freshHavok(),
  });
  const hash = createHash("sha1");
  const floats = new Float64Array(1);
  const bytes = new Uint8Array(floats.buffer);
  const put = (x) => { floats[0] = x; hash.update(bytes); };
  const sample = () => {
    for (const body of [bout.left, bout.right]) {
      for (const limb of body.limbs) {
        const p = limb.part.mesh.position;
        put(p.x); put(p.y); put(p.z); put(limb.health);
      }
      put(body.vitality);
    }
  };
  const prefixes = {};
  let result, vitality, frames = 0, next = 0;
  try {
    while (bout.step()) {
      frames += 1;
      if (frames % SAMPLE_FRAMES === 0) sample();
      while (next < CHECKPOINTS.length && bout.clock >= CHECKPOINTS[next]) {
        prefixes[CHECKPOINTS[next]] = hash.copy().digest("hex").slice(0, 16);
        next += 1;
      }
    }
    result = bout.finish();
    vitality = [bout.left.vitality, bout.right.vitality];
    sample();
  } finally { bout.dispose(); }
  return {
    ...job, status: "ok", winner: result.winner, ending: result.ending, seconds: result.seconds,
    vitality, damage: [result.left.damage, result.right.damage], hits: [result.left.hits, result.right.hits],
    trajectory: hash.digest("hex").slice(0, 16), prefixes,
  };
}

if (parentPort) parentPort.on("message", async ({ job, manifest }) => {
  try { parentPort.postMessage(await playMirror(job, manifest)); }
  catch (error) { parentPort.postMessage({ ...job, status: "failed", error: String(error?.stack ?? error) }); }
});
