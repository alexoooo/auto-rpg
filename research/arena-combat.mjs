import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { buildBout } from './bout.mjs';
import { DEFAULT_ENGINE, loadEngine } from '../src/core/engine/engines.ts';
import { FIGHTER, POINT_FIGHTER, ARENA_BRAWLER, ARENA_FIGHTER } from '../src/core/mind/config.ts';
import { motionAtToRef } from '../src/core/control/support.ts';
import { STAND_ORDERS } from '../src/core/mind/orders.ts';

/** Frozen measurement protocol: m/s, s; sustained pressure alone never counts as a driven blow. */
export const COMBAT_PROTOCOL = Object.freeze({ version: 1, drivenClosing: 1, relativeHandSpeed: .5,
  pressureEpisode: 2, lowHeadHeight: .8, startup: 2, capSeconds: 60 });

/** Source identity includes untracked implementation files; results are excluded from the scan. */
export function combatFingerprint() {
  const files = execFileSync('rg', ['--files', 'src', 'research', 'assets', 'vendor', '-g', '*.ts', '-g', '*.mjs', '-g', '*.json', '-g', '*.patch',
    '-g', '!research/runs/**'], { encoding: 'utf8' }).trim().split(/\r?\n/).sort();
  const hash = createHash('sha256');
  for (const file of files) { hash.update(file.replaceAll('\\', '/')); hash.update(readFileSync(file)); }
  return hash.digest('hex');
}

/** The stable comparison policies, with both granted staged recovery in continuing bouts. */
export function combatMind(name) {
  switch (name) {
    case 'classic': return { ...FIGHTER, subs: [{ kind: 'staged-rise' }] };
    case 'brawler': return ARENA_BRAWLER;
    case 'combat': return ARENA_FIGHTER;
    case 'point': return { ...POINT_FIGHTER, hand: 'alternate' };
    default: if (typeof name === 'object' && name !== null) return name;
      throw new Error(`unknown combat policy ${name}`);
  }
}

/** A physical blow classified independently on either side; no striker is added to the rules. */
export function combatContact(blow, side, witness, protocol = COMBAT_PROTOCOL) {
  const mine = blow.sides.find(s => s.fighter === side), other = blow.sides.find(s => s.fighter !== side);
  if (!mine || !other) throw new Error('combat contact needs two different fighters');
  const hand = mine.segment === 'hand.left' ? 'left' : mine.segment === 'hand.right' ? 'right' : null;
  const direction = blow.sides[0] === mine ? 1 : -1, velocity = hand && witness?.relativeVelocity[hand];
  const closing = velocity ? direction * velocity.reduce((sum, v, k) => sum + v * blow.normal[k], 0) : 0;
  const driven = hand !== null && witness?.phase === 'swing' && witness.hand === hand && !witness.down
    && blow.closing >= protocol.drivenClosing && closing >= protocol.relativeHandSpeed;
  const block = hand !== null && /^hand\.|^forearm\./.test(other.segment);
  const taken = s => s.wound?.taken.reduce((sum, w) => sum + w.hp, 0) ?? 0;
  return { driven, kind: driven ? block ? 'block' : 'target' : hand ? 'incidental-hand' : 'incidental-body',
    outgoing: taken(other), incoming: taken(mine), energy: blow.energy, grounded: witness?.foeLow ?? false };
}

/** Consecutive contact without a driven blow; contact gaps and driven blows end the episode. */
export function combatPressure(state, touching, driven, dt, protocol = COMBAT_PROTOCOL) {
  if (!(dt > 0) || !Number.isFinite(dt)) throw new Error('pressure exposure needs a positive finite step');
  if (touching && !driven) {
    state.run += dt; state.longest = Math.max(state.longest, state.run);
  } else {
    if (state.run + dt / 2 >= protocol.pressureEpisode) state.episodes++;
    state.run = 0;
  }
}

/** One autonomous bout on the actual gameplay engine, with optional ordinary orders before release. */
export async function combatTrial(config) {
  const recipe = { left: 'workshop-fighter', right: 'workshop-fighter', gap: 4,
    capSeconds: COMBAT_PROTOCOL.capSeconds, recoverySeconds: null, balance: { left: 0, right: 0 },
    held: { left: 'empty', right: 'empty' }, ...config.recipe,
    minds: { left: combatMind(config.left ?? 'point'), right: combatMind(config.right ?? 'point') } };
  const physicsEngine = await loadEngine(config.engine ?? DEFAULT_ENGINE);
  const stand = await buildBout(recipe, { physicsEngine }), { world, duel } = stand;
  duel.play(config.tape ?? []);
  const vector = new Vector3(), spin = new Vector3();
  const sides = Object.fromEntries(['left', 'right'].map(side => [side, {
    phases: {}, falls: 0, downSeconds: 0, wasDown: false, recoveries: 0,
    pressureSeconds: 0, pressureRun: 0, longestPressure: 0, pressureEpisodes: 0,
    pressureOnly: { run: 0, longest: 0, episodes: 0 }, touching: false, drivenThisStep: false,
    driven: 0, blocks: 0, lowDriven: 0, drivenDamage: 0, selfDamage: 0, incidentalDamage: 0, incomingDamage: 0,
    maximumDrivenSpeed: 0, witness: null, pathLaunches: {}, intendedSurfaces: {}, drivenTargets: {}, lastPhase: null,
  }]));
  const bodies = Object.fromEntries(['left', 'right'].map(side => [side,
    new Set([...duel.duelists[side].built.segments.values()].map(s => s.body))]));
  const before = world.beforeStep(() => {
    for (const side of ['left', 'right']) {
      const d = duel.duelists[side], out = sides[side], other = duel.duelists[side === 'left' ? 'right' : 'left'];
      const report = d.minded.kind === 'direct' ? null : d.minded.skills.report.strike;
      const relativeSpeed = {}, relativeVelocity = {};
      for (const hand of ['left', 'right']) {
        const point = d.body.view?.fists[hand].position;
        if (!point) { relativeSpeed[hand] = 0; relativeVelocity[hand] = [0, 0, 0]; continue; }
        motionAtToRef(d.built.segments.get(`hand.${hand}`), point, vector, spin);
        vector.subtractInPlace(d.body.view.stance.velocity);
        relativeSpeed[hand] = vector.length(); relativeVelocity[hand] = vector.asArray();
      }
      out.witness = { phase: report?.phase, hand: report?.hand, relativeSpeed, relativeVelocity, down: d.body.down,
        foeLow: other.body.down || other.body.physical.head.y < COMBAT_PROTOCOL.lowHeadHeight };
      out.drivenThisStep = false;
    }
  });
  let seen = 0, gapSum = 0, samples = 0, minimumGap = Infinity;
  try {
    while (!duel.verdict) {
      world.step();
      for (const side of ['left', 'right']) {
        const d = duel.duelists[side], out = sides[side], report = d.minded.kind === 'direct' ? null : d.minded.skills.report;
        if (d.body.down && !out.wasDown) out.falls++;
        if (!d.body.down && out.wasDown) out.recoveries++;
        out.wasDown = d.body.down;
        if (d.body.down) out.downSeconds += world.dt;
        const phase = d.body.has === 'command' ? report?.engagement?.phase ?? report?.strike.phase ?? 'guard' : d.body.has;
        const strikePhase = report?.strike.phase;
        if(strikePhase==='swing'&&out.lastPhase!=='swing'&&d.minded.skills.state.action) {
          const family=d.minded.skills.state.action.family,surface=d.minded.skills.state.tactics.surface;
          out.pathLaunches[family]=(out.pathLaunches[family]??0)+1;
          out.intendedSurfaces[surface]=(out.intendedSurfaces[surface]??0)+1;
        }
        out.lastPhase=strikePhase;
        out.phases[phase] = (out.phases[phase] ?? 0) + world.dt;
        const other = bodies[side === 'left' ? 'right' : 'left'];
        const touching = ['left', 'right'].some(hand => world.physics.contactsOf(d.built.segments.get(`hand.${hand}`).body)
          .some(c => other.has(c.other) && c.impulse > 0));
        out.touching = touching;
        if (touching) {
          out.pressureSeconds += world.dt; out.pressureRun += world.dt;
          out.longestPressure = Math.max(out.longestPressure, out.pressureRun);
        } else {
          if (out.pressureRun >= COMBAT_PROTOCOL.pressureEpisode) out.pressureEpisodes++;
          out.pressureRun = 0;
        }
      }
      for (; seen < duel.blows.length; seen++) {
        const blow = duel.blows[seen];
        if (blow.time < COMBAT_PROTOCOL.startup) continue;
        for (const side of ['left', 'right']) {
          const out = sides[side], contact = combatContact(blow, side, out.witness);
          out.incomingDamage += contact.incoming;
          if (contact.driven) {
            out.drivenThisStep = true;
            out.driven++; out.drivenDamage += contact.outgoing; out.selfDamage += contact.incoming;
            const target=blow.sides.find(s=>s.fighter!==side).segment;
            out.drivenTargets[target]=(out.drivenTargets[target]??0)+1;
            if (contact.kind === 'block') out.blocks++;
            if (contact.grounded) out.lowDriven++;
            out.maximumDrivenSpeed = Math.max(out.maximumDrivenSpeed, out.witness.relativeSpeed[out.witness.hand]);
          } else out.incidentalDamage += contact.outgoing;
        }
      }
      for (const out of Object.values(sides)) combatPressure(out.pressureOnly, out.touching, out.drivenThisStep, world.dt);
      if (world.time >= COMBAT_PROTOCOL.startup) {
        const x = duel.duelists.left.body.physical.centre, y = duel.duelists.right.body.physical.centre;
        const gap = Math.hypot(x.x - y.x, x.z - y.z);
        gapSum += gap; samples++; minimumGap = Math.min(minimumGap, gap);
      }
    }
    for (const side of ['left', 'right']) {
      const out = sides[side], d = duel.duelists[side];
      if (out.pressureRun >= COMBAT_PROTOCOL.pressureEpisode) out.pressureEpisodes++;
      combatPressure(out.pressureOnly, false, false, world.dt); delete out.pressureOnly.run;
      delete out.witness; delete out.wasDown; delete out.pressureRun;
      delete out.touching; delete out.drivenThisStep;
      delete out.lastPhase;
      out.bar = d.pool.bar(); out.assist = { force: d.body.assist.meter.force, moment: d.body.assist.meter.moment };
    }
    return { config, recipe, protocol: COMBAT_PROTOCOL, harness: { kind: 'Node Arena Duel', engine: physicsEngine.name,
      revision: physicsEngine.revision, hz: world.hz, actuation: world.actuation }, seconds: duel.clock, verdict: duel.verdict,
      meanCentreGap: samples ? gapSum / samples : null, minimumCentreGap: samples ? minimumGap : null, sides };
  } finally { before.dispose(); stand.dispose(); }
}

/** Distinct mirrored pairs vary geometry, sense delay and actual timed orders, never only a label. */
export function combatPairs({ candidate, opponent, count = 100, split = 'heldout', capSeconds = COMBAT_PROTOCOL.capSeconds }) {
  if (!Number.isSafeInteger(count) || count <= 0) throw new Error('combat pairs need a positive integer count');
  const seed = split === 'development' ? 17 : split === 'heldout' ? 104729 : (() => { throw new Error('unknown combat split'); })();
  let state = seed;
  const random = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; };
  const pairs = [];
  for (let pair = 0; pair < count; pair++) {
    const gap = 1.2 + 4.8 * random(), senseDelay = Math.floor(random() * 13), release = 12 + Math.floor(random() * 109);
    const angle = random() * Math.PI * 2, heading = { x: Math.sin(angle), z: Math.cos(angle) };
    const recipe = { gap, senseDelay, capSeconds };
    for (const mirror of [false, true]) {
      const side = mirror ? 'right' : 'left';
      const tape = [{ step: 0, side, orders: { ...STAND_ORDERS, face: heading } }, { step: release, side, orders: null }];
      pairs.push({ id: `${split}/${pair}/${mirror ? 1 : 0}`, pair, mirror, candidateSide: side,
        config: { left: mirror ? opponent : candidate, right: mirror ? candidate : opponent, recipe, tape } });
    }
  }
  return pairs;
}

/** Paired score and a Wilson interval; each mirrored pair is one uncertainty unit. */
export function combatRating(rows) {
  const pairs = new Map();
  for (const row of rows) {
    if (row.error) throw new Error('a failed physical trial is not a loss or a draw');
    const pair = pairs.get(row.pair) ?? [];
    if (pair.some(r => r.mirror === row.mirror)) throw new Error('duplicate mirror in combat ratings');
    pair.push(row); pairs.set(row.pair, pair);
  }
  const scores = [], endings = { wins: 0, losses: 0, draws: 0, decisiveWins: 0, timeWins: 0 };
  for (const pair of pairs.values()) {
    if (pair.length !== 2) throw new Error('a combat rating needs complete mirrored pairs');
    let score = 0;
    for (const row of pair) {
      const verdict = row.result.verdict;
      const won = verdict.winner === row.candidateSide;
      score += verdict.winner === null ? .5 : won ? 1 : 0;
      if (verdict.winner === null) endings.draws++;
      else if (won) { endings.wins++; if (verdict.ending === 'time') endings.timeWins++; else endings.decisiveWins++; }
      else endings.losses++;
    }
    scores.push(score / 2);
  }
  if (scores.length === 0) throw new Error('no combat pairs measured');
  const n = scores.length, p = scores.reduce((s, v) => s + v, 0) / n, z = 1.959963984540054;
  const denominator = 1 + z * z / n, center = (p + z * z / (2 * n)) / denominator;
  const radius = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denominator;
  const interval = [Math.max(0, center - radius), Math.min(1, center + radius)];
  const elo = score => score <= 0 ? null : score >= 1 ? null : 400 * Math.log10(score / (1 - score));
  return { pairs: n, bouts: 2 * n, score: p, score95: interval, relativeElo: elo(p), elo95: interval.map(elo),
    perfectScore: p === 0 || p === 1, endings };
}
