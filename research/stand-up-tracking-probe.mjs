import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';
import { acceptanceEnvironment, frozenRevision } from '../.tools/stand-up-frozen/research/stand-up-acceptance.mjs';
import { unassistedAudit } from '../.tools/stand-up-frozen/research/stand-up-unassisted.mjs';
import { contactModel } from './stand-up-contact-model.mjs';
import { detachedDynamics } from './stand-up-detached-dynamics.mjs';
import { trackingPolicy } from './stand-up-tracking-policy.mjs';
import { coupledDynamics } from '../src/core/build/coupled-dynamics.ts';

const {values:v}=parseArgs({options:Object.fromEntries(['reference','out','steps'].map(k=>[k,{type:'string'}]))});
assert.ok(v.reference&&v.out);
const reference=JSON.parse(gunzipSync(readFileSync(v.reference)));
const manifest=JSON.parse(readFileSync(new URL('../.tools/stand-up-frozen/research/stand-up-acceptance/cases.json',import.meta.url)));
const magnitude=a=>Math.sqrt(a.reduce((s,v)=>s+v*v,0));
const results=[];
for(const prefix of [null,480,840]) {
  const c=manifest.cases[0],e=await acceptanceEnvironment(c.configuration),model=contactModel(e);
  const detached=detachedDynamics(model),dynamics=coupledDynamics(detached.built,model.gravity);
  const policy=trackingPolicy({model,parameters:{holdAngles:true}}),rows=[];
  const audit=unassistedAudit(e.stand.built,()=>e.stand.world.steps);
  try {
    if(prefix!==null) {
      const bytes=readFileSync(new URL('../.tools/stand-up-frozen/research/stand-up-acceptance/'+c.file,import.meta.url));
      assert.equal(createHash('sha256').update(bytes).digest('hex'),c.sha256);e.restore(gunzipSync(bytes));
      for(let i=0;i<prefix;i++)e.step(reference.frames[i]);
    }else for(let i=0;i<5;i++)e.step({kind:'host'});
    for(let step=0;step<Number(v.steps??60);step++) {
      const before=e.observe(),action=policy(before);detached.read(before);dynamics.update();
      const requested=action.activation.map((a,i)=>a*detached.muscles.strength(i,action.velocity[i]==='-inf'?-1:1)*(action.velocity[i]==='-inf'?-1:1));
      const loads=policy.state.tracking.contact.forces.map(f=>({body:detached.built.segments.get(f.frame.slice('segment:'.length)).body,
        point:f.point,force:f.force,moment:[0,0,0]}));
      const predicted=dynamics.solve(requested,loads);
      const accelerations=before.segments.map(s=>dynamics.pointAcceleration(detached.built.segments.get(s.name).body,s.centre,predicted));
      const next=e.step(action),after=next.observation;
      const joints=before.joints.map((j,i)=>({name:j.name,asked:requested[i],delivered:after.joints[i].effort,
        miss:after.joints[i].effort-requested[i],angle:j.angle,speed:j.speed,min:model.channels[i].min,max:model.channels[i].max}));
      const segments=before.segments.map((s,i)=>{
        const a=after.segments.find(x=>x.name===s.name),measured={linear:a.velocity.map((v,k)=>(v-s.velocity[k])*120),angular:a.spin.map((v,k)=>(v-s.spin[k])*120)};
        const prediction=accelerations[i];return {name:s.name,prediction,measured,
          linearError:magnitude(measured.linear.map((v,k)=>v-prediction.linear[k])),angularError:magnitude(measured.angular.map((v,k)=>v-prediction.angular[k]))};
      });
      rows.push({step,elapsed:next.result.elapsed,height:after.height,rootUp:next.rootUp,tracking:policy.state.tracking,
        joints,segments,contacts:after.contacts.filter(c=>c.impulse>0)});
    }
    assert.equal(audit.events.length,0);results.push({prefix,identity:e.identity,events:audit.events,rows});
  }finally{audit.dispose();e.dispose();}
}
mkdirSync(dirname(v.out),{recursive:true});writeFileSync(v.out,JSON.stringify({revision:frozenRevision(),results},null,2)+'\n');
for(const r of results)console.log(JSON.stringify({prefix:r.prefix,first:r.rows[0].segments.find(s=>s.name==='lowerTrunk'),
  worstTorque:r.rows.flatMap(r=>r.joints).sort((a,b)=>Math.abs(b.miss)-Math.abs(a.miss)).slice(0,3),last:r.rows.at(-1).rootUp}));
