import test from 'node:test';
import assert from 'node:assert/strict';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { modelSpec } from '../src/core/models.ts';
import { coreStand, saveStand, loadStand } from './harness/core-stand.mjs';
import { createBody, SERVO_SECONDS } from '../src/core/body.ts';
import { pointOfToRef } from '../src/core/control/support.ts';
import { createPolicyBody } from '../src/core/mind/direct.ts';
import { createSenses } from '../src/core/mind/senses.ts';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { drawBody } from '../src/render/body-shapes.ts';

test('both live fists preserve momentum, frames and collider identities and expose their actual surface', async () => {
  const s=await coreStand(modelSpec('workshop-fighter'),{gravity:false,ground:false});
  try {
    const parts=['left','right'].map(side=>s.built.segments.get(`hand.${side}`));
    const before=parts.map(part=>({mass:structuredClone(part.body.massProperties),position:part.node.position.asArray(),
      rotation:part.node.rotationQuaternion.asArray(),collider:part.body.rigid.collider(0).handle}));
    for(const part of parts)part.body.applyImpulse(new Vector3(.03,0,0),part.node.position);
    const velocities=parts.map(part=>part.body.linearVelocityToRef(new Vector3()).asArray());
    s.built.handPoses.request([{hand:'left',pose:'fist'},{hand:'right',pose:'fist'}]);
    let witnessed=false;
    const hook=s.world.beforeStep(()=>{
      witnessed=true;
      parts.forEach((part,i)=>{
        assert.equal(part.handPose.applied,'fist');assert.equal(part.body.rigid.collider(0).handle,before[i].collider);
        assert.deepEqual(part.node.position.asArray(),before[i].position);
        assert.deepEqual(part.node.rotationQuaternion.asArray(),before[i].rotation);
        assert.deepEqual(structuredClone(part.body.massProperties),before[i].mass);
        assert.deepEqual(part.body.linearVelocityToRef(new Vector3()).asArray(),velocities[i]);
        const surface=pointOfToRef(part,part.spec.points.strike.value,new Vector3());
        assert.ok(part.body.gapTo(surface.asArray())<1e-6);
        const openTip=pointOfToRef(part,part.spec.distal.value,new Vector3());
        assert.ok(part.body.gapTo(openTip.asArray())>.02,'open fingertips must no longer strike ahead of the fist');
      });
    });
    s.step();hook.dispose();assert.ok(witnessed);
    s.built.handPoses.request([{hand:'left',pose:'open'},{hand:'right',pose:'grip'}]);s.step();
    assert.equal(parts[0].handPose.applied,'open');assert.equal(parts[1].handPose.applied,'grip');
  } finally{s.dispose();}
});

test('an obstructed opening waits without creating a collision, then applies when the obstruction clears',async()=>{
  const spec=modelSpec('workshop-fighter'),hand=spec.segments.find(p=>p.name==='hand.right');
  const s=await coreStand({...spec,segments:[hand],joints:[]},{gravity:false,ground:false});
  try{
    const part=s.built.segments.get(hand.name);
    s.built.handPoses.request([{hand:'right',pose:'fist'}]);s.step();
    const tip=pointOfToRef(part,hand.distal.value,new Vector3());
    const block=s.world.physics.addFixedBox(tip.asArray(),[.01,.01,.01]);
    s.built.handPoses.request([{hand:'right',pose:'open'}]);s.step(3);
    assert.deepEqual(part.handPose,{applied:'fist',requested:'open'});
    assert.equal(s.world.physics.contactsOf(part.body).filter(c=>c.impulse>0).length,0);
    block.dispose();s.step();assert.equal(part.handPose.applied,'open');
  }finally{s.dispose();}
});

test('pose changes and pending requests fork into a fresh world with identical continuation',async()=>{
  const make=async()=>{const s=await coreStand(modelSpec('workshop-fighter'),{gravity:false,ground:false});
    return {...s,body:createBody(s.built,s.world,{servoSeconds:SERVO_SECONDS})};};
  const a=await make(),b=await make();
  try{
    a.body.drive(()=>({posture:{},pushes:[],stance:null,handPoses:{left:'fist',right:'grip'}}));
    a.step(3);const saved=saveStand(a.world,{body:a.body.state});loadStand(b.world,{body:b.body.state},saved);
    assert.deepEqual(b.built.handPoses.state,a.built.handPoses.state);
    for(const s of [a,b]){s.body.drive(null);s.built.handPoses.request([{hand:'left',pose:'open'}]);s.step(8);}
    assert.deepEqual(saveStand(a.world,{body:a.body.state}).state,saveStand(b.world,{body:b.body.state}).state);
    for(let step=0;step<32;step++){
      a.step();b.step();assert.deepEqual(a.body.observe(),b.body.observe());
      for(const name of ['hand.left','hand.right']) {
        const x=a.built.segments.get(name),y=b.built.segments.get(name);
        const point=pointOfToRef(x,x.spec.distal.value,new Vector3()).asArray();
        assert.equal(x.body.gapTo(point),y.body.gapTo(point));
      }
    }
  }finally{a.body.dispose();b.body.dispose();a.dispose();b.dispose();}
});

test('a detached policy can command hand poses without an equipment port and sees the applied result',async()=>{
  const s=await coreStand(modelSpec('workshop-fighter'),{gravity:false,ground:false});let body;
  try{
    let observed;
    body=createPolicyBody(s.built,s.world,model=>{
      assert.equal(model.handPoses.length,2);
      return {name:'pose-policy',state:{},step(observation){observed=observation;
        return {kind:'body',actuators:{kind:'velocity',activation:model.channels.map(()=>0),velocity:model.channels.map(()=>0)},
          grips:[],handPoses:[{hand:'left',pose:'fist'}]};}};
    });
    s.step(3);assert.equal(observed.handPoses.left.applied,'fist');assert.ok(Object.isFrozen(observed.handPoses));
    assert.throws(()=>s.built.handPoses.request([{hand:'left',pose:'open'},{hand:'left',pose:'fist'}]));
    assert.throws(()=>s.built.handPoses.request([{hand:'left',pose:'unknown'}]));
  }finally{body?.dispose();s.dispose();}
});

test('delayed senses carry the applied hand envelope at the observation time',async()=>{
  const s=await coreStand(modelSpec('workshop-fighter'),{gravity:false,ground:false});const hub=createSenses(s.world,2);
  try{
    hub.add({id:'fighter',side:'a',built:s.built,out:()=>false});
    const sense=hub.add({id:'observer',side:'b',built:s.built,out:()=>false});
    s.built.handPoses.request([{hand:'left',pose:'fist'}]);s.step(2);
    assert.equal(sense().others[0].segments.get('hand.left').handPose,'open');
    s.step(2);assert.equal(sense().others[0].segments.get('hand.left').handPose,'fist');
  }finally{hub.dispose();s.dispose();}
});

test('attached grips retain closure and an opening waits for a release',async()=>{
  const spec=modelSpec('workshop-fighter'),hand=spec.segments.find(p=>p.name==='hand.right');
  const s=await coreStand({...spec,segments:[hand],joints:[]},{gravity:false,ground:false});
  try{
    const part=s.built.segments.get(hand.name);
    const node=part.node.clone('item-node',null);node.position.x+=1;
    const item=s.world.physics.addBody(node,[],{mass:1,centre:[0,0,0],moments:[1,1,1],orientation:Quaternion.Identity()});
    const grip=s.world.physics.addGrip(part.body,item,{anchorParent:[0,0,0],anchorChild:[0,0,0],frameParent:Quaternion.Identity(),frameChild:Quaternion.Identity()});
    grip.attach();s.step();
    assert.deepEqual(part.handPose,{applied:'open',requested:'open'},'capture alone does not replace a controller\'s hand envelope');
    s.built.handPoses.request([{hand:'right',pose:'grip'}]);s.step();
    assert.deepEqual(part.handPose,{applied:'grip',requested:'grip'});
    s.built.handPoses.request([{hand:'right',pose:'open'}]);s.step(2);
    assert.equal(grip.attached,true);assert.equal(part.handPose.applied,'grip');
    grip.release();s.step();assert.equal(part.handPose.applied,'open');
  }finally{s.dispose();}
});

test('a loaded fingertip contact delays closing even when the closed envelope would clear',async()=>{
  const spec=modelSpec('workshop-fighter'),hand=spec.segments.find(p=>p.name==='hand.right');
  const s=await coreStand({...spec,segments:[hand],joints:[]},{gravity:false,ground:false});
  try{
    const part=s.built.segments.get(hand.name),tip=pointOfToRef(part,hand.distal.value,new Vector3());
    s.world.physics.addFixedBox(tip.asArray(),[.01,.01,.01]);s.step();
    assert.ok(s.world.physics.contactsOf(part.body).some(c=>c.impulse>0));
    s.built.handPoses.request([{hand:'right',pose:'fist'}]);
    const hook=s.world.beforeStep(()=>assert.equal(part.handPose.applied,'open','loaded contact must not disappear through a pose change'));
    s.step();hook.dispose();
  }finally{s.dispose();}
});

test('diagnostic rendering follows applied poses while retaining mesh identities and a bounded scene',async()=>{
 const s=await coreStand(modelSpec('workshop-fighter'),{gravity:false,ground:false});
 const view=drawBody(s.built,s.scene,new Color3(.5,.5,.5)),meshes=view.meshes.filter(m=>m.name.includes('hand.'));
 const extent=mesh=>{const positions=mesh.getVerticesData('position');const ys=[];for(let i=1;i<positions.length;i+=3)ys.push(positions[i]);return Math.max(...ys)-Math.min(...ys);};
 try{const ids=meshes.map(m=>m.uniqueId),open=meshes.map(extent),count=s.scene.meshes.length;
  for(const pose of ['fist','open','grip','open']){
   s.built.handPoses.request([{hand:'left',pose},{hand:'right',pose}]);s.step();s.scene.onBeforeRenderObservable.notifyObservers(s.scene);
   assert.equal(s.scene.meshes.length,count);assert.deepEqual(meshes.map(m=>m.uniqueId),ids);
   meshes.forEach((mesh,i)=>assert.equal(extent(mesh)<open[i]-.02,pose!=='open'));
  }
 }finally{view.dispose();s.dispose();}
});
