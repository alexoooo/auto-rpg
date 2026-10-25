/**
 * The steered punch's training environment: a trial of the Strike drill's still rung
 * (`STRIKE_CASES.still`: its world and its reader) a episode, the Puncher's straight punch on a
 * found schedule (`schedule`, a `research/punch-drill.mjs` result, mirrored for the left hand) with
 * `steered` on, its steer set from here at each of its decisions (`PUNCH_DECIDE`) through the drive,
 * its features read as the punch reads them (`punchFeatures`).
 *
 * It keeps `pool` starts, each a bout at a place drawn on `seed` (one of `places`: a body, its
 * gaps and its offsets across, m, each drawn evenly between its two ends; a hand of `hands`, a
 * mark of `marks`, a rate of `rates`), played to its drive's first step and saved (`Duel.save`).
 * An episode loads one of them, a fresh reader beside it, and redraws that start first one time in
 * `refresh`. It ends with the drive, scored by the bar on what the reader read
 * (`scoreOf`, `punch-drill.mjs`; a hit that passes every test counts as landed, the striker's
 * standing left to the drill): that score is the episode's one reward, less `effort` times the
 * steer's mean square at each decision, and, where the fist met nothing on the mark, less `near`
 * for each metre the fist came no nearer the target than over the drive (to 0.5 m).
 *
 * Harness: Node, the bout world (`buildBout`) on Rapier (`DEFAULT_ENGINE`), the drill's layout.
 */
import { readFileSync } from 'node:fs';
import { PUNCH_ACTIONS, PUNCH_FEATURES } from '../src/core/skills/learned-punch.ts';
import { buildBout } from '../src/evaluation/bout.ts';
import { STRIKE_CASES } from '../src/evaluation/strike/cases.ts';
import { CHEST, decode, mirrored, scoreOf, timedPuncher } from './punch-drill.mjs';

export async function punchEnvironment(configuration = {}) {
  const o = { schedule: 'docs/reference/punch-body.json', places: [{ model: 'workshop-fighter', gaps: [0.9, 1], across: [0, 0.1] }], hands: ['right'], marks: ['middle'],
    rates: [120], seed: 1, effort: 0.02, near: 4, pool: 12, refresh: 8, ...configuration };
  let word = (o.seed * 2654435761) >>> 0;
  const random = () => ((word = (Math.imul(word, 1664525) + 1013904223) >>> 0) / 4294967296);
  const pick = (list) => list[Math.floor(random() * list.length)];
  const found = JSON.parse(readFileSync(o.schedule, 'utf8')), cell = found.cell, flags = { driven: !!cell.driven, fire: !!cell.fire, brake: !!cell.brake, ease: !!cell.ease };
  const subjects = Object.fromEntries(['left', 'right'].map((hand) => {
    const x = [...found.best.x];
    if (hand !== cell.hand) mirrored(x, cell.hand, hand);
    const decoded = decode(x, hand, cell.gap ?? undefined, new Set((cell.without ?? []).map((c) => hand === cell.hand ? c : c.replace(`.${cell.hand} `, `.${hand} `))), flags);
    const subject = timedPuncher(decoded, hand, cell.chest ? CHEST : null);
    subject.mind.executors[0].steered = true;
    return [hand, subject];
  }));
  const cases = STRIKE_CASES.still;
  const motionOf = (built) => built.duel.duelists.left.minded.skills.state.actions.executors[0].motion;
  /** A start: a bout at a fresh place played to its drive's first step, and its save; null where the drive never began. */
  const start = async () => {
    const place = pick(o.places), between = ([lo, hi]) => lo + (hi - lo) * random();
    const condition = { model: place.model, mark: pick(o.marks), hand: pick(o.hands), across: between(place.across), gap: between(place.gaps) }, hz = pick(o.rates);
    const world = cases.world([subjects[condition.hand]], condition, undefined), built = await buildBout(world.recipe, { hz });
    const reader = cases.read(built, condition), motion = motionOf(built);
    built.duel.play(world.tape);
    while (!reader.ended && !(motion.phase === 'swing' && motion.features.length)) { built.world.step(); reader.afterStep(); }
    if (reader.ended) { built.dispose(); return null; }
    return { built, condition, hz, motion, saved: built.duel.save(), features: motion.features.slice() };
  };
  const pool = [];
  const fill = async (k) => { for (;;) { const s = await start(); if (s) { pool[k]?.built.dispose(); pool[k] = s; return; } } };
  for (let k = 0; k < o.pool; k++) await fill(k);
  let ep = null;
  const reset = async () => {
    const k = Math.floor(random() * pool.length);
    if (random() * o.refresh < 1) await fill(k);
    const s = pool[k];
    s.built.duel.load(s.saved);
    ep = { ...s, reader: cases.read(s.built, s.condition), decisions: 0, nearest: Infinity, body: s.built.duel.duelists.left.body };
    return s.features.slice();
  };
  const step = (action) => {
    if (!Array.isArray(action) || action.length !== PUNCH_ACTIONS || !action.every(Number.isFinite)) throw new Error('invalid punch action');
    const { built, reader, motion } = ep, steer = action.map(Math.tanh);
    motion.steer.length = 0; motion.steer.push(...steer);
    ep.decisions++;
    const decided = motion.decided;
    do {
      built.world.step(); reader.afterStep();
      const f = ep.body.view.fists[ep.condition.hand].position, t = motion.target;
      ep.nearest = Math.min(ep.nearest, Math.sqrt((f.x - t[0]) ** 2 + (f.y - t[1]) ** 2 + (f.z - t[2]) ** 2));
    } while (!reader.ended && motion.phase === 'swing' && motion.decided === decided);
    let reward = -o.effort * steer.reduce((sum, a) => sum + a * a, 0) / steer.length;
    const observation = motion.features.slice();
    if (!reader.ended && motion.phase === 'swing') return { observation, reward, terminated: false, truncated: false, info: {} };
    const reading = reader.reading(), hit = reading.hit;
    const meets = !!hit && hit.fast && hit.heavy && hit.square && hit.soon && hit.lined && hit.extended && hit.upright;
    const score = scoreOf(meets ? { ...reading, outcome: 'landed' } : reading, ep.condition.hand);
    reward += score - (hit ? 0 : o.near * Math.min(ep.nearest, 0.5));
    const info = { landed: meets ? 1 : 0, score, speed: hit?.speed ?? null, kg: hit?.kg ?? null, gap: ep.condition.gap, hz: ep.hz, decisions: ep.decisions, nearest: ep.nearest };
    return { observation, reward, terminated: true, truncated: false, info };
  };
  return { reset, step, observationSize: PUNCH_FEATURES, actionSize: PUNCH_ACTIONS, dispose: () => { for (const s of pool) s.built.dispose(); }, inside: () => ep };
}
