import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {recoveryEnvironment} from './stand-up-environment.mjs';
import {ASSISTED_RECOVERY as preset} from '../src/core/control/recovery-posture.ts';

// Capture complete failing continuations, including the preceding successful falls of a sequence.
const [input,output]=process.argv.slice(2);
if(!output)throw new Error('campaign report and diagnostic output required');
const report=JSON.parse(readFileSync(input,'utf8')),records=[];
const {passiveSteps:_prefix,...configuration}=report.configuration;
assert.equal(report.policySha,createHash('sha256').update(JSON.stringify({configuration,preset})).digest('hex'),
 'diagnose the exact generating controller configuration');
mkdirSync(dirname(output),{recursive:true});
for(const record of report.records){
 const falls=record.falls??[record];
 if(!falls.some(f=>f.result?.fell&&!f.result.success))continue;
 const e=await recoveryEnvironment({...report.configuration,...record.case});
 try{
  for(const [index,f] of falls.entries()){
   assert.equal(e.identity.sourceSha,f.identity.sourceSha,'diagnose the exact generating controller source');
   assert.equal(e.identity.specSha,f.identity.specSha);
   if(index)e.nextFall();
   await e.fall(f.attempts.at(-1).recipe);
   const failed=!f.result.success,rows=[],start=e.stand.world.steps;let disturbed=false;
   const checkpoint=failed?`${output}.${records.length}.bin`:null;
   if(checkpoint)writeFileSync(checkpoint,e.save());
   while(e.result().elapsed<(report.configuration.seconds??35)){
    if(f.case.disturbance && !disturbed && e.result().elapsed>=f.case.disturbance.after){
     e.stance.shove(f.case.disturbance.impulse,f.case.disturbance.degrees);disturbed=true;
    }
    e.step();
    if(failed&&e.stand.world.steps%60===0)rows.push({time:e.result().elapsed,measurement:e.measure(),
     controller:structuredClone(e.legacy.state),force:e.body.assist.given.force.asArray(),moment:e.body.assist.given.moment.asArray()});
    if(e.result().success||e.result().failure)break;
   }
   if(failed){records.push({case:record.case,fall:index,checkpoint,identity:e.identity,result:e.result(),
    continuationSteps:e.stand.world.steps-start,worldSteps:e.stand.world.steps,rows});
    writeFileSync(output,JSON.stringify({input,records},null,2));}
   if(!e.result().success)break;
  }
 }finally{e.dispose();}
}
