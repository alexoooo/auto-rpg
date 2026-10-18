import { recoveryFeatures } from '../src/core/control/recovery-features.ts';
import { serialize, deserialize } from 'node:v8';
import { recoveryEnvironment } from './stand-up-environment.mjs';
import { SEARCH_FALL } from '../src/lab/stance-mode.ts';
import { recoveryDesign } from './stand-up-design.mjs';

/** Full-body observations and bounded actions over the actual game world's recovery port. */
export async function learningEnvironment(configuration = {}) {
  const options = { balance: 0, seconds: 12, actionRepeat: 3, seed: 1, mode: 'torque', ...configuration };
  if (!['torque', 'targets'].includes(options.mode) || !Number.isSafeInteger(options.actionRepeat)
    || options.actionRepeat < 1 || options.actionRepeat > 12) throw new Error('invalid training action mapping');
  const e = await recoveryEnvironment({ ...options, spec: recoveryDesign(options) });
  const reference = e.measure(), standing = reference.observation.height;
  const root = e.stand.built.segments.get('lowerTrunk');
  const actionSize = e.channels.length + 6;
  const previous = Array(actionSize).fill(0);
  let randomState = options.seed >>> 0, steps = 0, totalSteps = 0, returnValue = 0;
  const random = () => ((randomState = (Math.imul(randomState,1664525)+1013904223)>>>0)/4294967296);
  const pristine = e.save();
  const features = recoveryFeatures({rest:root.rest.asArray(),standing,channels:e.channels,balance:options.balance,strength:options.strength??1});
  const observation = () => features(e.measure(),previous);
  const reward = m => {
    const o=m.observation;
    // The published long-tail head-height reward is scaled to this model's reference height.
    const desired=reference.observation.head[1]*.95, gap=Math.max(0,desired-o.head[1])/(desired/4);
    const height=1/(1+4*gap*gap);
    const upright=o.height<standing*.5 ? 1 : Math.max(0,Math.min(1,(m.rootUp+1)/1.9));
    const r=o.segments.find(s=>s.name==='lowerTrunk');
    const moving=(Math.max(0,Math.abs(r.velocity[0])-.3)+Math.max(0,Math.abs(r.velocity[2])-.3))/1.2;
    const feet=o.segments.filter(s=>s.name.startsWith('foot.'));
    const distance=Math.hypot(feet[0].centre[0]-feet[1].centre[0],feet[0].centre[2]-feet[1].centre[2]);
    const spread=Math.max(0,(distance-.9)/.38);
    const shaped=height*upright/(1+moving*moving)*Math.max(0,1-spread*spread);
    return { height, upright, shaped, support: m.ready?1:0 };
  };
  const step = action => {
    if (!Array.isArray(action) || action.length!==actionSize || !action.every(x=>Number.isFinite(x)&&Math.abs(x)<=1)) throw new Error('invalid policy action');
    if (options.filterSeconds) {
      const interval=options.actionRepeat/120, fraction=interval/(options.filterSeconds+interval);
      action=action.map((x,i)=>previous[i]+fraction*(x-previous[i]));
    }
    const n=e.channels.length;
    const help={force:action.slice(n,n+3).map(x=>x*e.body.assist.most.force),moment:action.slice(n+3).map(x=>x*e.body.assist.most.moment)};
    let command=options.mode==='torque'
      ? {kind:'muscles',velocity:action.slice(0,n).map(x=>x>=0?'+inf':'-inf'),activation:action.slice(0,n).map(Math.abs),assist:help,handPoses:{left:'open',right:'open'}}
      : {kind:'targets',angles:action.slice(0,n).map((x,i)=>e.channels[i].min+(x+1)/2*(e.channels[i].max-e.channels[i].min)),response:.15,speed:6,activation:1,assist:help};
    let row, value=0, components;
    for(let k=0;k<options.actionRepeat;k++) {
      row=e.step(command,{automaticHandover:true}); steps++;totalSteps++;
      components=reward(row); value+=components.shaped;
      if(row.result.success||row.result.failure)break;
    }
    previous.splice(0,previous.length,...action);
    value/=options.actionRepeat;
    const terminated=!!(row.result.success||row.result.failure), truncated=steps>=options.seconds*120;
    // Success is an absorbing standing state: termination retains its discounted unit reward.
    if(row.result.success)value+=1/(1-(options.discount??.97));
    if(row.result.failure)value-=1;
    returnValue+=value;
    return {observation:observation(),reward:value,terminated,truncated,components,result:row.result,
      assistance:structuredClone(e.experiment.assistance),episodeSteps:steps,totalSteps,returnValue};
  };
  const reset = async ({ degrees, impulse, separation, settleSteps } = {}) => {
    e.restore(pristine);steps=0;returnValue=0;previous.fill(0);
    const before=e.stand.world.steps;
    const requestedRecipe={degrees:degrees??random()*360,
      impulse:impulse??(options.randomizeFalls ? SEARCH_FALL.impulse-15+30*random() : SEARCH_FALL.impulse),
      separation:separation??(options.randomizeFalls ? .1+.25*random() : SEARCH_FALL.separation),
      settleSteps:settleSteps??(options.randomizeFalls ? Math.floor(60*random()) : 0)};
    let recipe=requestedRecipe;
    const attempts=[];
    await e.fall(recipe);totalSteps+=e.stand.world.steps-before;attempts.push({...recipe,fell:e.result().fell});
    for (const force of [90,120,160]) if(!e.result().fell) {
      // Declared fallback recipes are recorded; prevention never becomes a get-up success.
      e.restore(pristine);recipe={...recipe,impulse:force,separation:.2};await e.fall(recipe);totalSteps+=e.stand.world.steps;
      attempts.push({...recipe,fell:e.result().fell});
    }
    if (degrees === undefined) for(let retry=0;retry<8 && !e.result().fell;retry++) {
      e.restore(pristine);recipe={...recipe,degrees:random()*360};await e.fall(recipe);totalSteps+=e.stand.world.steps;
      attempts.push({...recipe,fell:e.result().fell});
    }
    if (degrees === undefined && !e.result().fell) throw new Error('training reset could not produce a physical fall');
    const initial = observation(), gravity = initial.slice(4,7);
    const initialPose = gravity[1] > .65 ? 'upright' : gravity[1] < -.65 ? 'inverted'
      : Math.abs(gravity[0]) > Math.abs(gravity[2]) ? (gravity[0] > 0 ? 'left-side' : 'right-side')
      : gravity[2] > 0 ? 'supine' : 'prone';
    return {observation:initial,initialPose,result:e.result(),requestedRecipe,recipe,attempts,totalSteps};
  };
  return { actionSize, observation, step, reset,
    inspect:()=>({measurement:e.measure(),host:e.stance.frame(),result:e.result(),has:e.body.has}),
    identity:{...e.identity,options,observationVersion:1,actionSize},
    save:()=>serialize({physical:e.save(),previous,randomState,steps,totalSteps,returnValue}),
    restore(bytes){const s=deserialize(bytes);e.restore(s.physical);previous.splice(0,previous.length,...s.previous);
      randomState=s.randomState;steps=s.steps;totalSteps=s.totalSteps;returnValue=s.returnValue;},
    dispose:()=>e.dispose() };
}
