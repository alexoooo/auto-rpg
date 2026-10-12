import fs from 'node:fs';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {deserialize} from 'node:v8';
import {createHash} from 'node:crypto';
import {contactModel} from './stand-up-contact-model.mjs';
import {contactPolicy} from './stand-up-contact-policy.mjs';
import {forceVelocityFactor} from '../src/core/muscle/force-velocity.ts';
import {acceptanceEnvironment} from '../.tools/stand-up-frozen/research/stand-up-acceptance.mjs';
const [input,output]=process.argv.slice(2),record=deserialize(gunzipSync(fs.readFileSync(input)));
assert.equal(record.configuration.kind,'contact');
assert.equal(record.identity.held,'empty','body momentum diagnosis excludes held external loads');
const manifest=JSON.parse(fs.readFileSync('.tools/stand-up-frozen/research/stand-up-acceptance/cases.json'));
const e=await acceptanceEnvironment(manifest.cases.find(c=>c.id===record.case).configuration);
try {
 const model=contactModel(e);assert.deepEqual(model.identity,record.identity);
 const policy=contactPolicy({model,parameters:record.configuration.parameters});
 const mass=model.segments.reduce((s,p)=>s+p.mass,0),weight=-mass*model.gravity[1],dt=1/120;
 const velocity=o=>model.segments.reduce((s,p)=>s+p.mass*o.segments.find(b=>b.name===p.name).velocity[1]/mass,0);
 const rows=[],channels=model.channels.map(c=>({name:c.name,samples:0,saturated:0,wrongSign:0,absoluteRequested:0,absoluteActual:0,absoluteError:0,maximumRatio:0}));
 for(let i=record.configuration.prefixSteps??0;i<record.rows.length;i++) {
  if(record.rows[i].action.kind==='host')break;
  const row=record.rows[i],before=i?record.rows[i-1].observation:record.initial,action=policy(before);
  assert.deepEqual(action,row.action,'detached diagnosis reproduces every controller action');
  const torque=policy.state.torque,capacities=model.channels.map((c,j)=>{
   const side=torque[j]>=0?c.positive:c.negative;
   return side.peak*forceVelocityFactor((torque[j]>=0?1:-1)*before.joints[j].speed,side.curve);
  });
  const result={seconds:row.result.elapsed,force:policy.state.requestedForce[1],solverMiss:Math.abs(policy.state.miss[1]),
   nonGravityForce:mass*(velocity(row.observation)-velocity(before))/dt+weight,saturated:policy.state.saturated,
   up:row.rootUp,height:row.observation.height,effortPredictionError:policy.state.effortPredictionError};
  rows.push(result);
  if(result.seconds<3||result.seconds>6)continue;
  channels.forEach((c,j)=>{
   const asked=torque[j],actual=row.observation.joints[j].effort;
   c.samples++;c.saturated+=Math.abs(asked)>capacities[j]?1:0;
   c.wrongSign+=asked*actual<0&&Math.abs(actual)>.01?1:0;
   c.absoluteRequested+=Math.abs(asked);c.absoluteActual+=Math.abs(actual);c.absoluteError+=Math.abs(actual-asked);
   c.maximumRatio=Math.max(c.maximumRatio,Math.abs(asked)/Math.max(.000001,capacities[j]));
  });
 }
 const interval=rows.filter(r=>r.seconds>=3&&r.seconds<=6),mean=k=>interval.reduce((s,r)=>s+r[k],0)/interval.length;
 const summary={source:input,sourceCodeSha256:createHash('sha256').update(fs.readFileSync(new URL(import.meta.url))).digest('hex'),
  traceSha256:record.traceSha256,actionsMatched:rows.length,mass,weight,
  maximumEffortPredictionError:Math.max(...rows.map(r=>r.effortPredictionError)),
  interval:{from:3,to:6,samples:interval.length,meanRequestedVerticalForce:mean('force'),meanNonGravityVerticalForce:mean('nonGravityForce'),
   meanSolverVerticalMiss:mean('solverMiss'),meanSaturatedChannels:mean('saturated')},
  channels:channels.map(c=>({...c,meanAbsoluteRequested:c.absoluteRequested/c.samples,meanAbsoluteActual:c.absoluteActual/c.samples,
   meanAbsoluteError:c.absoluteError/c.samples})).sort((a,b)=>b.meanAbsoluteError-a.meanAbsoluteError),rows};
 fs.writeFileSync(output,JSON.stringify(summary,null,2)+'\n');
 console.log(JSON.stringify({interval:summary.interval,channels:summary.channels.slice(0,8).map(({name,saturated,samples,wrongSign,maximumRatio,meanAbsoluteRequested,meanAbsoluteActual,meanAbsoluteError})=>({name,saturated,samples,wrongSign,maximumRatio,meanAbsoluteRequested,meanAbsoluteActual,meanAbsoluteError}))},null,2));
}finally{e.dispose();}
