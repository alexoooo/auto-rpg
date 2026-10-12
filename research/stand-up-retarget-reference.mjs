import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {gunzipSync,gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {ratesToRef,turningToRef} from '../src/core/build/joint-state.ts';

/** Anatomical guidance for a different body is unmeasured until its muscle actions run in that body. */
export function retargetReference(reference,source,target) {
  assert.deepEqual(reference.identity,source.identity,'source geometry matches the recorded body');
  assert.deepEqual(source.identity.channels.map(c=>c.name),target.identity.channels.map(c=>c.name));
  assert.deepEqual(source.joints.map(j=>j.dofs.length),target.joints.map(j=>j.dofs.length));
  assert.ok(source.standingHeight>0&&target.standingHeight>0);
  const scale=target.standingHeight/source.standingHeight;
  const sameFrame=['rootAcross','rootUp','rootFront'].every(k=>JSON.stringify(source[k])===JSON.stringify(target[k]));
  const basis=body=>['rootAcross','rootUp','rootFront'].map(k=>{
    const length=Math.sqrt(body[k].reduce((s,v)=>s+v*v,0));
    assert.ok(Math.abs(length-1)<1e-6);return body[k].map(v=>v/length);
  });
  const from=basis(source),to=basis(target);
  const rotate=v=>sameFrame?[...v]:[0,1,2].map(k=>from.reduce((sum,axis,i)=>sum+axis.reduce((s,x,j)=>s+x*v[j],0)*to[i][k],0));
  const clipped=[],preservedTorqueJoints=[];
  const frames=reference.frames.map((f,frame)=>{
    const angles=f.angles.map((a,i)=>{
      const s=source.identity.channels[i],t=target.identity.channels[i];
      const asked=s.bind===t.bind?a:a+s.bind-t.bind;
      const given=Math.max(t.min,Math.min(t.max,asked));
      if(given!==asked)clipped.push({frame,channel:t.name,asked,given});return given;
    });
    const speeds=[],velocity=[];let start=0;
    source.joints.forEach((joint,index)=>{
      const n=joint.dofs.length,a=f.angles.slice(start,start+n),b=angles.slice(start,start+n),other=target.joints[index];
      const unchanged=JSON.stringify(a)===JSON.stringify(b)&&JSON.stringify(joint)===JSON.stringify(other);
      const transform=values=>{
        if(unchanged)return [...values];
        const rates=ratesToRef(joint,a,values,[]),turning=turningToRef(other,b,[]);
        return turning.map(row=>row.reduce((sum,v,i)=>sum+v*rates[i],0));
      };
      speeds.push(...transform(f.speeds.slice(start,start+n)));
      if(f.kind==='muscles') {
        const commands=f.velocity.slice(start,start+n);
        if(commands.every(Number.isFinite))velocity.push(...transform(commands));
        else {
          assert.deepEqual(joint.dofs.map(d=>d.sign),other.dofs.map(d=>d.sign),'torque-direction transfer requires matching anatomical signs');
          assert.ok(commands.every(v=>Number.isFinite(v)||v==='+inf'||v==='-inf'));
          // Infinite speed requests encode saturated torque; finite-speed coordinate algebra does not apply.
          velocity.push(...commands);preservedTorqueJoints.push({frame,joint:index});
        }
      }
      start+=n;
    });
    assert.equal(start,angles.length);
    return {...f,angles,speeds,gravity:rotate(f.gravity),height:f.height*scale,
      ...(f.rootMotion?{rootMotion:[...rotate(f.rootMotion.slice(0,3)),...rotate(f.rootMotion.slice(3)).map(v=>v*scale)]}:{}),
      ...(f.kind==='muscles'?{velocity,activation:[...f.activation],handPoses:{...f.handPoses}}:{})};
  });
  const {responses,responseMeasurement,sourcePhysicalTraceSha256,sourceSha256,transformation,...rest}=reference;
  return {...rest,identity:structuredClone(target.identity),standingHeight:target.standingHeight,
    rootUp:[...target.rootUp],rootAcross:[...target.rootAcross],rootFront:[...target.rootFront],joints:structuredClone(target.joints),frames,
    transformation:{kind:'anatomical-body-guidance',measuredTrajectory:false,bodyChanged:false,
      parentPhysicalTraceSha256:sourcePhysicalTraceSha256??null,parentSourceSha256:sourceSha256??null,
      parentTransformation:transformation??null,source:structuredClone(source),target:structuredClone(target),heightScale:scale,
      clipped,preservedTorqueJoints,torqueTransfer:'Preserve whole joint commands and activations when any component requests saturated torque.'}};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const [file,caseIndex,out]=process.argv.slice(2);assert.ok(file&&caseIndex&&out);
  const frozen=new URL('../.tools/stand-up-frozen/',import.meta.url);
  const {acceptanceEnvironment,frozenRevision}=await import(new URL('research/stand-up-acceptance.mjs',frozen));
  const {uprightness}=await import(new URL('src/core/control/ground.ts',frozen));
  const {Vector3,Quaternion}=await import('@babylonjs/core/Maths/math.vector.js');
  const revision=frozenRevision(),manifest=JSON.parse(readFileSync(new URL('research/stand-up-acceptance/cases.json',frozen)));
  const bytes=readFileSync(file),reference=JSON.parse(gunzipSync(bytes));
  const original=manifest.cases.find(c=>c.identity.specSha===reference.identity.specSha&&
    c.configuration.model===reference.identity.model&&c.configuration.held===reference.identity.held);
  assert.ok(original,'source is a frozen body configuration');
  const targetCase=manifest.cases[Number(caseIndex)];assert.ok(targetCase);
  const metadata=async c=>{
    const e=await acceptanceEnvironment(c.configuration);
    try {
      const inverse=Quaternion.Inverse(e.stand.built.segments.get('lowerTrunk').rest);
      const axis=v=>new Vector3(...v).applyRotationQuaternionToRef(inverse,new Vector3()).asArray();
      return {identity:e.identity,standingHeight:uprightness(e.stand.built).standing,
        rootAcross:axis([1,0,0]),rootUp:axis([0,1,0]),rootFront:axis([0,0,1]),
        joints:[...e.stand.built.joints.values()].map(j=>({dofs:j.dofs.map(d=>({sign:d.sign}))}))};
    } finally {e.dispose();}
  };
  const source=await metadata(original),target=await metadata(targetCase),adapted=retargetReference(reference,source,target);
  adapted.transformation.revision=revision;
  adapted.transformation.sourceReferenceSha256=createHash('sha256').update(bytes).digest('hex');
  writeFileSync(out,gzipSync(JSON.stringify(adapted)));
  console.log(JSON.stringify({output:out,frames:adapted.frames.length,heightScale:adapted.transformation.heightScale,
    clipped:adapted.transformation.clipped.length,preservedTorqueJoints:adapted.transformation.preservedTorqueJoints.length}));
}
