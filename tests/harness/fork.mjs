// A fork of a headless bout (skill ceiling session 02, `docs/plans/2026-09-25-skill-ceiling-02-fork.md`).
//
// `captureBout` reads a live bout into data and writes nothing; `forkBout` builds a scratch bout
// from the same options and writes that data into it, and the scratch bout then steps like any
// other. The original is never touched, which `tests/fork.test.mjs` holds to the bit.
//
// The scratch world is built by the same `createBout`, so its bodies, joints and closures pair
// with the original's by construction order and by path (`src/fork/native.ts`, `src/fork/graph.ts`).
// Two things a fork cannot carry: the solver's warm start and contact caches, which Havok keeps
// with no accessor, and a mind handed in as an object (`leftMind`/`rightMind`), which would be
// shared between the two worlds -- `forkBout` refuses those options.

//
// **Two kinds of fork.** A *teleport* fork (the default) writes the capture through Havok's getters
// and setters into a world in any instance, the original's included, and starts with the solver's
// memory cold. An *exact* fork (`captureBout(bout, { heap: true })` and `exactFork`) copies the
// original's whole Havok instance into a fresh one holding a world built by the same code, and is
// the original to the bit -- provided the original was itself built into a fresh instance, so that
// both worlds hold the same handles (`src/fork/native.ts` checks, and throws if not).

import { createBout, freshHavok } from "./bout-runner.mjs";
import { captureWorld, restoreWorld } from "../../src/fork/world.ts";

export function captureBout(bout, options = {}) {
  return captureWorld(bout.scene, bout.forkWorld(), options);
}

/** An exact fork: a fresh Havok instance, the same bout built into it, the original's heap copied over. */
export async function exactFork(options, capture, extra = {}) {
  if (!capture.native.heap) throw new Error("exactFork: take the capture with { heap: true }");
  return forkBout(options, capture, { ...extra, physics: await freshHavok() });
}

/**
 * Build a scratch bout from `options` (the options the original was created with) and restore
 * `capture` into it. `extra` overrides options for the scratch world only -- a Havok instance, a
 * cap -- and may not change what is built.
 */
export function forkBout(options, capture, extra = {}) {
  if (options.leftMind || options.rightMind) {
    throw new Error("forkBout: a mind handed in as an object would be shared by both worlds; name a policy");
  }
  const started = performance.now();
  const fork = createBout({
    ...options,
    settleSeconds: 0,
    onSample: null, onEvent: null, onRefusal: null, onVerdict: null,
    ...extra,
  });
  const built = performance.now();
  try {
    fork.forkReport = restoreWorld(fork.scene, fork.forkWorld(), capture);
    // What a fork costs, split: building the scratch world, and writing the capture into it.
    fork.forkTiming = { buildMs: built - started, restoreMs: performance.now() - built };
  } catch (error) {
    fork.dispose();
    throw error;
  }
  return fork;
}
