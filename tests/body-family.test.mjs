import test from 'node:test';
import assert from 'node:assert/strict';
import { randomGolemSetup, golemSetupRefusal, golemEffectorPlan, golemChainOptions, golemLocomotionOptions, golemTorsoOptions, golemHeadOptions } from '../src/golem/build.ts';
import { BODY_FAMILIES, BODY_MODULE_FAMILY, FAMILY_LABEL, FAMILY_POLICY, bodyFamily, moduleFamily } from '../src/golem/family.ts';
import { FAMILY_SETUP } from '../src/golem/family-setup.ts';
import { EFFECTOR_CHAINS, GOLEM_MODULES } from '../src/golem/registry.ts';
import { MATCHUP_PARAM, golemMatchup, matchupFromQuery, matchupQuery } from '../src/bout.ts';
import { POLICIES } from '../src/mind.ts';
import { assessPolicy } from '../src/policy-applicability.ts';
import { mulberry32 } from '../src/rng.ts';

test('complete families accept legacy builds and refuse every mixed body slot at construction', () => {
  for (const family of BODY_FAMILIES) {
    const setup = FAMILY_SETUP[family]();
    assert.equal(golemSetupRefusal(setup), null);
    const legacy=structuredClone(setup); delete legacy.family;
    assert.equal(bodyFamily(legacy), setup.family); assert.equal(golemSetupRefusal(legacy),null);
    for (const otherFamily of BODY_FAMILIES) {
      if (otherFamily === family) continue;
      const other = FAMILY_SETUP[otherFamily]();
      for(const slot of ['locomotion','torso','head','primary','secondary']) {
        const mixed={...setup,[slot]:other[slot]};
        assert.match(golemSetupRefusal(mixed),/body family/, `${family} with a ${otherFamily} ${slot}`);
        assert.throws(()=>golemEffectorPlan(mixed),/body family/);
      }
    }
  }
});

test('randomization and all body shelves stay inside the selected family',()=>{
  for(const family of BODY_FAMILIES) {
    const rng=mulberry32(412);
    for(let i=0;i<100;i++) {
      const setup=randomGolemSetup(rng,family);
      assert.equal(setup.family,family); assert.equal(golemSetupRefusal(setup),null);
    }
    for(const shelf of [golemChainOptions,golemLocomotionOptions,golemTorsoOptions,golemHeadOptions]) {
      const options=shelf(family); assert.ok(options.length, `${family} has an empty ${shelf.name}`);
      assert.ok(options.every(o=>moduleFamily(o.id)===family));
    }
  }
  assert.equal(moduleFamily('effector.anatomical.blade'),'human');
  assert.equal(moduleFamily('effector.wrist.blade'),'golem');
});

// The test's own expectation, not `moduleFamily(chain)`: the effector lookup *is* the chain lookup,
// so comparing the two could never fail.
const EXPECTED_CHAIN_FAMILY = { none: 'golem', pitch: 'golem', reach: 'golem', wrist: 'golem', anatomical: 'human' };

test('every_registered_module_has_exactly_one_family', () => {
  for (const chain of Object.keys(EFFECTOR_CHAINS)) {
    assert.ok(Object.hasOwn(EXPECTED_CHAIN_FAMILY, chain), `chain ${chain} has no row in this test's table`);
  }
  for (const option of GOLEM_MODULES) {
    const family = moduleFamily(option.id);
    assert.ok(BODY_FAMILIES.includes(family), `${option.id} is in "${family}"`);
    if (option.mode === 'effector') {
      const chain = option.id.split('.')[1];
      assert.equal(family, EXPECTED_CHAIN_FAMILY[chain], `${option.id}`);
    }
  }
});

test('the_family_table_names_nothing_the_registry_does_not_offer', () => {
  const registered = new Set(GOLEM_MODULES.map((option) => option.id));
  for (const id of Object.keys(BODY_MODULE_FAMILY)) {
    assert.ok(registered.has(id), `the family table names "${id}", which is not registered`);
  }
  // And the other direction: every registered body module has a row of its own, rather than
  // reaching a family through the chain fallback.
  for (const option of GOLEM_MODULES) {
    if (option.mode === 'effector') continue;
    assert.ok(Object.hasOwn(BODY_MODULE_FAMILY, option.id), `${option.id} has no row in BODY_MODULE_FAMILY`);
  }
});

test('an_unknown_id_throws_rather_than_joining_a_family', () => {
  assert.throws(() => moduleFamily('torso.bone'), /no body family/);
  assert.throws(() => moduleFamily('constructor'), /no body family/);
  assert.throws(() => moduleFamily('effector.constructor.blade'), /no body family/);
  assert.throws(() => moduleFamily('effector.bone.blade'), /no body family/);
});

test('the_codec_reads_every_family_and_refuses_others', () => {
  for (const family of BODY_FAMILIES) {
    const query = matchupQuery(golemMatchup(FAMILY_SETUP[family]()));
    const decoded = matchupFromQuery(query);
    assert.ok(decoded, `a ${family} matchup did not survive its own codec`);
    assert.equal(decoded.left.golem.family, family);
    assert.equal(decoded.right.golem.family, family);

    // The real encoding, edited: one side's family made a word that is not a family.
    const raw = JSON.parse(new URLSearchParams(query).get(MATCHUP_PARAM));
    assert.equal(raw.left.golem.family, family, 'the encoding does not carry the family where this test edits it');
    raw.left.golem.family = 'not-a-family';
    const edited = new URLSearchParams(); edited.set(MATCHUP_PARAM, JSON.stringify(raw));
    assert.equal(matchupFromQuery(`?${edited.toString()}`), null);
  }
});

test('the_refusal_names_every_family_by_its_label', () => {
  const human = FAMILY_SETUP.human();
  const mixed = { ...human, torso: FAMILY_SETUP.golem().torso };
  const refusal = golemSetupRefusal(mixed);
  assert.ok(refusal.endsWith('Choose Human warrior or Stone golem to select a complete body.'), refusal);
});

// The button's policy has to be one the setup screen will let fight on the button's body: an
// incompatible policy stays visible and blocks Fight (`withUnit` in `src/bout.ts`), so a family
// whose button picked one would be a button that cannot start a bout.
test('every_family_has_a_label_a_policy_and_a_setup', () => {
  for (const family of BODY_FAMILIES) {
    assert.equal(typeof FAMILY_LABEL[family], 'string');
    assert.ok(FAMILY_LABEL[family].length > 0, `${family} has no label`);
    const policy = POLICIES.find((candidate) => candidate.name === FAMILY_POLICY[family]);
    assert.ok(policy, `${family}'s policy "${FAMILY_POLICY[family]}" is not a policy`);
    const setup = FAMILY_SETUP[family]();
    assert.equal(golemSetupRefusal(setup), null);
    assert.equal(bodyFamily(setup), family);
    const assessment = assessPolicy(policy, true, setup);
    assert.equal(assessment.status, 'applicable', `${family}'s own button: ${assessment.reason}`);
  }
});
