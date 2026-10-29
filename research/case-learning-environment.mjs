/**
 * **A learning environment over an evaluation's cases**: any learnable part (`Learner`,
 * `src/core/mind/learner.ts`) of a subject's mind, played in its evaluation's worlds, the trainer
 * deciding its outputs. An environment file names:
 *
 * - `evaluation`; `subject`, a mind's config with the part in learning mode (a bare mind's
 *   `network: null`, a straight punch's `steered: true`), or `subjects`, each a `value` (a subject
 *   as the evaluation takes one) for the conditions whose fields equal its `where`'s; `part`, the
 *   path of the learnable part in each (`mind.executors.0`; none for the config itself), which must
 *   name an object; `character`.
 * - `layout`, a file of the part's input and output names (`{ inputs, outputs }`), which the
 *   learner's own must match in number (its outputs where it holds any before the trainer writes
 *   them).
 * - `places`, each a protocol of the evaluation and either `draw`, a condition drawn field by field
 *   in its order (a list: one picked; `{ "between": [lo, hi] }`: drawn evenly; else the value), or
 *   `where`, one of the protocol's conditions whose fields equal its, picked; `rates`, the control
 *   rates a trial is built at, one picked (a kind that takes a rate: a bout); `split`, `train` or
 *   `held-out`, keeping only the conditions of that half by their digest (`heldOut`).
 * - `reward`: `effort`, less the outputs' mean square a decision; each of the evaluation's
 *   `percepts` by its weight, summed over the decision's seconds; at the end, each of its `terms`
 *   or its reading's numbers (true 1, false 0) by its weight in `end`; `down`, where given, once a
 *   fall, which ends the episode.
 *
 * The learner is found in the world's hosted minds (`WorldKind.hosted`) of the subject's kind (its
 * own, or its `mind`'s: a drill's subject that names its action beside its mind), one in all. An
 * episode starts at its first decision while it runs (`running`, `decisions`) and plays one
 * decision a step: the trainer's outputs (through tanh) written, the world stepped until
 * the learner decides again; it ends with its case's reader, with the learner no longer running
 * (a punch's drive), with a fall where `down` weighs one, or is cut at the protocol's longest.
 *
 * Where the world kind can save (`WorldKind.save`) and `pool` is given, it keeps `pool` starts,
 * each a trial at a fresh draw played to its first decision and saved. An episode loads one of
 * them, a fresh reader beside it, and owes the pool one fresh start every `refresh` episodes: the
 * server plays it between its steps (`idle`), `slice` world steps at a time, so that a start's
 * walk in never holds up the trainer's lockstep, and it takes the place of a start no episode is
 * playing. Without a pool, each episode is a trial begun afresh.
 *
 * Draws on `seed`: the episodes' picks of a start on one, the fresh starts' conditions on
 * another, so that when the idle time plays them moves neither.
 *
 * Harness: Node, the case's world on its protocol's engine (`engine` where the protocol names
 * none, else `DEFAULT_ENGINE`).
 */
import { readFileSync } from 'node:fs';
import '../tests/harness/preload-data.mjs';
import { DEFAULT_ENGINE } from '../src/core/engine/engines.ts';
import { EVALUATIONS } from '../src/evaluation/evaluations.ts';
import { WORLD_BUILDERS } from '../src/evaluation/worlds.ts';

/** Whether `condition` is held out of training: half of the conditions, by a digest of its fields in sorted order (FNV-1a). */
export function heldOut(condition) {
  let h = 2166136261;
  for (const c of keyOf(condition)) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return (h & 1) === 1;
}

/** `value` as JSON with each object's keys sorted. */
const keyOf = (value) => JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]])) : v);

/** A generator of uniform draws in [0, 1) on `seed`. */
export const generator = (seed) => { let word = (seed * 2654435761) >>> 0; return () => ((word = (Math.imul(word, 1664525) + 1013904223) >>> 0) / 4294967296); };

/** A condition drawn by `draw`'s fields in order on `next`: a list picks one, `{ between }` draws evenly, anything else is the value. */
export function drawCondition(draw, next) {
  const condition = {};
  for (const [field, spec] of Object.entries(draw)) {
    condition[field] = Array.isArray(spec) ? spec[Math.floor(next() * spec.length)]
      : spec && typeof spec === 'object' && Array.isArray(spec.between) ? spec.between[0] + (spec.between[1] - spec.between[0]) * next() : spec;
  }
  return condition;
}

/** Whether `condition`'s fields equal `where`'s. */
const matches = (condition, where = {}) => Object.entries(where).every(([key, value]) => JSON.stringify(condition[key]) === JSON.stringify(value));

/** The subject's config for `condition`: the file's one, or the first of its `subjects` whose `where` it matches. */
export function subjectFor(o, condition) {
  if (o.subject) return o.subject;
  const found = (o.subjects ?? []).find((one) => matches(condition, one.where));
  if (!found) throw new Error(`no subject of the environment plays ${JSON.stringify(condition)}`);
  return found.value;
}

/** The value at `path` (dotted) in `config`. */
const at = (config, path) => path ? path.split('.').reduce((value, key) => value?.[key], config) : config;

/** Every learner in `value`'s plain data (objects and arrays alone), held as `learner`. */
function learnersIn(value, found = [], seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return found;
  const proto = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && proto !== Object.prototype && proto !== null) return found;
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    if (key === 'learner' && child && Array.isArray(child.inputs) && Array.isArray(child.outputs) && typeof child.decisions === 'number') found.push(child);
    else learnersIn(child, found, seen);
  }
  return found;
}

/**
 * The one learner of `built`'s hosted minds of `value`'s kind (its own, or its `mind`'s), and the
 * body its mind drives; a world kind that lists no minds, or a count other than one, is refused.
 */
export function learnerIn(kind, built, value) {
  if (!kind.hosted) throw new Error('the world lists no minds it hosts');
  const mindKind = value.kind ?? value.mind?.kind, minded = kind.hosted(built).filter((one) => one.kind === mindKind), learners = minded.flatMap((one) => learnersIn(one));
  if (learners.length !== 1) throw new Error(`a case environment drives one learner; the world has ${learners.length} in its ${mindKind} minds`);
  return { learner: learners[0], body: minded[0].body };
}

export async function caseEnvironment(configuration = {}) {
  const o = { character: {}, reward: {}, seed: 1, engine: DEFAULT_ENGINE, slice: 4, refresh: 8, ...configuration };
  const evaluation = EVALUATIONS[o.evaluation];
  if (!evaluation) throw new Error(`no evaluation ${o.evaluation}`);
  const configs = o.subject ? [o.subject] : (o.subjects ?? []).map((one) => one.value);
  if (configs.length === 0) throw new Error('an environment names its subject');
  for (const config of configs) if (!at(config, o.part ?? '') || typeof at(config, o.part ?? '') !== 'object') throw new Error(`the subject's config has no part at ${o.part}`);
  const layout = JSON.parse(readFileSync(o.layout, 'utf8'));
  const places = o.places.map((place) => {
    const cases = evaluation.protocols[place.protocol];
    if (!cases) throw new Error(`no protocol ${place.protocol} of ${o.evaluation}`);
    if (cases.arity !== 1) throw new Error('a case environment seats one subject');
    if (place.draw) return { place, cases };
    const subject = (condition) => ({ id: 'learner', label: 'learner', value: subjectFor(o, condition), character: o.character });
    const conditions = cases.conditions.filter((condition) => matches(condition, place.where) && (cases.faults?.(subjectFor(o, condition), condition, subject(condition)) ?? []).length === 0);
    if (conditions.length === 0) throw new Error(`no condition of ${o.evaluation} ${place.protocol} admits the subject where ${JSON.stringify(place.where)}`);
    return { place, cases, conditions };
  });
  const r = o.reward, end = r.end ?? {}, percepts = Object.entries(r).filter(([name]) => name !== 'effort' && name !== 'end' && name !== 'down');
  for (const [name] of percepts) if (!evaluation.percepts?.[name]) throw new Error(`${o.evaluation} has no percept ${name}`);
  const random = generator(o.seed), drawing = generator(o.seed + 7919);
  const pick = (list) => list[Math.floor(drawing() * list.length)];

  /** A trial at a fresh draw, built and its tape begun, its learner found; null where its condition is in the half `split` leaves out. */
  const begin = async () => {
    const { place, cases, conditions } = pick(places), hz = o.rates ? pick(o.rates) : undefined;
    const condition = place.draw ? drawCondition(place.draw, drawing) : pick(conditions);
    if (o.split && heldOut(condition) !== (o.split === 'held-out')) return null;
    const value = subjectFor(o, condition), world = cases.world([value], condition, cases.engine ?? o.engine, [o.character]);
    const kind = WORLD_BUILDERS[world.kind], built = await kind.build(world, hz === undefined ? {} : { hz });
    try {
      if (hz !== undefined && built.world.hz !== hz) throw new Error(`a ${world.kind} world is not built at a rate`);
      const { learner, body } = learnerIn(kind, built, value), reader = cases.read(built, condition);
      kind.start?.(built, world);
      return { built, kind, cases, condition, hz, reader, learner, body };
    } catch (error) { built.dispose(); throw error; }
  };
  /** Whether `p`'s learner has made its first decision and still runs. */
  const started = (p) => p.learner.running && p.learner.decisions > 0;
  /** The protocol's longest, s. */
  const longest = (p) => o.seconds ?? p.cases.seconds;
  /** `p` played on by up to `steps` world steps: `more`, its first decision reached (`started`), or its trial `ended` before it. */
  const advance = (p, steps) => {
    for (let k = 0; k < steps && !p.reader.ended && !started(p) && p.kind.clock(p.built) < longest(p); k++) { p.built.world.step(); p.reader.afterStep(); }
    return started(p) ? 'started' : p.reader.ended || p.kind.clock(p.built) >= longest(p) ? 'ended' : 'more';
  };
  /** A start: `p` at its first decision, and its save where it is pooled. */
  const startOf = (p) => ({ ...p, saved: pooled ? p.kind.save(p.built) : null, inputs: p.learner.inputs.slice() });
  /** A start at a fresh draw: begun and played to its first decision, drawn again where it is left out or ends first. */
  const fresh = async () => {
    for (;;) {
      const p = await begin();
      if (!p) continue;
      if (advance(p, Infinity) === 'started') return startOf(p);
      p.built.dispose();
    }
  };

  const pooled = o.pool !== undefined;
  const pool = [];
  if (pooled) {
    if (o.pool < 2) throw new Error('a learning environment pools at least two starts, so that one can be replaced while another plays');
    while (pool.length < o.pool) {
      const s = await fresh();
      if (!s.kind.save || !s.kind.load) { s.built.dispose(); throw new Error('a pooled environment\'s world kind saves and loads'); }
      pool.push(s);
    }
  }
  const first = pooled ? pool[0] : await fresh();
  if (first.learner.inputs.length !== layout.inputs.length || ![0, layout.outputs.length].includes(first.learner.outputs.length))
    throw new Error(`the learner reads ${first.learner.inputs.length} inputs for ${first.learner.outputs.length} outputs; its layout ${o.layout} names ${layout.inputs.length} for ${layout.outputs.length}`);
  const observationSize = layout.inputs.length, actionSize = layout.outputs.length;

  let ep = null, owed = 0, pending = null, unplayed = pooled ? null : first;
  /**
   * One slice of the idle time's work: while the pool is owed a fresh start, a trial begun or played
   * on `slice` steps, and once at its first decision, put in the place of a start no episode plays;
   * whether there is more to do.
   */
  const idle = async () => {
    if (!pooled) return false;
    if (!pending) {
      if (owed < 1) return false;
      pending = await begin();
      return true;
    }
    const reached = advance(pending, o.slice);
    if (reached === 'more') return true;
    if (reached === 'started') {
      let k = Math.floor(drawing() * pool.length);
      if (pool[k] === ep?.start) k = (k + 1) % pool.length;
      pool[k].built.dispose(); pool[k] = startOf(pending); owed -= 1;
    } else pending.built.dispose();
    pending = null;
    return owed >= 1;
  };
  const reset = async () => {
    let s;
    if (pooled) {
      s = pool[Math.floor(random() * pool.length)];
      owed += 1 / o.refresh;
      s.kind.load(s.built, s.saved);
      s = { ...s, reader: s.cases.read(s.built, s.condition) };
    } else {
      if (ep && ep.start !== unplayed) ep.built.dispose();
      s = unplayed ?? await fresh();
      unplayed = null;
    }
    ep = { ...s, start: pooled ? pool.find((one) => one.built === s.built) : s, decisions: 0 };
    return s.inputs.slice();
  };
  const step = (action) => {
    if (!Array.isArray(action) || action.length !== actionSize || !action.every(Number.isFinite)) throw new Error('invalid learner action');
    const { built, kind, reader, learner } = ep, outputs = action.map(Math.tanh);
    learner.outputs.length = 0; learner.outputs.push(...outputs);
    ep.decisions++;
    const decided = learner.decisions, dt = 1 / built.world.hz, sensed = percepts.map(() => 0);
    let ended = null;
    do {
      built.world.step(); reader.afterStep();
      for (let k = 0; k < percepts.length; k++) sensed[k] += evaluation.percepts[percepts[k][0]](built, ep.condition) * dt;
      ended = reader.ended ? 'read' : !learner.running ? 'done' : r.down !== undefined && ep.body.down ? 'down' : kind.clock(built) >= longest(ep) ? 'cut' : null;
    } while (ended === null && learner.decisions === decided);
    let reward = -(r.effort ?? 0) * outputs.reduce((sum, a) => sum + a * a, 0) / outputs.length;
    for (let k = 0; k < percepts.length; k++) reward += percepts[k][1] * sensed[k];
    const observation = learner.inputs.slice();
    if (ended === null) return { observation, reward, terminated: false, truncated: false, info: {} };
    const info = { decisions: ep.decisions, seconds: kind.clock(built), down: ended === 'down' ? 1 : 0, ...(ep.hz === undefined ? {} : { hz: ep.hz }) };
    if (ended === 'down') reward += r.down;
    if (ended === 'read' || ended === 'done') {
      const reading = reader.reading();
      let sum = 0;
      for (const [name, weight] of Object.entries(end)) {
        const term = evaluation.terms?.[name], value = term ? term(reading, ep.condition) : reading[name], number = typeof value === 'boolean' ? (value ? 1 : 0) : value;
        if (typeof number !== 'number' || !Number.isFinite(number)) continue;
        sum += weight * number; info[name] = number;
      }
      reward += sum;
    }
    return { observation, reward, terminated: ended !== 'cut', truncated: ended === 'cut', info };
  };
  const dispose = () => { for (const s of pool) s.built.dispose(); pending?.built.dispose(); if (!pooled) { ep?.built.dispose(); if (unplayed && unplayed !== ep?.start) unplayed.built.dispose(); } };
  return { reset, step, idle, observationSize, actionSize, dispose, inside: () => ep };
}
