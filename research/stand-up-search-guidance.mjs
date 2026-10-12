import assert from 'node:assert/strict';

/** Detached guidance proposes muscle actions and posture costs; it does not supply physical states or success. */
export function searchGuidance(reference,identity,segmentNames) {
  assert.deepEqual(reference.identity,identity,'guidance uses the target physical body and muscle channels');
  assert.equal(identity.balance,0);assert.ok(reference.frames.length>0);
  const count=identity.channels.length,vector=(v,n)=>Array.isArray(v)&&v.length===n&&v.every(Number.isFinite);
  const features=[],actions=[];
  for(const f of reference.frames) {
    assert.ok(vector(f.angles,count)&&vector(f.speeds,count)&&vector(f.rootMotion,6));
    assert.ok(vector(f.gravity,3)&&vector(f.up,3)&&Number.isFinite(f.height)&&f.height>0);
    const loads=segmentNames.map(name=>f.loads[name]??0),total=loads.reduce((s,v)=>s+v,0);
    assert.ok(loads.every(v=>Number.isFinite(v)&&v>=0));
    features.push({angles:[...f.angles],speeds:[...f.speeds],height:f.height,up:[...f.up],gravity:[...f.gravity],
      loads:loads.map(v=>total?v/total:0),spin:f.rootMotion.slice(0,3),velocity:f.rootMotion.slice(3),soleUp:null});
    assert.ok(!f.assist,'guidance contains no assist request');
    if(f.kind==='host')actions.push({kind:'host'});
    else {
      assert.equal(f.kind,'muscles');assert.ok(vector(f.activation,count)&&f.activation.every(v=>v>=0&&v<=1));
      assert.ok(Array.isArray(f.velocity)&&f.velocity.length===count&&f.velocity.every(v=>Number.isFinite(v)||v==='+inf'||v==='-inf'));
      actions.push({kind:'muscles',velocity:[...f.velocity],activation:[...f.activation],handPoses:{...f.handPoses}});
    }
  }
  return {features,actions};
}
