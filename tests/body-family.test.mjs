import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultGolemSetup, randomGolemSetup, golemSetupRefusal, golemEffectorPlan, golemChainOptions, golemLocomotionOptions, golemTorsoOptions, golemHeadOptions } from '../src/golem/build.ts';
import { bodyFamily, moduleFamily } from '../src/golem/family.ts';
import { humanSetup } from '../src/golem/humanoid/presets.ts';
import { mulberry32 } from '../src/rng.ts';

test('complete families accept legacy builds and refuse every mixed body slot at construction', () => {
  for (const setup of [humanSetup(), defaultGolemSetup()]) {
    assert.equal(golemSetupRefusal(setup), null);
    const legacy=structuredClone(setup); delete legacy.family;
    assert.equal(bodyFamily(legacy), setup.family); assert.equal(golemSetupRefusal(legacy),null);
    const other=setup.family==='human'?defaultGolemSetup():humanSetup();
    for(const slot of ['locomotion','torso','head','primary','secondary']) {
      const mixed={...setup,[slot]:other[slot]};
      assert.match(golemSetupRefusal(mixed),/body family/);
      assert.throws(()=>golemEffectorPlan(mixed),/body family/);
    }
  }
});

test('randomization and all body shelves stay inside the selected family',()=>{
  for(const family of ['human','golem']) {
    const rng=mulberry32(412);
    for(let i=0;i<100;i++) {
      const setup=randomGolemSetup(rng,family);
      assert.equal(setup.family,family); assert.equal(golemSetupRefusal(setup),null);
    }
    for(const shelf of [golemChainOptions,golemLocomotionOptions,golemTorsoOptions,golemHeadOptions]) {
      const options=shelf(family); assert.ok(options.length);
      assert.ok(options.every(o=>moduleFamily(o.id)===family));
    }
  }
  assert.equal(moduleFamily('effector.anatomical.blade'),'human');
  assert.equal(moduleFamily('effector.wrist.blade'),'golem');
});
