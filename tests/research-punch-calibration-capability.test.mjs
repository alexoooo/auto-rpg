/**
 * **How the Warrior's punch strikes the pad** (`research/punch-calibration.mjs`; Node unpinned core
 * stand, Rapier, 120 Hz, no assist): impacts landed, returns made standing, and the compliant face
 * meeting the real hand.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { punchCalibration } from '../research/punch-calibration.mjs';

test('real Warrior punches land, stand and return on both hands',async()=>{
  for(const hand of ['left','right'])for(const mode of ['hit','miss']) {
    const r=await punchCalibration({hand,mode,seconds:6});
    assert.equal(r.fell,false);assert.equal(r.floorContacts,0);
    assert.equal(r.cycles.failed,0);assert.ok(r.cycles.returned[hand]>=3);
    assert.equal(r.assist.force,0);assert.equal(r.assist.moment,0);
    if(mode==='miss')continue;
    assert.ok(r.impacts.length>=3);assert.ok(r.impacts.filter(e=>e.impulse>.5).length>=2);
    for(const e of r.impacts){assert.equal(e.eligible,true);assert.ok(e.last10cmSpeed>2);}
  }
});

test('compliant faces resist the real hand, conserve applied contact impulse and avoid a rigid impact spike', async()=>{
  for(const hand of ['left','right']) {
    const r=await punchCalibration({hand,seconds:4,armExtension:1,contactSpeed:5,pad:{face:'compliant'}});
    assert.equal(r.fell,false);assert.equal(r.floorContacts,0);assert.equal(r.cycles.failed,0);
    assert.ok(r.cycles.returned[hand]>=1);assert.ok(r.impacts.length>=2);
    assert.ok(r.maximumFaceCompression>.01&&r.maximumFaceCompression<.07);
    for(const sample of r.samples) {
      const force=sample.materialContacts.reduce((sum,c)=>sum+c.force,0);
      assert.ok(Math.abs(sample.force-force)<.01,`force balance ${sample.force} vs ${force}`);
      assert.equal(sample.narrowImpulse,0);
    }
    for(const e of r.impacts){assert.equal(e.contacts.includes(`hand.${hand}`),true);
      assert.ok(e.peakStepForce>100&&e.peakStepForce<1000);assert.ok(e.impulse>1);}
  }
});
