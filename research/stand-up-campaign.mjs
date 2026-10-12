import { isMainThread, parentPort, workerData } from 'node:worker_threads';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {parseArgs} from 'node:util';
import {Quaternion,Vector3} from '@babylonjs/core/Maths/math.vector.js';
import cases from './stand-up-learning-cases.json' with {type:'json'};
import {ASSISTED_RECOVERY as preset,assistedPosture} from '../src/core/control/recovery-posture.ts';
import {workerPool} from './cma.mjs';
import {recoveryEnvironment} from './stand-up-environment.mjs';
import {recoveryDesign} from './stand-up-design.mjs';
import {assistControl} from './stand-up-assist.mjs';
import {recoveryQualification} from './stand-up-qualification.mjs';

/** Orientation is measured after the generating prefix, never inferred from shove direction. */
function poseOf(e){
 const root=e.stand.built.segments.get('lowerTrunk');
 const turn=root.node.rotationQuaternion.multiply(Quaternion.Inverse(root.rest));
 const g=Vector3.Up().applyRotationQuaternion(Quaternion.Inverse(turn));
 return g.y>.65?'upright':g.y<-.65?'inverted':Math.abs(g.x)>Math.abs(g.z)?(g.x>0?'left-side':'right-side'):g.z>0?'supine':'prone';
}

/** Full runtime, disturbance and same-body repeated-fall trials under one declared configuration. */
export async function recoveryTrial(configuration,c,policySha){
 const e=await recoveryEnvironment({...configuration,...c,spec:recoveryDesign({...configuration,...c})});
 const control=assistControl(e,{...preset.settings,...configuration,angles:e.channels.map(k=>assistedPosture(e.stand.built.spec)[k.name]??0)});
 const started=performance.now(),falls=[];let chargedSteps=0;
 try{
  for(const recipe of c.falls??[c]){
   if(falls.length)e.nextFall();
   control.state.heading=null;control.state.released=false;control.state.started=null;
   const pristine=e.save(),origin=e.stand.world.steps,attempts=[];
   for(const fallback of [null,...cases.fallbackRecipes]){
    if(fallback)e.restore(pristine);
    const executed={...recipe,...fallback,passiveSteps:configuration.passiveSteps??0};
    await e.fall(executed);chargedSteps+=e.stand.world.steps-origin;
    attempts.push({recipe:executed,fell:e.result().fell});if(e.result().fell)break;
   }
   const initialPose=poseOf(e),at=e.stand.world.steps;let disturbed=false;
   if(e.result().fell && !configuration.prefixOnly)while(e.result().elapsed<(configuration.seconds??35)){
    if(recipe.disturbance && !disturbed && e.result().elapsed>=recipe.disturbance.after){
     e.stance.shove(recipe.disturbance.impulse,recipe.disturbance.degrees);disturbed=true;
    }
    const row=e.step(configuration.control==='feedback'?control(e.measure()):undefined,{automaticHandover:configuration.control==='feedback'});
    if(row.result.success||row.result.failure)break;
   }
   chargedSteps+=e.stand.world.steps-at;
   falls.push({case:recipe,policySha,identity:e.identity,initialPose,attempts,result:e.result(),disturbed,
    assistance:structuredClone(e.experiment.assistance),host:{from:e.experiment.walkFrom,to:e.observe().centre}});
   if(!e.result().success)break;
  }
  return c.falls?{case:c,policySha,configuration,falls,steps:chargedSteps,milliseconds:performance.now()-started}
   :{...falls[0],case:c,configuration,steps:chargedSteps,milliseconds:performance.now()-started};
 }finally{e.dispose();}
}

if(!isMainThread && workerData?.qualification)parentPort.on('message',async({id,x})=>{
 try{parentPort.postMessage({id,r:await recoveryTrial(x.configuration,x.case,x.policySha)});}
 catch(error){parentPort.postMessage({id,r:{case:x.case,policySha:x.policySha,error:String(error.stack??error)}});}
});
else if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const {values}=parseArgs({options:{partition:{type:'string',default:'selection'},workers:{type:'string',default:'3'},
  config:{type:'string'},output:{type:'string'}}});
 if(!['selection','validation','disturbed','repeated'].includes(values.partition)||!values.output)throw new Error('partition and output required');
 const configuration=values.config?JSON.parse(readFileSync(values.config,'utf8')):{balance:100,host:'simbicon',baseline:'assisted-rise',seconds:35};
 if(values.partition==='validation')configuration.passiveSteps=cases.protocol.validationPassiveSteps;
 const {passiveSteps: _prefix,...policyConfiguration}=configuration;
 const policySha=createHash('sha256').update(JSON.stringify({configuration:policyConfiguration,preset})).digest('hex');
 const pool=workerPool(new URL(import.meta.url),{qualification:true},Number(values.workers)),records=[];
 mkdirSync(dirname(values.output),{recursive:true});
 const write=()=>writeFileSync(values.output,JSON.stringify({partition:values.partition,configuration,policySha,records,
  gates:['substantial','full'].map(level=>recoveryQualification(records,{partition:values.partition,level}))},null,2));
 try{await Promise.all(cases[values.partition].map(async c=>{
  const r=await pool.evaluate({configuration,case:c,policySha});records.push(r);write();
  console.log(JSON.stringify({case:c,result:r.result,falls:r.falls?.map(f=>f.result),error:r.error}));
 }));}finally{await pool.terminate();write();}
}
