/**
 * The learned rise's training environment: a body of `model`, the club in its right hand if
 * `held` is `club`, under the Lab's stance host with the stand-up sub-mind on the learned rise
 * alone (`learnedRise`, policy null), its rise's steer asked from here (`RiseSteer`) every
 * `RISE_DECIDE` control steps while the rise has the body, its features read as the skill reads
 * them (`readRise`). The world is the recovery environment's (`stand-up-environment.mjs`): Node,
 * Rapier, 120 Hz, Balance `balance`, every muscle `strength` times its strength (`strengthSpec`, 1 to 2:
 * a curriculum's strong end, never the game's).
 *
 * Each episode starts from one of `falls` falls saved as the stand-up takes the body, each from
 * the Lab's two shoves at a direction drawn on `seed`, and lasts until the host has the body back
 * standing (`handover`), or `seconds` after the takeover, or a failure. The reward each decision:
 * the head's rise toward standing, a share of its standing height; a cost of `hurry` for each
 * second; and on standing, 5 and up to `swift` more the sooner it stood (`soon` s or later earns none).
 */
import { recoveryEnvironment } from './stand-up-environment.mjs';
import { TECHNIQUES } from '../src/core/mind/ground/techniques.ts';
import { RISE_DECIDE, learnedRise, readRise, riseFeatures, riseSteerFrom } from '../src/core/mind/ground/learned-rise.ts';
import { RISE_STEER_KEYS } from '../src/core/mind/rise/staged.ts';
import { partLookup } from '../src/core/mind/catalog.ts';
import { GAME_GUARD, kitOf } from '../src/core/mind/kit.ts';
import { modelSpec } from '../src/core/models.ts';
import '../tests/harness/preload-data.mjs';
import { strengthSpec } from '../src/evaluation/fall.ts';

export const RISE_ACTIONS = RISE_STEER_KEYS.length;

export async function riseEnvironment(configuration = {}) {
  const o = { model: 'workshop-fighter', held: 'empty', balance: 0, seed: 1, falls: 12, seconds: 14, hurry: 0.3, soon: 12, swift: 5, strength: 1, ...configuration };
  if (!Number.isFinite(o.strength) || o.strength < 1 || o.strength > 2) throw new Error("a rise environment's strength stays between 1 and 2");
  let word = (o.seed * 2654435761) >>> 0;
  const random = () => ((word = (Math.imul(word, 1664525) + 1013904223) >>> 0) / 4294967296);
  let held = null;
  const registry = { ...TECHNIQUES, 'learned-rise': { ...TECHNIQUES['learned-rise'],
    make(own, view, world, _listed, kit = kitOf(partLookup, own.spec, { guard: GAME_GUARD })) { const run = learnedRise(own, view, world, kit, null); held = { own, view, run }; return run; } } };
  const e = await recoveryEnvironment({ model: o.model, held: o.held, baseline: 'step-up', balance: o.balance,
    ...(o.strength === 1 ? {} : { spec: strengthSpec(modelSpec(o.model), o.strength) }), techniques: ['learned-rise'], registry });
  if (!held) throw new Error('the stand-up made no learned rise');
  const { own, run } = held, view = () => e.body.view, rising = () => run.up.rise.state.phase !== 'idle' || run.up.steadying;
  const standing = e.measure().observation.head[1];
  const fresh = e.save(), falls = [];
  while (falls.length < o.falls) {
    e.restore(fresh);
    const r = await e.fall({ degrees: 360 * random() });
    if (r.takeover !== null && !e.result().failure) falls.push(e.save());
  }
  const features = [], observe = () => readRise(own, view(), run.up.rise, run.up.rise === run.up.rises[0], run.up.steadying, features).slice();
  const size = riseFeatures(own.muscles.channels.length);
  const ep = { decisions: 0, head: 0 };
  const head = () => e.measure().observation.head[1] / standing;
  const zero = Array(RISE_ACTIONS).fill(0);
  const reset = (given = {}) => {
    e.restore(falls[given.start ?? Math.floor(random() * falls.length)]);
    riseSteerFrom(zero, run.state.asked); riseSteerFrom(zero, run.state.steer);
    ep.decisions = 0; ep.head = head();
    return observe();
  };
  const step = (action) => {
    if (!Array.isArray(action) || action.length !== RISE_ACTIONS || !action.every(Number.isFinite)) throw new Error('invalid rise action');
    const squashed = action.map(Math.tanh);
    riseSteerFrom(squashed, run.state.asked);
    ep.decisions++;
    const from = e.result().elapsed;
    // The host's own phases between the rise's attempts (bracing, steadying) are not steered: the world goes on to the rise's next decision.
    let k = 0;
    do { e.step(); k++; } while ((k < RISE_DECIDE || !rising()) && e.result().handover === null && !e.result().failure && e.result().elapsed < o.seconds);
    const r = e.result(), now = head(), effort = squashed.reduce((sum, a) => sum + a * a, 0) / squashed.length;
    let reward = (now - ep.head) - o.hurry * (r.elapsed - from) - 0.01 * effort;
    ep.head = now;
    const stood = r.handover !== null, failed = r.failure !== null;
    if (stood) reward += 5 + o.swift * Math.max(0, 1 - r.seconds / o.soon);
    const terminated = stood || failed, truncated = !terminated && r.elapsed >= o.seconds;
    return { observation: observe(), reward, terminated, truncated,
      info: { stood, failed, seconds: r.seconds, elapsed: r.elapsed, decisions: ep.decisions, head: now } };
  };
  if (observe().length !== size) throw new Error('the features are not the policy\'s');
  // Where the rise is, for a probe: steadying, else its phase and stage, else the host's.
  const where = () => run.up.steadying ? 'steady' : run.up.rise.state.phase !== 'idle' ? `${run.up.rise.state.phase}${run.up.rise.state.stage}` : `host-${run.phase}`;
  return { reset, step, where, inside: () => ({ run, own, view: view(), standing, env: e }), observationSize: size, actionSize: RISE_ACTIONS, dispose: () => e.dispose() };
}
