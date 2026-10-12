import {writeFileSync} from 'node:fs';
import cases from './stand-up-learning-cases.json' with {type:'json'};
import {recoveryEnvironment} from './stand-up-environment.mjs';

// A research-only +/-20% friction margin around gameplay's 0.5; no shared engine setting changes.
const coefficients=[.4,.5,.6],output=process.argv[2],records=[];
if(!output)throw new Error('output JSON required');
for(const friction of coefficients)for(const c of cases.selection.filter(c=>c.degrees%90===0)){
 const e=await recoveryEnvironment({...c,balance:100,host:'simbicon',baseline:'assisted-rise'});
 try{
  const physics=e.stand.world.physics,step=physics.step.bind(physics);
  // Hand-pose changes can recreate colliders; apply the declared law before every solver step.
  physics.step=dt=>{physics.raw.colliders.forEach(collider=>collider.setFriction(friction));step(dt);};
  const pristine=e.save(),started=performance.now();let steps=0;
  for(const fallback of [null,...cases.fallbackRecipes]){
   if(fallback)e.restore(pristine);
   await e.fall({...c,...fallback});steps+=e.stand.world.steps;
   if(e.result().fell)break;
  }
  const entry=e.stand.world.steps;
  if(e.result().fell)while(e.result().elapsed<35){
   e.step();if(e.result().success||e.result().failure)break;
  }
  records.push({case:c,identity:{...e.identity,friction},result:e.result(),assistance:structuredClone(e.experiment.assistance),
   steps:steps+e.stand.world.steps-entry,milliseconds:performance.now()-started});
  writeFileSync(output,JSON.stringify({kind:'research-only uniform collider friction margin; ordinary host and recovery Balance 100',coefficients,records},null,2));
  console.log(JSON.stringify({case:c,friction,result:e.result()}));
 }finally{e.dispose();}
}
