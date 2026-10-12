import {writeFileSync} from 'node:fs';
import cases from './stand-up-learning-cases.json' with {type:'json'};
import {recoveryEnvironment} from './stand-up-environment.mjs';

// Measure the actual sub-mind callbacks, including observation/support work, separately from physics.
const output=process.argv[2],records=[];
if(!output)throw new Error('output JSON required');
const summary=values=>{
 const sorted=[...values].sort((a,b)=>a-b);
 return {calls:values.length,meanMs:values.reduce((a,b)=>a+b,0)/values.length,
  p50Ms:sorted[Math.floor(sorted.length*.5)],p95Ms:sorted[Math.floor(sorted.length*.95)]};
};
for(const c of cases.selection.filter(c=>c.degrees%90===0)){
 const e=await recoveryEnvironment({...c,balance:100,host:'simbicon',baseline:'assisted-rise'});
 const samples={wants:[],step:[]};
 const meter=()=>({seconds:0,activeSeconds:0,forcePeak:0,momentPeak:0,forceIntegral:0,momentIntegral:0});
 const requested={preparation:meter(),recovery:meter(),host:meter()};let force=0,moment=0;
 const ask=e.body.assist.ask;
 e.body.assist.ask=(f,m)=>{force=f.length();moment=m.length();ask(f,m);};
 const watch=e.stand.world.afterStep(()=>{
  const phase=e.experiment.takeover===null?'preparation':e.body.has==='command'?'host':'recovery',m=requested[phase],dt=e.stand.world.dt;
  m.seconds+=dt;if(force>0||moment>0)m.activeSeconds+=dt;
  m.forcePeak=Math.max(m.forcePeak,force);m.momentPeak=Math.max(m.momentPeak,moment);
  m.forceIntegral+=force*dt;m.momentIntegral+=moment*dt;force=0;moment=0;
 });
 for(const name of ['wants','step']){
  const original=e.legacy[name];
  e.legacy[name]=(...args)=>{const active=e.legacy.state.phase!=='idle',before=performance.now();
   const result=original(...args),elapsed=performance.now()-before;
   if(active)samples[name].push(elapsed);return result;
  };
 }
 try{
  const pristine=e.save();let steps=0;
  for(const fallback of [null,...cases.fallbackRecipes]){
   if(fallback){e.restore(pristine);for(const phase of Object.keys(requested))Object.assign(requested[phase],meter());}
   await e.fall({...c,...fallback});steps+=e.stand.world.steps;if(e.result().fell)break;
  }
  const entry=e.stand.world.steps;
  if(e.result().fell)while(e.result().elapsed<35){e.step();if(e.result().success||e.result().failure)break;}
  records.push({case:c,identity:e.identity,result:e.result(),callbacks:Object.fromEntries(Object.entries(samples).map(([k,v])=>[k,summary(v)])),
   requested,delivered:structuredClone(e.experiment.assistance),steps:steps+e.stand.world.steps-entry,heapBytes:process.memoryUsage().heapUsed});
  writeFileSync(output,JSON.stringify({harness:'Node Stance Lab, gameplay Rapier coordinate engine, 120 Hz, ordinary muscles; active recovery callbacks only',
   records},null,2));
 }finally{watch.dispose();e.dispose();}
}
