import {test} from 'node:test';
import assert from 'node:assert/strict';
import {modelSpec} from '../src/core/models.ts';
import {withSoles} from '../src/core/human/sole.ts';
import {frameOf} from '../src/core/spec/body.ts';
import {recoveryFeet} from '../research/stand-up-foot-design.mjs';
import {specProvenanceFaults} from './fixtures/spec.mjs';

test('foot experiments preserve muscles and mass while deforming the whole foot consistently',()=>{
  const original=withSoles(modelSpec('workshop-fighter')),before=JSON.stringify(original);
  assert.equal(recoveryFeet(original),original);
  for(const proportions of [{width:.75},{length:1.25},{height:.5},{width:1.25,length:.75,height:.5}]) {
    const changed=recoveryFeet(original,proportions),scales=[proportions.width??1,proportions.length??1,proportions.height??1];
    assert.equal(changed.mass,original.mass);assert.equal(changed.joints,original.joints);
    assert.deepEqual(specProvenanceFaults(changed),[]);
    for(let i=0;i<original.segments.length;i++) {
      const a=original.segments[i],b=changed.segments[i];
      if(!a.name.startsWith('foot.')) {assert.equal(a,b);continue;}
      assert.equal(a.mass,b.mass);assert.equal(a.surface,b.surface);
      assert.deepEqual(b.shape.size.value,a.shape.size.value.map((v,i)=>v*scales[i]));
      const second=m=>m.map((v,i)=>(m[(i+1)%3]+m[(i+2)%3]-v)/2);
      const expected=second(a.inertia.value).map((v,i)=>v*scales[i]*scales[i]);
      second(b.inertia.value).forEach((v,i)=>assert.ok(Math.abs(v-expected[i])<1e-14));
      const frame=frameOf(b),c=b.shape.centre.value,size=b.shape.size.value;
      const plantar=c.map((v,i)=>v+frame.z[i]*size[2]/2);
      plantar.forEach((v,i)=>assert.ok(Math.abs(v-b.points.sole.value[i])<1e-14));
      assert.ok(Math.abs(plantar[1])<1e-14,'the changed foot still rests on the same ground plane');
    }
  }
  assert.equal(JSON.stringify(original),before);
  assert.throws(()=>recoveryFeet(original,{width:0}),/declared exploratory bounds/);
});
