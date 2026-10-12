import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {gunzipSync,gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const other=name=>name.replace(/(^|\.)(left|right)(?= |$)/g,(_,prefix,side)=>prefix+(side==='left'?'right':'left'));

/** Reflected posture guidance is a hypothesis; its motion must be tested in the unchanged physical body. */
export function mirrorReference(reference) {
  const channels=reference.identity.channels,across=reference.rootAcross;
  assert.ok(across?.length===3&&Math.abs(across.reduce((s,v)=>s+v*v,0)-1)<1e-6);
  const normal=across.map(v=>v/Math.sqrt(across.reduce((s,x)=>s+x*x,0)));
  const reflect=v=>{const along=v.reduce((s,x,i)=>s+x*normal[i],0);return v.map((x,i)=>x-2*along*normal[i]);};
  const mapping=channels.map(c=>{
    const source=channels.findIndex(s=>s.name===other(c.name));assert.ok(source>=0,'every anatomical channel has its reflected partner');
    return {source,sign:/ lateral flexion right$| rotation right$/.test(c.name)?-1:1};
  });
  const signed=(v,sign)=>typeof v==='number'?v*sign:sign===1?v:v==='+inf'?'-inf':v==='-inf'?'+inf':assert.fail('unknown muscle speed');
  const clipped=[];
  const frames=reference.frames.map((f,frame)=>{
    const angles=mapping.map(({source,sign},i)=>{
      const asked=sign*(f.angles[source]+channels[source].bind)-channels[i].bind;
      const given=Math.max(channels[i].min,Math.min(channels[i].max,asked));
      if(given!==asked)clipped.push({frame,channel:channels[i].name,asked,given});return given;
    });
    return {...f,angles,speeds:mapping.map(({source,sign})=>f.speeds[source]*sign),
      gravity:reflect(f.gravity),up:[-f.up[0],f.up[1],f.up[2]],
      loads:Object.fromEntries(Object.entries(f.loads).map(([name,value])=>[other(name),value])),
      ...(f.rootMotion?{rootMotion:[...reflect(f.rootMotion.slice(0,3)).map(v=>-v),...reflect(f.rootMotion.slice(3))]}:{}),
      ...(f.kind==='muscles'?{velocity:mapping.map(({source,sign})=>signed(f.velocity[source],sign)),
        activation:mapping.map(({source})=>f.activation[source]),
        handPoses:Object.fromEntries(Object.entries(f.handPoses).map(([name,pose])=>[other(name),pose]))}:{})};
  });
  const {responses,responseMeasurement,sourcePhysicalTraceSha256,sourceSha256,...rest}=reference;
  return {...rest,frames,transformation:{kind:'sagittal-reflection-guidance',parentPhysicalTraceSha256:sourcePhysicalTraceSha256??null,
    parentSourceSha256:sourceSha256??null,mapping,clipped,measuredTrajectory:false}};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const [source,out]=process.argv.slice(2);assert.ok(source&&out);
  const bytes=readFileSync(source),reference=mirrorReference(JSON.parse(gunzipSync(bytes)));
  reference.transformation.sourceReferenceSha256=createHash('sha256').update(bytes).digest('hex');
  writeFileSync(out,gzipSync(JSON.stringify(reference)));
  console.log(JSON.stringify({frames:reference.frames.length,clipped:reference.transformation.clipped.length,measuredTrajectory:false,output:out}));
}
