/**
 * **The machine a run shares**: how many workers a run takes unless told, and the priority they
 * play at. A run leaves the machine one core (`CORE`), and plays below normal priority, so however
 * many runs overlap, the system and its graphics driver are served first.
 */
import { availableParallelism, constants, setPriority } from "node:os";
import { Worker } from "node:worker_threads";

/** One core's hardware threads: two on a core that runs two at once, as desktop processors do. */
const CORE = 2;

/** The workers a run takes unless told: every hardware thread but one core's, at least one. */
export const defaultLanes = () => Math.max(1, availableParallelism() - CORE);

/**
 * Put this process below normal priority: its worker threads with it (a thread has no priority of
 * its own here), and the processes it starts after (they take their parent's class).
 */
export function belowNormal() {
  setPriority(constants.priority.PRIORITY_BELOW_NORMAL);
}

/** A simulation's worker thread (`new Worker(url, options)`), its process put below normal first. */
export function simulationWorker(url, options) {
  belowNormal();
  return new Worker(url, options);
}
