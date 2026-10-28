/**
 * The steered punch's training environment: a trial of the Strike drill's still rung
 * (`STRIKE_CASES.still`: its world and its reader), or of its walk rung where a place names its
 * `starts` (`STRIKE_CASES.walk`: walked in and settled, or struck the first step ready), a episode, the Puncher's straight punch on a
 * found schedule (its body's of `schedules`, else `schedule`: a `research/punch-drill.mjs` result,
 * mirrored for the left hand) with
 * `steered` on, its steer set from here at each of its decisions (`PUNCH_DECIDE`) through the drive,
 * its features read as the punch reads them (`punchFeatures`).
 *
 * It keeps `pool` starts, each a bout at a place drawn on `seed` (one of `places`: a body, its
 * gaps and its offsets across, m, each drawn evenly between its two ends, and the walk rung's
 * `starts` it draws from where it names them; or a body, its `foes`
 * and its `moments`, a fight's moment of the drill's `fight` rung, one of the half of them
 * `heldOut` leaves to training; a hand of `hands`, a mark of `marks`, a rate of `rates`), played
 * to its drive's first step and saved (`Duel.save`).
 * An episode loads one of them, a fresh reader beside it, and owes the pool one fresh start every
 * `refresh` episodes: the server plays it between its steps (`idle`), `slice` world steps at a
 * time, so that a start's walk in never holds up the trainer's lockstep, and it takes the place of
 * a start no episode is playing. It ends with the drive, scored by the bar on what the reader read
 * (`scoreOf`, `punch-drill.mjs`; a hit that passes every test counts as landed, the striker's
 * standing left to the drill): that score is the episode's one reward, less `effort` times the
 * steer's mean square at each decision, and, where the fist met nothing on the mark, less `near`
 * for each metre the fist came no nearer the target than over the drive (to 0.5 m).
 *
 * Its steer has `punchActions` outputs, as the punch's `steered` (of `punch`) lays them out.
 *
 * Each body's punch is admitted where `windows` says (`[reach, band, aside, above]`, by model), else
 * anywhere past `AROUND`'s reach.
 *
 * Harness: Node, the bout world (`buildBout`) on Rapier (`DEFAULT_ENGINE`), the drill's layout.
 */
import { readFileSync } from 'node:fs';
import { punchActions, PUNCH_FEATURES } from '../src/core/skills/learned-punch.ts';
import { buildBout } from '../src/evaluation/bout.ts';
import { STRIKE_CASES } from '../src/evaluation/strike/cases.ts';
import { CHEST, decode, mirrored, scoreOf, timedPuncher } from './punch-drill.mjs';

/** Whether a fight's moment is held out of training: half of them, by a digest of its condition (FNV-1a). */
export function heldOut({ model, foe, mark, hand, moment }) {
  let h = 2166136261;
  for (const c of `${model} ${foe} ${mark} ${hand} ${moment}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return (h & 1) === 1;
}

/**
 * The steered Puncher for a body and a hand: its body's schedule of `schedules` (by model), else
 * `schedule`, mirrored for the other hand, its punch `steered`, admitted where its body's of
 * `windows` says, its strike aimed by `aim` where given (else its schedule's), its punch's settings
 * overridden by `punch`.
 */
export function steeredSubjects({ schedule, schedules = {}, windows = {}, aim = null, punch: settings = {} }) {
  const made = new Map();
  return (model, hand) => {
    const key = `${model} ${hand}`;
    if (made.has(key)) return made.get(key);
    const found = JSON.parse(readFileSync(schedules[model] ?? schedule, 'utf8')), cell = found.cell, flags = { driven: !!cell.driven, fire: !!cell.fire, brake: !!cell.brake, ease: !!cell.ease };
    const x = [...found.best.x];
    if (hand !== cell.hand) mirrored(x, cell.hand, hand);
    const decoded = decode(x, hand, cell.gap ?? undefined, new Set((cell.without ?? []).map((c) => hand === cell.hand ? c : c.replace(`.${cell.hand} `, `.${hand} `))), flags);
    const subject = timedPuncher(decoded, hand, aim ?? (cell.chest ? CHEST : null));
    subject.mind.executors[0].steered = true;
    const punch = subject.mind.executors[0];
    if (windows[model]) [punch.reach, punch.band, punch.aside, punch.above] = windows[model];
    Object.assign(punch, settings);
    made.set(key, subject);
    return subject;
  };
}

/** A trial's condition at `place`: a still target's gap, offset and start drawn, or a fight's foe and moment picked. */
export function drawn(place, pick, between, o) {
  const common = { model: place.model, mark: pick(o.marks), hand: pick(o.hands) };
  return place.foes ? { ...common, foe: pick(place.foes), moment: pick(place.moments) }
    : { ...common, across: between(place.across), gap: between(place.gaps), ...(place.starts ? { start: pick(place.starts) } : {}) };
}

/** The Strike drill's rung a place's trials are: a fight's, the walk's where it names its starts, else the still one's. */
const rungOf = (place) => STRIKE_CASES[place.foes ? 'fight' : place.starts ? 'walk' : 'still'];

export async function punchEnvironment(configuration = {}) {
  const o = { schedule: 'docs/reference/punch-body.json', places: [{ model: 'workshop-fighter', gaps: [0.9, 1], across: [0, 0.1] }], hands: ['right'], marks: ['middle'],
    rates: [120], seed: 1, effort: 0.02, near: 4, pool: 12, refresh: 8, slice: 4, ...configuration };
  if (o.pool < 2) throw new Error('a punch environment pools at least two starts, so that one can be replaced while another plays');
  /** A generator on `seed`: the episodes' draws on one, the fresh starts' places on another, so that when the idle time plays them moves neither. */
  const generator = (seed) => { let word = (seed * 2654435761) >>> 0; return () => ((word = (Math.imul(word, 1664525) + 1013904223) >>> 0) / 4294967296); };
  const random = generator(o.seed), drawing = generator(o.seed + 7919);
  const pick = (list) => list[Math.floor(drawing() * list.length)];
  const subjects = steeredSubjects(o), actions = punchActions(o.punch?.steered ?? true);
  const motionOf = (built) => built.duel.duelists.left.minded.skills.state.actions.executors[0].motion;
  /** Whether the drill's own punch drives: the drill has the body (a fight's punches before its moment are the fight's) and the drive has read its first features. */
  const drilled = (built, motion) => built.duel.duelists.left.minded.skills.report.engagement?.phase !== 'fighting' && motion.phase === 'swing' && motion.features.length > 0;
  /** A bout at a fresh place, built and its tape begun; null where the place is a fight's moment held out. */
  const begin = async () => {
    const place = pick(o.places), between = ([lo, hi]) => lo + (hi - lo) * drawing(), hz = pick(o.rates);
    const condition = drawn(place, pick, between, o), cases = rungOf(place);
    if (place.foes && heldOut(condition)) return null;
    const world = cases.world([subjects(condition.model, condition.hand)], condition, undefined, [{}]), built = await buildBout(world.recipe, { hz });
    const reader = cases.read(built, condition), motion = motionOf(built);
    built.duel.play(world.tape);
    return { built, cases, condition, hz, reader, motion };
  };
  /** `p` played on by up to `steps` world steps: `more`, its drive's first step reached (`drilled`), or its trial `ended` before it. */
  const advance = (p, steps) => {
    for (let k = 0; k < steps && !p.reader.ended && !drilled(p.built, p.motion); k++) { p.built.world.step(); p.reader.afterStep(); }
    return p.reader.ended ? 'ended' : drilled(p.built, p.motion) ? 'drilled' : 'more';
  };
  /** A start: `p` at its drive's first step, and its save. */
  const startOf = (p) => ({ built: p.built, cases: p.cases, condition: p.condition, hz: p.hz, motion: p.motion, saved: p.built.duel.save(), features: p.motion.features.slice() });
  const pool = [];
  while (pool.length < o.pool) {
    const p = await begin();
    if (!p) continue;
    if (advance(p, Infinity) === 'drilled') pool.push(startOf(p)); else p.built.dispose();
  }
  let ep = null, owed = 0, pending = null;
  /**
   * One slice of the idle time's work: while the pool is owed a fresh start, a bout begun or played
   * on `slice` steps, and once at its drive, put in the place of a start no episode plays; whether
   * there is more to do.
   */
  const idle = async () => {
    if (!pending) {
      if (owed < 1) return false;
      pending = await begin();
      return true;
    }
    const reached = advance(pending, o.slice);
    if (reached === 'more') return true;
    if (reached === 'drilled') {
      let k = Math.floor(drawing() * pool.length);
      if (pool[k] === ep?.start) k = (k + 1) % pool.length;
      pool[k].built.dispose(); pool[k] = startOf(pending); owed -= 1;
    } else pending.built.dispose();
    pending = null;
    return owed >= 1;
  };
  const reset = async () => {
    const s = pool[Math.floor(random() * pool.length)];
    owed += 1 / o.refresh;
    s.built.duel.load(s.saved);
    ep = { ...s, start: s, reader: s.cases.read(s.built, s.condition), decisions: 0, nearest: Infinity, body: s.built.duel.duelists.left.body };
    return s.features.slice();
  };
  const step = (action) => {
    if (!Array.isArray(action) || action.length !== actions || !action.every(Number.isFinite)) throw new Error('invalid punch action');
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
    const walking = ep.condition.start === 'walking';
    const info = { landed: meets ? 1 : 0, walked: walking ? (meets ? 1 : 0) : null, settled: walking ? null : meets ? 1 : 0, score, speed: hit?.speed ?? null, kg: hit?.kg ?? null, gap: ep.condition.gap ?? null, fight: ep.condition.foe ? 1 : 0, hz: ep.hz, decisions: ep.decisions, nearest: ep.nearest };
    return { observation, reward, terminated: true, truncated: false, info };
  };
  return { reset, step, idle, observationSize: PUNCH_FEATURES, actionSize: actions, dispose: () => { for (const s of pool) s.built.dispose(); pending?.built.dispose(); }, inside: () => ep };
}
