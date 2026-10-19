/**
 * **The stand-up feedback search's witness** (`research/stand-up-feedback-seed.json`), replayed on the
 * Node core stand, Rapier, and not a gate (`tests/experimental.json`): through the actual host it
 * reproduces its recorded slow recovery from a fresh fall. What a recipe holds is
 * `research-recovery-feedback.test.mjs`'s.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { feedbackTrial, FEEDBACK_PARAMETERS } from '../research/stand-up-feedback.mjs';
import witness from '../research/stand-up-feedback-seed.json' with { type: 'json' };

test('the portable slow witness reproduces a complete fresh-fall recovery through the actual host', async () => {
  assert.deepEqual(witness.feedback.parameters, FEEDBACK_PARAMETERS);
  const replay = await feedbackTrial(witness.configuration, witness.feedback.u);
  assert.deepEqual(replay.result, witness.result);
  assert.equal(replay.result.success, true);
  assert.ok(replay.result.seconds > 6, 'this seed does not satisfy the fast-recovery requirement');
});
