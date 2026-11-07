/**
 * **A learnable part's seam**, kept in its memory as `learner`: the one schedule and handoff of a
 * learned decision, the same for a network in the part and a trainer outside the world.
 *
 * Each control step the part calls `act` before its motor commands and `ask` after them. `ask`
 * keeps the schedule: on the first step after a `start` or `restart`, then every `interval` s,
 * rounded to whole control steps, it is a decision; while the learner runs, that decision is a
 * request (`decisions` counts them) and the part writes what it reads into `inputs`. A request is
 * answered once, into `outputs`: by a trainer between world steps (`answer`), or by the part's
 * network as `act` next takes it. Either way the answer acts from the control step after its
 * request until the next answer. Before a run's first answer, `outputs` is empty.
 */
export interface Learner {
  readonly inputs: number[];
  readonly outputs: number[];
  /** The decision interval, s. */
  readonly interval: number;
  /** Requests published; the last one's observation is `inputs`. */
  decisions: number;
  /** The request `outputs` answers. */
  answered: number;
  /** Control steps until the next decision. */
  due: number;
  /** Whether its decisions are requests: a punch's steered drive, a bare mind always. */
  running: boolean;
}

/** A learner of `inputs` readings deciding every `interval` s that has asked nothing, running or not. */
export function learnerOf(inputs: number, interval: number, running: boolean): Learner {
  if (!(interval > 0) || !Number.isFinite(interval)) throw new Error("a learner's decision interval is finite and positive");
  return { inputs: new Array<number>(inputs).fill(0), outputs: [], interval, decisions: 0, answered: 0, due: 0, running };
}

/** Control steps between decisions at `dt` s a step: the interval rounded, one at least. */
export const decisionSteps = (learner: Learner, dt: number): number => Math.max(1, Math.round(learner.interval / dt));

/** Whether a request waits for its answer. */
export const pending = (learner: Learner): boolean => learner.answered !== learner.decisions;

/** Its runs begin: its next step decides, and it holds no answer until its first request is answered. */
export function start(learner: Learner): void {
  learner.running = true; learner.due = 0; learner.answered = learner.decisions; learner.outputs.length = 0;
}

/** Its run ends: it asks nothing more; a pending request is dropped. */
export function stop(learner: Learner): void {
  learner.running = false; learner.answered = learner.decisions;
}

/** Its schedule begins again, keeping its answer: its next step decides. */
export function restart(learner: Learner): void {
  learner.due = 0;
}

/**
 * The schedule's step, called once a control step after the part's motor commands: whether this
 * step decides. While the learner runs a decision is a request, whose `inputs` the caller writes now.
 */
export function ask(learner: Learner, dt: number): boolean {
  if (learner.due > 0) { learner.due--; return false; }
  learner.due = decisionSteps(learner, dt) - 1;
  if (learner.running) learner.decisions++;
  return true;
}

/** `action` as the answer to the pending request. */
function write(learner: Learner, action: readonly number[]): void {
  learner.outputs.length = 0;
  for (let i = 0; i < action.length; i++) learner.outputs.push(action[i]!);
  learner.answered = learner.decisions;
}

/** A trainer's answer to the pending request, between world steps. Answering none is a defect. */
export function answer(learner: Learner, action: readonly number[]): void {
  if (!pending(learner)) throw new Error("a learner was answered with no request pending");
  write(learner, action);
}

/**
 * The answer in force this control step, called before the part's motor commands: `policy`, the
 * part's network, answers a pending request here from its `inputs`. A pending request with no
 * policy is a defect: its trainer did not answer it.
 */
export function act(learner: Learner, policy?: (inputs: readonly number[]) => readonly number[]): readonly number[] {
  if (pending(learner)) {
    if (!policy) throw new Error(`learner request ${learner.decisions} is unanswered`);
    write(learner, policy(learner.inputs));
  }
  return learner.outputs;
}
