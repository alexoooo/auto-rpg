import { readMinds } from '../src/arena/matchup.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { combatContact, combatPairs, combatPressure, combatRating, combatTrial } from '../research/arena-combat.mjs';

const blow = { normal: [0, 0, 1], closing: 3, energy: 4, sides: [
  { fighter: 'left', segment: 'hand.right', wound: { taken: [{ hp: .1 }, { hp: .2 }] } },
  { fighter: 'right', segment: 'head', wound: { taken: [{ hp: .7 }] } },
] };
const witness = { phase: 'swing', hand: 'right', down: false, foeLow: true,
  relativeVelocity: { left: [0, 0, 0], right: [0, 0, 2] } };

test('driven scoring requires the active hand to close under its own motion and uses actual wounds', () => {
  const got = combatContact(blow, 'left', witness);
  assert.equal(got.driven, true); assert.equal(got.kind, 'target'); assert.equal(got.grounded, true);
  assert.ok(Math.abs(got.incoming - .3) < 1e-12); assert.equal(got.outgoing, .7);
  for (const changed of [{ phase: 'return' }, { hand: 'left' }, { down: true },
    { relativeVelocity: { ...witness.relativeVelocity, right: [0, 0, -.5] } },
    { relativeVelocity: { ...witness.relativeVelocity, right: [4, 0, 0] } }])
    assert.equal(combatContact(blow, 'left', { ...witness, ...changed }).driven, false);
  assert.equal(combatContact({ ...blow, closing: .1 }, 'left', witness).driven, false);
  assert.equal(combatContact(blow, 'right', witness).driven, false, 'the recipient gains no outgoing strike credit');
  const guard = { ...blow, sides: [blow.sides[0], { ...blow.sides[1], segment: 'forearm.left' }] };
  assert.equal(combatContact(guard, 'left', witness).kind, 'block');
  const reversed = { ...blow, normal: [0, 0, -1], sides: [...blow.sides].reverse() };
  assert.deepEqual(combatContact(reversed, 'left', witness), got);
});

test('pressure-only episodes end on a driven contact or a contact gap', () => {
  const state = { run: 0, longest: 0, episodes: 0 };
  for (let i = 0; i < 240; i++) combatPressure(state, true, false, 1 / 120);
  combatPressure(state, true, true, 1 / 120);
  assert.equal(state.episodes, 1); assert.equal(state.run, 0);
  for (let i = 0; i < 60; i++) combatPressure(state, true, false, 1 / 120);
  combatPressure(state, false, false, 1 / 120);
  assert.equal(state.episodes, 1); assert.ok(Math.abs(state.longest - 2) < 1e-12);
  assert.throws(() => combatPressure(state, true, false, 0));
});

test('ratings group complete mirrors and preserve draws, decisive wins and time wins', () => {
  const jobs = combatPairs({ candidate: 'point', opponent: 'classic', count: 100 });
  assert.equal(new Set(jobs.map(j => JSON.stringify(j.config))).size, 200);
  assert.deepEqual(jobs, combatPairs({ candidate: 'point', opponent: 'classic', count: 100 }));
  const develop = combatPairs({ candidate: 'point', opponent: 'classic', count: 100, split: 'development' });
  assert.ok(!develop.some(j => jobs.some(h => JSON.stringify(h.config) === JSON.stringify(j.config))));
  const rows = jobs.map(j => ({ ...j, result: { verdict: { winner: j.pair < 70 ? j.candidateSide : j.candidateSide === 'left' ? 'right' : 'left', ending: j.pair < 35 ? 'fatal' : 'time' } } }));
  const rating = combatRating(rows);
  assert.deepEqual([rating.pairs, rating.bouts, rating.score, rating.endings], [100, 200, .7,
    { wins: 140, losses: 60, draws: 0, decisiveWins: 70, timeWins: 70 }]);
  assert.ok(rating.score95[0] > .5 && rating.score95[1] < 1);
  assert.ok(Math.abs(rating.relativeElo - 147.19071411783773) < 1e-10);
  assert.throws(() => combatRating(rows.slice(1)), /complete mirrored/);
  assert.throws(() => combatRating([...rows, rows[0]]), /duplicate/);
  const draws = rows.map(r => ({ ...r, result: { verdict: { winner: null, ending: 'time' } } }));
  assert.equal(combatRating(draws).score, .5); assert.equal(combatRating(draws).relativeElo, 0);
  assert.throws(() => combatRating([{ ...rows[0], error: 'physics failed' }]), /failed physical/);
});

test('the complete autonomous bout path exposes pressure and actual damage without contact-only strike credit', async () => {
  // Both sides are ordered to walk into each other, empty-handed, and never to attack. Clubs held
  // upright meet first at the hands that hold them, and slide there, a contact that breaks every
  // half second and never runs to an episode.
  const hug = (side, x) => ({ step: 0, side, orders: { move: { x, z: 0 }, face: null, attack: null } });
  const row = await combatTrial({ left: 'classic', right: 'classic', recipe: { capSeconds: 12 }, tape: [hug('left', 1), hug('right', -1)] });
  assert.equal(row.harness.engine, 'rapier-coordinate');
  assert.equal(row.recipe.recoverySeconds, null);
  assert.ok(row.meanCentreGap > 0 && Number.isFinite(row.minimumCentreGap));
  for (const side of ['left', 'right']) {
    const out = row.sides[side];
    assert.ok(out.pressureSeconds > 2 && out.pressureOnly.episodes > 0, JSON.stringify(out));
    assert.equal(out.driven, 0, 'the hugging fixture is contact without a driven closing blow');
    assert.equal(out.drivenDamage, 0);
    assert.ok(out.incomingDamage > 0 && out.incidentalDamage > 0);
    assert.deepEqual(out.assist, { force: 0, moment: 0 });
  }
});

test('the selectable Brawler pair launches repeated body blows without sustained hugging',async()=>{
 const minds=readMinds('?control=brawler,brawler');
 const row=await combatTrial({left:minds.left,right:minds.right,recipe:{capSeconds:30}});
 for(const side of ['left','right']){
  const out=row.sides[side];
  assert.ok((out.drivenTargets.upperTrunk??0)+(out.drivenTargets.middleTrunk??0)>=8,JSON.stringify(out));
  assert.ok(out.drivenDamage>.2,JSON.stringify(out));assert.equal(out.falls,0);
  assert.ok(out.pressureOnly.longest<1);assert.equal(out.pressureOnly.episodes,0);
  assert.deepEqual(out.assist,{force:0,moment:0});
 }
});

test('the selected Scrapper pair lands body blows without sustained hugging on the real Arena body',async()=>{
 const minds=readMinds('?control=scrapper,scrapper');
 const row=await combatTrial({left:minds.left,right:minds.right,recipe:{capSeconds:30}});
 for(const side of ['left','right']){
  const out=row.sides[side];
  assert.ok((out.drivenTargets.upperTrunk??0)+(out.drivenTargets.middleTrunk??0)>=8,JSON.stringify(out));
  assert.ok(out.drivenDamage>.2,JSON.stringify(out));assert.equal(out.falls,0);
  assert.ok(out.pressureOnly.longest<1);assert.equal(out.pressureOnly.episodes,0);
  assert.deepEqual(out.assist,{force:0,moment:0});
 }
});
