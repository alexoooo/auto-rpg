import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { serialize, deserialize } from 'node:v8';
import { recoveryEnvironment } from './stand-up-environment.mjs';
import { recoveryDesign } from './stand-up-design.mjs';
import { assistControl } from './stand-up-assist.mjs';

/** Full-body observations and bounded actions over the actual game world's recovery port. */
export async function learningEnvironment(configuration = {}) {
  const options = { balance: 100, seconds: 12, actionRepeat: 3, seed: 1, mode: 'torque', ...configuration };
  if (!['torque', 'targets', 'residual'].includes(options.mode) || !Number.isSafeInteger(options.actionRepeat)
    || options.actionRepeat < 1 || options.actionRepeat > 12) throw new Error('invalid training action mapping');
  const e = await recoveryEnvironment({ ...options, spec: recoveryDesign(options) });
  const reference = e.measure(), standing = reference.observation.height;
  const root = e.stand.built.segments.get('lowerTrunk');
  const restInverse = Quaternion.Inverse(root.rest), q = new Quaternion(), inverse = new Quaternion(), turn = new Quaternion(), v = new Vector3();
  const extremities = ['head','hand.left','hand.right','foot.left','foot.right'];
  const contacts = [...extremities,'shank.left','shank.right','lowerTrunk','upperTrunk'];
  const actionSize = e.channels.length + 6;
  const previous = Array(actionSize).fill(0);
  const prior = assistControl(e, { turn: .5, damping: .1, lift: 1.2, horizontal: 1, ...options.feedback });
  let randomState = options.seed >>> 0, steps = 0, totalSteps = 0, returnValue = 0;
  const random = () => ((randomState = (Math.imul(randomState,1664525)+1013904223)>>>0)/4294967296);
  const pristine = e.save();
  const observation = () => {
    const m = e.measure(), o = m.observation, r = o.segments.find(s=>s.name==='lowerTrunk');
    q.set(...r.rotation).multiplyToRef(restInverse, turn); Quaternion.InverseToRef(turn,inverse);
    const local = a => v.set(...a).applyRotationQuaternionToRef(inverse,v).asArray();
    const features = [o.height/standing, m.rootUp, ...m.soleUp, ...local([0,1,0]),
      ...local(r.velocity).map(x=>x/3), ...local(r.spin).map(x=>x/10)];
    o.joints.forEach((j,i)=>features.push(2*(j.angle-e.channels[i].min)/(e.channels[i].max-e.channels[i].min)-1, j.rate/10));
    for (const name of extremities) {
      const part=o.segments.find(s=>s.name===name);
      features.push(...local(part.centre.map((x,k)=>(x-r.centre[k])/standing)));
    }
    for (const name of contacts) features.push(o.contacts.some(c=>c.segment===name && c.fixed!==null && c.impulse>0)?1:0);
    if (options.mode === 'residual') {
      const heading = prior.state.heading ?? 0;
      features.push(...local([Math.sin(heading),0,Math.cos(heading)]), prior.state.released ? 1 : 0);
    }
    features.push(...previous, options.balance/100, options.strength ?? 1, 1);
    if (!features.every(Number.isFinite)) throw new Error('nonfinite policy observation');
    return features;
  };
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
    const n=e.channels.length;
    const help={force:action.slice(n,n+3).map(x=>x*e.body.assist.most.force),moment:action.slice(n+3).map(x=>x*e.body.assist.most.moment)};
    let command=options.mode==='torque'
      ? {kind:'muscles',velocity:action.slice(0,n).map(x=>x>=0?'+inf':'-inf'),activation:action.slice(0,n).map(Math.abs),assist:help,handPoses:{left:'open',right:'open'}}
      : {kind:'targets',angles:action.slice(0,n).map((x,i)=>e.channels[i].min+(x+1)/2*(e.channels[i].max-e.channels[i].min)),response:.15,speed:6,activation:1,assist:help};
    let row, value=0, components;
    for(let k=0;k<options.actionRepeat;k++) {
      if (options.mode === 'residual') {
        const base = prior(e.measure()), scale = options.residual ?? .2;
        command = base.kind === 'host' ? base : { ...base,
          angles: base.angles.map((x,i) => Math.max(e.channels[i].min, Math.min(e.channels[i].max,
            x + scale*action[i]*(e.channels[i].max-e.channels[i].min)))),
          assist: { force: base.assist.force.map((x,i) => x+scale*help.force[i]),
            moment: base.assist.moment.map((x,i) => x+scale*help.moment[i]) } };
      }
      row=e.step(command,{automaticHandover:true}); steps++;totalSteps++;
      components=reward(row); value+=components.shaped;
      if(row.result.success||row.result.failure)break;
    }
    previous.splice(0,previous.length,...action);
    value/=options.actionRepeat;
    const terminated=!!(row.result.success||row.result.failure), truncated=steps>=options.seconds*120;
    if(row.result.success)value+=10;
    if(row.result.failure)value-=1;
    returnValue+=value;
    return {observation:observation(),reward:value,terminated,truncated,components,result:row.result,
      assistance:structuredClone(e.experiment.assistance),episodeSteps:steps,totalSteps,returnValue};
  };
  const reset = async ({ degrees, impulse, separation, settleSteps } = {}) => {
    e.restore(pristine);steps=0;returnValue=0;previous.fill(0);prior.state.heading=null;prior.state.released=false;
    const before=e.stand.world.steps;
    const requestedRecipe={degrees:degrees??random()*360,
      impulse:impulse??(options.randomizeFalls ? 45+30*random() : 60),
      separation:separation??(options.randomizeFalls ? .1+.25*random() : .2),
      settleSteps:settleSteps??(options.randomizeFalls ? Math.floor(60*random()) : 0)};
    let recipe=requestedRecipe;
    const attempts=[];
    await e.fall(recipe);totalSteps+=e.stand.world.steps-before;attempts.push({...recipe,fell:e.result().fell});
    for (const force of [90,120]) if(!e.result().fell) {
      // Declared fallback recipes are recorded; prevention never becomes a get-up success.
      e.restore(pristine);recipe={...recipe,impulse:force,separation:.2};await e.fall(recipe);totalSteps+=e.stand.world.steps;
      attempts.push({...recipe,fell:e.result().fell});
    }
    if (degrees === undefined) for(let retry=0;retry<8 && !e.result().fell;retry++) {
      e.restore(pristine);recipe={...recipe,degrees:random()*360};await e.fall(recipe);totalSteps+=e.stand.world.steps;
      attempts.push({...recipe,fell:e.result().fell});
    }
    if (degrees === undefined && !e.result().fell) throw new Error('training reset could not produce a physical fall');
    return {observation:observation(),result:e.result(),requestedRecipe,recipe,attempts,totalSteps};
  };
  return { actionSize, observation, step, reset,
    identity:{...e.identity,options,observationVersion:1,actionSize},
    save:()=>serialize({physical:e.save(),previous,prior:prior.state,randomState,steps,totalSteps,returnValue}),
    restore(bytes){const s=deserialize(bytes);e.restore(s.physical);previous.splice(0,previous.length,...s.previous);
      Object.assign(prior.state,s.prior);
      randomState=s.randomState;steps=s.steps;totalSteps=s.totalSteps;returnValue=s.returnValue;},
    dispose:()=>e.dispose() };
}
