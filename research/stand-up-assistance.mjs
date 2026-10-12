import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import cases from './stand-up-learning-cases.json' with {type:'json'};
import {recoveryEnvironment} from './stand-up-environment.mjs';
import {assistControl} from './stand-up-assist.mjs';
import {ASSISTED_RECOVERY} from '../src/core/control/recovery-posture.ts';

const output=process.argv[2];if(!output)throw new Error('output JSON required');
const allowances=[0,10,25,50,100],records=[];
const shorten=(values,limit)=>{const size=Math.hypot(...values),scale=size?Math.min(1,limit/size):0;return values.map(v=>v*scale);};
for(const c of cases.selection.filter(c=>c.degrees%90===0)){
 const e=await recoveryEnvironment({...c,balance:100,host:'simbicon',baseline:'assisted-rise'});
 const control=assistControl(e,{...ASSISTED_RECOVERY.settings,posture:'staggered'});
 try{
  const pristine=e.save();let prefixSteps=0;
  for(const fallback of [null,...cases.fallbackRecipes]){if(fallback)e.restore(pristine);await e.fall({...c,...fallback});prefixSteps+=e.stand.world.steps;if(e.result().fell)break;}
  assert.equal(e.result().fell,true,'each causal comparison begins at an actual fall');
  assert.equal(e.experiment.assistance.recovery.forceIntegral,0,'the saved entry has not supplied recovery help');
  const saved=e.save(),entry=e.stand.world.steps;
  for(const recoveryAllowance of allowances){e.restore(saved);Object.assign(control.state,e.legacy.state.feedback);const started=performance.now();
   while(e.result().elapsed<15){const action=control(e.measure());
    if(action.kind==='targets'){action.assist.force=shorten(action.assist.force,e.body.assist.most.force*recoveryAllowance/100);action.assist.moment=shorten(action.assist.moment,e.body.assist.most.moment*recoveryAllowance/100);}
    e.step(action,{automaticHandover:false});if(e.result().success||e.result().failure)break;
   }
   const row={case:c,identity:e.identity,hostBalance:100,recoveryAllowance,result:e.result(),assistance:structuredClone(e.experiment.assistance),steps:e.stand.world.steps-entry+(recoveryAllowance===0?prefixSteps:0),milliseconds:performance.now()-started};records.push(row);
   writeFileSync(output,JSON.stringify({kind:'causal recovery-only allowance, identical saved physical fall; ordinary host Balance 100',allowances,records},null,2));console.log(JSON.stringify({case:c,recoveryAllowance,result:row.result}));
  }
 }finally{e.dispose();}
}
