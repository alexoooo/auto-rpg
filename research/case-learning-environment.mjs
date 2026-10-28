/**
 * A learning environment over an evaluation's cases: each episode one of a protocol's conditions
 * (`evaluation`, `protocol`, those whose fields equal `where`'s and that admit the subject), its
 * world built and played as `playCase` plays it, the subject (`subject`, a mind's config, seated
 * as the cases seat a subject, with `character`) a bare mind (`src/core/entrants/bare/`) whose
 * pulls the trainer decides: each decision its inputs (`bareLayout`) out, its pulls (the action,
 * through tanh) in, the world played to its next decision. A bout's opponents are the protocol's
 * own (the baseline's `fight`: its `OPPONENTS`).
 *
 * Its reward, each term weighted by `reward`: at each decision, over the seconds it held,
 * `progress` (its root's speed along its ordered direction, to the order's pace where it names
 * one), `halt` (less its root's speed where it is ordered to stop), `upright` (its root's up) and
 * `effort` (less its pulls' mean square, a decision); at the end, `end`'s each field of the case's
 * reading (true 1, false 0). An episode ends with its case's reader, or where `down` weighs a fall,
 * the moment its body is down (that weight once, and no reading), or is cut at the protocol's
 * longest (`seconds`, s, where given in its place).
 *
 * Harness: Node, the case's world on its protocol's engine (`engine` where the protocol names
 * none, else `DEFAULT_ENGINE`); conditions drawn on `seed`.
 */
import { DEFAULT_ENGINE } from '../src/core/engine/engines.ts';
import { SIDES } from '../src/arena/duel.ts';
import { EVALUATIONS } from '../src/evaluation/evaluations.ts';
import { WORLD_BUILDERS } from '../src/evaluation/worlds.ts';
import { bareLayout } from '../src/core/entrants/bare/mind.ts';

/** The bodies a built case plays, each its built body and its mind, of any world kind that has them. */
const combatantsOf = (built) => built.duel ? SIDES.map((side) => built.duel.duelists[side]) : built.body?.minded ? [built.body] : [];

/** Each input's index in the bare layout, by name. */
const indexOf = (names) => Object.fromEntries(names.map((name, i) => [name, i]));

export async function caseEnvironment(configuration = {}) {
  const o = { where: {}, character: {}, reward: {}, seed: 1, engine: DEFAULT_ENGINE, ...configuration };
  const evaluation = EVALUATIONS[o.evaluation], cases = evaluation?.protocols[o.protocol];
  if (!cases) throw new Error(`no protocol ${o.protocol} of an evaluation ${o.evaluation}`);
  if (cases.arity !== 1) throw new Error('a case environment seats one subject');
  if (o.subject?.kind !== 'bare') throw new Error('a case environment drives a bare mind');
  const subject = { id: 'learner', label: 'learner', value: o.subject, character: o.character };
  const matches = (condition) => Object.entries(o.where).every(([key, value]) => JSON.stringify(condition[key]) === JSON.stringify(value));
  const conditions = cases.conditions.filter((condition) => matches(condition) && (cases.faults?.(o.subject, condition, subject) ?? []).length === 0);
  if (conditions.length === 0) throw new Error(`no condition of ${o.evaluation} ${o.protocol} admits the subject where ${JSON.stringify(o.where)}`);
  const engine = cases.engine ?? o.engine, seconds = o.seconds ?? cases.seconds;
  let word = (o.seed * 2654435761) >>> 0;
  const random = () => (word = (Math.imul(word, 1664525) + 1013904223) >>> 0) / 4294967296;
  const r = o.reward, end = r.end ?? {};

  /** A fresh episode: a condition drawn, its world built and started, played to the bare mind's first decision. */
  const begin = async () => {
    const condition = conditions[Math.floor(random() * conditions.length)], world = cases.world([o.subject], condition, engine, [o.character]);
    const kind = WORLD_BUILDERS[world.kind], built = await kind.build(world);
    const reader = cases.read(built, condition);
    kind.start?.(built, world);
    const bare = combatantsOf(built).filter((one) => one.minded.kind === 'bare');
    if (bare.length !== 1) { built.dispose(); throw new Error(`a case environment drives one bare mind; ${JSON.stringify(condition)} has ${bare.length}`); }
    const e = { built, kind, condition, reader, state: bare[0].minded.state, body: bare[0].minded.body, spec: bare[0].built.spec, decisions: 0 };
    playOn(e);
    return e;
  };
  /** `e` played to its next decision, or its end: by its reader (`read`), its fall where a fall ends it (`down`), or the cap (`cut`). */
  const playOn = (e) => {
    const from = e.state.steps;
    for (;;) {
      if (e.reader.ended) return 'read';
      if (r.down !== undefined && e.body.down) return 'down';
      if (e.kind.clock(e.built) >= seconds) return 'cut';
      e.built.world.step(); e.reader.afterStep();
      if (e.state.steps !== from && (e.state.steps - 1) % o.subject.every === 0) return 'decided';
    }
  };

  let ep = await begin();
  const names = indexOf(bareLayout(ep.spec).inputs);
  const observationSize = ep.state.inputs.length, actionSize = ep.state.pulls.length, fresh = { first: true };
  if (observationSize !== Object.keys(names).length) throw new Error('the bare mind read other than its layout');
  const at = (name) => ep.state.inputs[names[name]];

  const reset = async () => {
    if (fresh.first) fresh.first = false;
    else { ep.built.dispose(); ep = await begin(); }
    return ep.state.inputs.slice();
  };
  const step = (action) => {
    if (!Array.isArray(action) || action.length !== actionSize || !action.every(Number.isFinite)) throw new Error('invalid bare action');
    const pulls = action.map(Math.tanh);
    for (let i = 0; i < actionSize; i++) ep.state.pulls[i] = pulls[i];
    const before = ep.kind.clock(ep.built), ended = playOn(ep), held = ep.kind.clock(ep.built) - before;
    ep.decisions++;
    const speed = { along: at('root velocity along'), across: at('root velocity across') };
    const ordered = at('ordered') === 1, pace = at('order pace');
    const toward = ordered ? speed.along * at('order along') + speed.across * at('order across') : 0;
    let reward = -(r.effort ?? 0) * pulls.reduce((sum, a) => sum + a * a, 0) / actionSize
      + held * ((r.progress ?? 0) * (pace > 0 ? Math.min(toward, pace) : toward)
        - (r.halt ?? 0) * (ordered ? 0 : Math.sqrt(speed.along * speed.along + speed.across * speed.across))
        + (r.upright ?? 0) * at('root up up'));
    const observation = ep.state.inputs.slice();
    if (ended === 'decided') return { observation, reward, terminated: false, truncated: false, info: {} };
    const reading = ended === 'read' ? ep.reader.reading() : null, info = { decisions: ep.decisions, seconds: ep.kind.clock(ep.built), down: ended === 'down' ? 1 : 0 };
    if (ended === 'down') reward += r.down;
    if (reading) for (const [field, weight] of Object.entries(end)) {
      const value = reading[field], number = typeof value === 'boolean' ? (value ? 1 : 0) : value;
      if (typeof number === 'number' && Number.isFinite(number)) { reward += weight * number; info[field] = number; }
    }
    return { observation, reward, terminated: ended !== 'cut', truncated: ended === 'cut', info };
  };
  return { reset, step, observationSize, actionSize, conditions: conditions.length, dispose: () => ep.built.dispose(), inside: () => ep };
}
