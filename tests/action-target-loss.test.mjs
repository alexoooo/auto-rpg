/** Actual path execution preserves body identity across sensing loss on either side of commit. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { coreStand } from './harness/core-stand.mjs';
import { humanSpec } from '../src/core/human/spec.ts';
import { buildBody } from '../src/core/build/build-body.ts';
import { createBody } from '../src/core/body.ts';
import { createSenses } from '../src/core/mind/senses.ts';
import { actionAim } from '../src/core/mind/action-aim.ts';
import { guardPosture, guardSkill } from '../src/core/skills/guard.ts';
import { locomotion } from '../src/core/skills/locomotion.ts';
import { skillSet } from '../src/core/skills/arbiter.ts';
import { pathExecutor } from '../src/core/skills/combat.ts';
import { placedReach } from '../src/core/skills/strike.ts';
import { dummySpec } from '../src/lab/targets.ts';

async function fixture() {
  const spec = humanSpec('workshop-fighter'), stand = await coreStand(spec, { posture: guardPosture(spec) });
  const hub = createSenses(stand.world), senses = hub.add({ id: 'own', side: 'a', built: stand.built, out: () => false });
  const body = createBody(stand.built, stand.world, { servoSeconds: .1, feedback: true, senses });
  const at = [body.view.head.x, body.view.head.y, body.view.head.z + placedReach(spec, 'right', 0)];
  const targets = ['target', 'decoy'].map((id, i) => {
    const built = buildBody(dummySpec(spec), stand.world, { position: [at[0] + i, at[1], at[2]] });
    for (const part of built.segments.values()) part.body.setFixed(true);
    hub.add({ id, side: 'b', built, out: () => false }); return built;
  });
  const aim = actionAim(spec, { kind: 'centre', lead: 0 });
  const executor = pathExecutor(body, [{ name: 'jab', family: 'straight' }], { resolve: (view, target, _action, effector) => aim(view, target, effector, [])?.at ?? null });
  const skills = skillSet(body, {}, { legs: locomotion(body.envelope), guard: guardSkill(spec),
    executors: [{ name: 'path', executor }], actions: [{ name: 'jab', executor: 'path', effectors: ['hand.right'] }] });
  const target = { kind: 'body', body: 'target', region: { kind: 'segment', segment: 'head' } };
  const request = { id: skills.instance(), action: 'jab', effector: 'hand.right', target };
  const intent = { face: 0, move: null, guard: { left: null, right: null }, actions: [] };
  let admitted = false;
  body.drive((view, dt) => {
    if (!admitted && skills.readiness(view, 'jab', 'hand.right', target, { heading: 0, placed: true, support: null, walk: null, lower: .03 }).kind === 'ready') {
      intent.actions = [request]; admitted = true;
    }
    return skills.command(view, intent, dt);
  }, skills.release);
  return { ...stand, body, skills, executor, hub, request,
    dispose() { body.dispose(); hub.dispose(); targets.forEach(target => target.dispose()); stand.dispose(); } };
}

for (const phase of ['prepare', 'commit']) test(`losing a sensed body during ${phase} preserves its exact identity with another foe present`, async () => {
  const f = await fixture();
  try {
    for (let step = 0; step < 900 && f.skills.report.actions[0]?.phase !== phase; step++) f.step();
    assert.equal(f.skills.report.actions[0]?.phase, phase, JSON.stringify(f.skills.report.ledger));
    const point = [...f.executor.state.lives.right.target];
    f.hub.remove('target'); f.step();
    assert.deepEqual(f.body.view.senses.others.map(other => other.id), ['decoy']);
    if (phase === 'commit') {
      assert.equal(f.skills.report.actions[0]?.phase, 'commit');
      assert.deepEqual(f.executor.state.lives.right.target, point);
    }
    for (let step = 0; step < 600 && !f.skills.report.ledger.length; step++) f.step();
    assert.equal(f.skills.report.ledger.length, 1);
    const ended = f.skills.report.ledger[0];
    assert.deepEqual(ended.target, f.request.target);
    assert.equal(ended.id, f.request.id);
    assert.equal(ended.committed, phase === 'commit');
    assert.equal(ended.ending.kind, phase === 'commit' ? 'completed' : 'lost', JSON.stringify(ended));
    assert.deepEqual(f.skills.report.actions, []);
    assert.equal(f.skills.report.holders['effector:hand.right'], 'default');
  } finally { f.dispose(); }
});
