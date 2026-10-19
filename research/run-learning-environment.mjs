/**
 * The learned run's training environment: a lab actor on the walk and learned run (`learned-run`,
 * policy null), its run steered from here (`RunCycleMemory.steer`) every `DECIDE` control steps,
 * the policy's features read as the skill reads them (`runFeatures`). Node stand, Rapier, 120 Hz.
 *
 * Each episode starts from one of the running states saved as the body comes up to its run
 * (`starts`, s after the walk was asked `warm` m/s), asked a pace drawn from `speeds` (m/s), and
 * lasts `seconds` or until the body is down or the run gives way to the walk. With `change`, the
 * pace asked is drawn again at a random time; with `gust`, a shove of up to that many N s across
 * the body's pelvis at a random time. The reward each decision: holding the pace asked (a broad
 * kernel, so a body well short of it is still drawn on), little sideways drift, the heading held,
 * and being up.
 */
import { modelSpec } from '../src/core/models.ts';
import { NO_COVER } from '../src/core/mind/intent.ts';
import { WALK_RUN } from '../src/core/skills/walk-run.ts';
import { STEER_KEYS } from '../src/core/skills/cycle-run.ts';
import { DECIDE, RUN_FEATURES, runFeatures, steerFrom } from '../src/core/skills/learned-run.ts';
import { cos, sin } from '../src/core/math/real.ts';
import { wrap } from '../src/core/math/turn.ts';
import { labActor } from '../src/lab/actor.ts';
import { LAB_PRESETS } from '../src/lab/scenarios.ts';
import { coreStand, saveStand, loadStand } from '../tests/harness/core-stand.mjs';
import { serialize, deserialize } from 'node:v8';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';

export const RUN_ACTIONS = STEER_KEYS.length;

export async function runEnvironment(configuration = {}) {
  const o = { model: 'workshop-fighter', haste: 0, seed: 1, seconds: 8, speeds: [2.5, 6], warm: 4, starts: [5, 6, 7, 8, 9, 10], change: 0, gust: 0, ...configuration };
  let state = o.seed >>> 0;
  const random = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
  const stand = await coreStand(modelSpec(o.model, undefined, { haste: o.haste }), { ground: true, groundSize: 1000 });
  const asked = { pace: o.warm };
  const actor = labActor(stand.built, stand.world, { mind: { ...LAB_PRESETS.script.config, locomotion: { kind: 'learned-run', ...WALK_RUN, policy: null } } });
  actor.drive({ name: 'run', decide: ({ view }) => ({ move: view.time < 1 ? null : [asked.pace, 0], face: 0, guard: NO_COVER, actions: [] }) });
  const legs = actor.skills.state.legs, walk = legs.walkRun, run = legs.run;
  const states = { body: actor.body.state, skills: actor.skills.state, asked };
  const pelvis = stand.built.segments.get('lowerTrunk') ?? [...stand.built.segments.values()][0];
  // The running states episodes start from.
  const saves = [];
  for (const at of [...o.starts].sort((a, b) => a - b)) {
    while (stand.world.time < at) stand.step(1);
    if (!walk.running || actor.body.view.down) throw new Error(`the run is not under way at ${at} s`);
    while (run.steps % DECIDE !== 0) stand.step(1);
    saves.push(serialize(saveStand(stand.world, states)));
  }
  const features = [], view = () => actor.body.view;
  const observe = () => runFeatures(actor.body, view(), run, walk.heading, walk.pace, walk.spin, features).slice();
  let steps = 0, command = 0, changeAt = Infinity, gustAt = Infinity, gust = [0, 0], returned = 0;
  const reset = (given = {}) => {
    const start = Math.floor(random() * saves.length), drawn = o.speeds[0] + random() * (o.speeds[1] - o.speeds[0]);
    loadStand(stand.world, states, deserialize(saves[given.start ?? start]));
    command = given.command ?? drawn;
    asked.pace = command;
    steps = 0; returned = 0;
    const decisions = Math.round(o.seconds * 120 / DECIDE);
    changeAt = random() < o.change ? Math.floor(random() * decisions) : Infinity;
    gustAt = o.gust > 0 ? Math.floor(random() * decisions) : Infinity;
    const turn = random() * 2 * Math.PI, size = o.gust * random();
    gust = [size * cos(turn), size * sin(turn)];
    return observe();
  };
  const reward = (action) => {
    const s = view().stance, h = walk.heading, along = s.velocity.x * sin(h) + s.velocity.z * cos(h), across = s.velocity.x * cos(h) - s.velocity.z * sin(h);
    const speed = Math.exp(-(((along - command) / 1.5) ** 2)), drift = Math.exp(-((across / 0.4) ** 2)), facing = Math.exp(-((wrap(s.facing - h) / 0.3) ** 2));
    const effort = action.reduce((sum, a) => sum + a * a, 0) / action.length;
    return { value: 0.6 * speed + 0.15 * drift + 0.15 * facing + 0.1 - 0.02 * effort, along, across };
  };
  const step = (action) => {
    if (!Array.isArray(action) || action.length !== RUN_ACTIONS || !action.every(Number.isFinite)) throw new Error('invalid run action');
    const squashed = action.map(Math.tanh);
    steerFrom(squashed, run.steer);
    const decision = steps++;
    if (decision === changeAt) { command = o.speeds[0] + random() * (o.speeds[1] - o.speeds[0]); asked.pace = command; }
    if (decision === gustAt) pelvis.body.applyImpulse(new Vector3(gust[0], 0, gust[1]), pelvis.node.position.clone());
    let down = false, walked = false;
    for (let k = 0; k < DECIDE; k++) {
      stand.step(1);
      if (view().down) { down = true; break; }
      if (!walk.running) { walked = true; break; }
    }
    const r = reward(squashed);
    const terminated = down || walked, truncated = !terminated && steps * DECIDE >= o.seconds * 120;
    const value = terminated ? r.value - 1 : r.value;
    returned += value;
    return { observation: observe(), reward: value, terminated, truncated, info: { along: r.along, across: r.across, command, down, walked, returned, steps } };
  };
  if (observe().length !== RUN_FEATURES) throw new Error('the features are not the policy\'s');
  return { reset, step, observationSize: RUN_FEATURES, actionSize: RUN_ACTIONS, dispose: () => { actor.dispose(); stand.dispose(); } };
}
