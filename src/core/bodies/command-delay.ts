/**
 * **A command's delay line**: a ring of `delay` + 1 slots, so that what a mind sends on a step is
 * applied `delay` steps later (`World.delay`). Each step at `full` the command is written in the
 * slot `written` names, the line is read at `applied`, then it advances. A body's first `delay`
 * steps at `full`, from its start or back from another level (`reset`), apply none: nothing was
 * sent that long ago. With no delay the slot written is the one applied.
 */
interface DelayLine {
  /** The steps a command waits. */
  readonly delay: number;
  /** Its slots, `delay` + 1. */
  readonly size: number;
  /** Its memory (`src/core/state.ts`): the commands sent since the body was last its mind's. */
  readonly state: { sent: number };
  /** The slot this step's command is written in. */
  written(): number;
  /** The slot whose command is applied this step, once this step's is written; -1 where none was sent that long ago. */
  applied(): number;
  /** The step's command is written and read: the next step writes the next slot. */
  advance(): void;
  /** Nothing sent is applied: the body is its mind's again from the next command. */
  reset(): void;
}

/** A delay line of `delay` steps (`DelayLine`). */
export function delayLine(delay: number): DelayLine {
  if (!(Number.isInteger(delay) && delay >= 0)) throw new Error(`a command's delay is a whole number of steps, not ${String(delay)}`);
  const size = delay + 1, state = { sent: 0 };
  return {
    delay, size, state,
    written: () => state.sent % size,
    applied: () => state.sent >= delay ? (state.sent - delay) % size : -1,
    advance() { state.sent += 1; },
    reset() { state.sent = 0; },
  };
}

/**
 * **The steps a body's rings hold what its mind sends**, at a world's delay of `delay` steps: none
 * at none; one fewer than the delay otherwise, since there a mind decides once its body has taken
 * the step's command (`embody`), and what it decides goes with the next step's.
 */
export const heldSteps = (delay: number): number => delay > 0 ? delay - 1 : 0;
