import{isMainThread,parentPort,workerData}from'node:worker_threads';
import{readFileSync,writeFileSync}from'node:fs';
import{workerPool}from'./cma.mjs';
import{recoveryEnvironment}from'./stand-up-environment.mjs';
import{assistControl}from'./stand-up-assist.mjs';
import{ASSISTED_RECOVERY}from'../src/core/control/recovery-posture.ts';
import{norm}from'../src/core/math/real.ts';

async function trial(configuration){
 const{recipe,after,duration,knee}=configuration,e=await recoveryEnvironment({...recipe,balance:100,host:'simbicon',baseline:'assisted-rise'});
 const control=assistControl(e,{...ASSISTED_RECOVERY.settings,repositionAfter:Infinity,releaseSeconds:0,posture:'staggered'}),weight=[...e.stand.built.segments.values()].reduce((s,p)=>s+p.rigid.mass,0)*norm(e.stand.world.physics.gravity);
 try{await e.fall(recipe);Object.assign(control.state,e.legacy.state.feedback);let disturbed=false;const trace=[];
  while(e.result().fell&&e.result().elapsed<18){
   if(recipe.disturbance&&!disturbed&&e.result().elapsed>=recipe.disturbance.after){e.stance.shove(recipe.disturbance.impulse,recipe.disturbance.degrees);disturbed=true;}
   const action=control(e.measure()),fraction=(e.result().elapsed-after)/duration;
   if(action.kind==='targets'&&fraction>=0&&fraction<1){const blend=fraction<.25?fraction/.25:fraction<.65?1:(1-fraction)/.35;
    if(configuration.fold!==false)action.angles=action.angles.map((v,i)=>{const c=e.channels[i],target=c.name.startsWith('knee.')?knee:c.name.startsWith('hip.')&&c.name.endsWith('flexion')?knee/2:c.name.startsWith('ankle.')&&c.name.endsWith('dorsiflexion')?knee/2:v;return v+blend*(Math.max(c.min,Math.min(c.max,target))-v);});
    if(configuration.unload!==false)action.assist.force=action.assist.force.map((v,i)=>v*(1-blend)+(i===1?weight*blend:0));
   }
   e.step(action,{automaticHandover:true});if(e.stand.world.steps%60===0)trace.push({seconds:e.result().elapsed,up:e.measure().rootUp,soles:e.measure().soleUp,has:e.body.has});
   if(e.result().success||e.result().failure)break;
  }
  return{configuration,identity:e.identity,result:e.result(),trace,steps:e.stand.world.steps,assistance:e.experiment.assistance};
 }finally{e.dispose();}
}
if(!isMainThread&&workerData?.reposition)parentPort.on('message',async({id,x})=>{try{parentPort.postMessage({id,r:await trial(x)});}catch(error){parentPort.postMessage({id,r:{configuration:x,error:String(error.stack??error)}});}});
else if(isMainThread){const[input,output]=process.argv.slice(2);if(!output)throw new Error('failed-case report and output required');
 const report=JSON.parse(readFileSync(input,'utf8')),pool=workerPool(new URL(import.meta.url),{reposition:true},3),rows=[];
 const recipes=report.records.filter(r=>r.result.fell&&!r.result.success).map(r=>({...r.attempts.at(-1).recipe,disturbance:r.case.disturbance}));
 const configurations=process.argv[4]==='ablation'
  ? recipes.flatMap(recipe=>[false,true].flatMap(fold=>[false,true].map(unload=>({recipe,after:6,duration:.5,knee:1,fold,unload}))))
  : recipes.flatMap(recipe=>[4,6].flatMap(after=>[.5,1,1.5].flatMap(duration=>[.6,1,1.4].map(knee=>({recipe,after,duration,knee})))));
 try{await Promise.all(configurations.map(async configuration=>{
  const r=await pool.evaluate(configuration);rows.push(r);writeFileSync(output,JSON.stringify(rows));console.log(JSON.stringify({configuration,result:r.result,error:r.error}));
 }));}finally{await pool.terminate();}}
