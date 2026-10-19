/**
 * The learned run's training environment, a trial as the gait battery plays one
 * (`run-cycle-search.mjs`): a body of `model` in its guard (`guardPosture`), the club in its right
 * hand if `held` is `club`, at `haste`, under its character's balance, on the walk and learned run
 * (`learnedRun`, policy null), its gait timed to its haste at `hasted` (`WalkRunSettings.hasted`), its run steered from here (`RunCycleMemory.steer`) every `DECIDE`
 * control steps, the policy's features read as the skill reads them (`runFeatures`). Node stand,
 * Rapier, 120 Hz.
 *
 * Each episode starts from one of the running states saved as the body sets off from a stand
 * asked each of `warm` m/s (`starts`, s after it was asked, those at which it runs), is asked a pace drawn
 * from `speeds`, m/s, and lasts `seconds` or until it falls (as the battery reads a fall) or its run gives way to
 * the walk. In an episode, each by its chance: the pace asked is drawn again at a random time
 * (`change`); the face turns at `turn` rad/s through a quarter turn, either way, from a random
 * time; the body is asked to stop at a random time (`stop`); its run's handing over to the walk once
 * asked to stop, or asked a pace the walk takes (`WalkRunSettings.run`), ends the episode as a
 * time limit does; the Lab's gusts blow (`gust`: rate, strength N, up to `gustMost` times as
 * strong), on seeds from `seed` up, never the battery's.
 *
 * The reward each decision: the speed along the heading near the pace the walk and run asks (its
 * ramp, so a body setting off is not asked a pace it cannot have yet), within about 1 m/s of it
 * past it and `tolerance` m/s short of it, or, with `share`, that share of the pace; little drift across it, the heading held, and being up;
 * a fall, or the walk taking a run asked faster than it, costs 1.
 */
import { modelSpec } from '../src/core/models.ts';
import { armed } from '../src/core/human/grip.ts';
import { woodenClub } from '../src/core/items/club.ts';
import { balanceCeiling, balancePercent, rulebook } from '../src/core/rules/rulebook.ts';
import { createBody } from '../src/core/body.ts';
import { guardPosture } from '../src/core/skills/guard.ts';
import { WALK_RUN, WALK_RUN_CYCLE } from '../src/core/skills/walk-run.ts';
import { runCycleSettings, STEER_KEYS } from '../src/core/skills/cycle-run.ts';
import { DECIDE, RUN_FEATURES, learnedRun, runFeatures, steerFrom } from '../src/core/skills/learned-run.ts';
import { cos, sin } from '../src/core/math/real.ts';
import { wrap } from '../src/core/math/turn.ts';
import { startWind } from '../src/lab/wind.ts';
import { coreStand, saveStand, loadStand } from '../tests/harness/core-stand.mjs';
import { serialize, deserialize } from 'node:v8';

export const RUN_ACTIONS = STEER_KEYS.length;

/** The battery's fall: the centre of mass under this share of its standing height over the soles. */
const FALLEN = 0.55;

export async function runEnvironment(configuration = {}) {
  const o = { model: 'workshop-fighter', held: 'empty', haste: 0, seed: 1, seconds: 8, speeds: [1.4, 6], warm: [3, 4.5], starts: [3, 5, 7, 9],
    tolerance: 1, change: 0.3, turn: 0.6, turning: 0.25, stop: 0.2, gust: [1, 5], gusting: 0.6, gustMost: 3, ...configuration };
  let word = (o.seed * 2654435761) >>> 0;
  const random = () => ((word = (Math.imul(word, 1664525) + 1013904223) >>> 0) / 4294967296);
  const draw = () => o.speeds[0] + random() * (o.speeds[1] - o.speeds[0]);
  const own = modelSpec(o.model, undefined, { haste: o.haste }), spec = o.held === 'club' ? armed(own, 'right', woodenClub()) : own, guard = guardPosture(spec);
  const stand = await coreStand(spec, { ground: true, groundSize: 4000, posture: guard });
  const assist = balanceCeiling(stand.built.spec.attributes.balance.value, balancePercent(rulebook('arena')));
  const body = createBody(stand.built, stand.world, { servoSeconds: 0.1, measuring: true, assist });
  const skill = learnedRun(body, null, { ...WALK_RUN, hasted: o.hasted ?? WALK_RUN.hasted }, runCycleSettings(undefined, WALK_RUN_CYCLE));
  const walk = skill.state.walkRun, run = skill.state.run;
  const ask = { pace: 0, running: false, face: 0 };
  let goal = null;
  body.drive((view, dt) => {
    const d = skill.drive(view, ask.running ? [ask.pace, 0] : null, ask.face, dt);
    if (d.kind === 'drive') return { posture: { ...guard, ...d.posture }, pushes: d.pushes, stance: null };
    goal = d.goal ?? goal;
    return { posture: guard, pushes: [], stance: view.time > 0 ? goal : null };
  });
  const states = { body: body.state, skills: skill.state, ask };
  stand.step(stand.seconds(1));
  const standing = body.view.stance.centre.y - body.view.stance.support.y;
  const rest = serialize(saveStand(stand.world, states));
  // The running states episodes start from.
  const saves = [];
  for (const pace of o.warm) {
    loadStand(stand.world, states, deserialize(rest)); goal = null;
    Object.assign(ask, { pace, running: true, face: 0 });
    const from = stand.world.time;
    for (const at of [...o.starts].sort((a, b) => a - b)) {
      while (stand.world.time - from < at) stand.step(1);
      if (body.view.down) break;
      if (!walk.running) continue;
      while (run.steps % DECIDE !== 0) stand.step(1);
      saves.push(serialize(saveStand(stand.world, states)));
    }
  }
  if (!saves.length) throw new Error(`${o.model} runs at none of ${o.warm.join(", ")} m/s`);
  const features = [], view = () => body.view;
  const observe = () => runFeatures(body, view(), run, walk.heading, walk.pace, walk.spin, features).slice();
  let wind = null, gusts = 0;
  const e = { steps: 0, decisions: 0, changeAt: Infinity, turnAt: Infinity, turnWay: 1, stopAt: Infinity, stopped: false };
  const reset = (given = {}) => {
    wind?.dispose(); wind = null;
    loadStand(stand.world, states, deserialize(saves[given.start ?? Math.floor(random() * saves.length)])); goal = null;
    Object.assign(ask, { pace: given.command ?? draw(), running: true, face: walk.heading });
    const decisions = Math.round(o.seconds * 120 / DECIDE), at = () => Math.floor(random() * decisions);
    Object.assign(e, { steps: 0, decisions, stopped: false, changeAt: random() < o.change ? at() : Infinity, turnAt: random() < o.turning ? at() : Infinity,
      turnWay: random() < 0.5 ? 1 : -1, stopAt: random() < o.stop ? at() : Infinity, turned: 0 });
    if (given.calm !== true && random() < o.gusting) wind = startWind(stand.built, stand.world, { rate: o.gust[0], strength: o.gust[1] * (1 + (o.gustMost - 1) * random()) }, 100000 + o.seed * 1000 + gusts++);
    return observe();
  };
  const reward = (action) => {
    const s = view().stance, h = walk.heading, along = s.velocity.x * sin(h) + s.velocity.z * cos(h), across = s.velocity.x * cos(h) - s.velocity.z * sin(h);
    const short = o.share === undefined ? o.tolerance : Math.max(o.share * walk.pace, 0.1);
    const speed = Math.exp(-(((along - walk.pace) / (along < walk.pace ? short : 1)) ** 2)), drift = Math.exp(-((across / 0.4) ** 2)), facing = Math.exp(-((wrap(s.facing - h) / 0.3) ** 2));
    const effort = action.reduce((sum, a) => sum + a * a, 0) / action.length;
    return { value: 0.6 * speed + 0.15 * drift + 0.15 * facing + 0.1 - 0.02 * effort, along, across };
  };
  const step = (action) => {
    if (!Array.isArray(action) || action.length !== RUN_ACTIONS || !action.every(Number.isFinite)) throw new Error('invalid run action');
    const squashed = action.map(Math.tanh);
    steerFrom(squashed, run.steer);
    const decision = e.steps++;
    if (decision === e.changeAt) ask.pace = draw();
    if (decision === e.stopAt) { ask.running = false; e.stopped = true; }
    let down = false, walked = false;
    for (let k = 0; k < DECIDE; k++) {
      if (decision >= e.turnAt && e.turned < Math.PI / 2) { const by = Math.min(o.turn / stand.world.hz, Math.PI / 2 - e.turned); ask.face += e.turnWay * by; e.turned += by; }
      stand.step(1);
      const s = view().stance, height = s.centre.y - Math.min(s.soles.left.y, s.soles.right.y);
      if (!Number.isFinite(height) || height < FALLEN * standing || view().down) { down = true; break; }
      if (!walk.running) { walked = true; break; }
    }
    const r = reward(squashed);
    const failed = down || (walked && !e.stopped && ask.pace > WALK_RUN.run), terminated = failed;
    const truncated = !terminated && (walked || e.steps >= e.decisions);
    return { observation: observe(), reward: failed ? r.value - 1 : r.value, terminated, truncated,
      info: { along: r.along, across: r.across, command: walk.pace, down, walked, stopped: e.stopped, steps: e.steps } };
  };
  if (observe().length !== RUN_FEATURES) throw new Error('the features are not the policy\'s');
  return { reset, step, observationSize: RUN_FEATURES, actionSize: RUN_ACTIONS, dispose: () => { wind?.dispose(); body.dispose(); stand.dispose(); } };
}
