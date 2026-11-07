/**
 * **The one stepping loop of learning** over a part's learner (`Learner`,
 * `src/core/math/learning/learner.ts`): the trainer answers the learner's pending request, and the
 * world steps until the learner asks again or the episode ends. The learner's own schedule sets how
 * many steps an action covers; an environment supplies only its world step, that step's reward and
 * its ending.
 *
 * `step()` steps the world once and returns what that step earned and how the episode ended with
 * it: `{ reward, ended }`, `ended` null while it plays, else the environment's name for the end.
 * An episode whose learner stops running ends `done`, after the environment's own ending.
 */
import { answer, pending } from '../src/core/math/learning/learner.ts';

/** `learner`'s world stepped until a request is pending (`asked`), the episode ends (its ending), or `limit` steps pass (`more`). */
export function untilAsked(learner, step, limit = Infinity) {
  for (let k = 0; k < limit; k++) {
    if (pending(learner)) return 'asked';
    const { ended } = step();
    if (ended) return ended;
  }
  return pending(learner) ? 'asked' : 'more';
}

/**
 * One transition: `action` answers the pending request, then the world steps until the learner
 * asks again or the episode ends. Returns the reward summed over those steps, their count and
 * seconds at `dt` s a step, and the ending (null where the learner asked again).
 */
export function decide(learner, action, step, dt) {
  answer(learner, action);
  let reward = 0, steps = 0, ended = null;
  do {
    const read = step();
    reward += read.reward; steps++;
    ended = read.ended ?? (learner.running ? null : 'done');
  } while (ended === null && !pending(learner));
  return { reward, steps, seconds: steps * dt, ended };
}
