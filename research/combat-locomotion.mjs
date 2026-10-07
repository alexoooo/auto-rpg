import {coreStand} from '../tests/harness/core-stand.mjs';
import {modelSpec} from '../src/core/models.ts';
import {createBody, SERVO_SECONDS} from '../src/core/body.ts';
import {DEFAULT_ENGINE} from '../src/core/engine/engines.ts';
import {locomotion,STANCE_LOWER} from '../src/core/skills/locomotion.ts';
import {GUARD} from '../src/core/skills/guard.ts';
import {balanceCeiling,balancePercent,rulebook} from '../src/core/rules/rulebook.ts';

/** A half-turn from rest or an established walk, through shared locomotion and ordinary muscles. */
export async function combatTurn({speed,rate,sense,after,turnLimit,turnStartup,model='workshop-fighter',engine=DEFAULT_ENGINE,balance=0,hz=120}) {
 if(!Number.isFinite(speed)||speed<=0||!Number.isFinite(rate)||rate<=0||![-1,1].includes(sense)||!Number.isFinite(after)||after<0)
  throw new Error('turn trial needs positive speed/rate, a sense and nonnegative walking delay');
 const legs=locomotion(null,turnLimit,turnStartup),assist=balanceCeiling(balance,balancePercent(rulebook('arena')));
 const stand=await coreStand(modelSpec(model),{engine,hz});
 const body=createBody(stand.built,stand.world,{servoSeconds:SERVO_SECONDS,measuring:true,assist});
 let heading=0,turned=0,reference=null,minimum=Infinity,firstDown=null,maximumTurn=0,askedHeading=0;
 body.drive((view,dt)=>{
  if(view.time>=1+after&&turned<Math.PI){const d=Math.min(rate*dt,Math.PI-turned);turned+=d;heading+=sense*d;}
  const walk=view.time<1||view.time>=1+after+Math.PI/rate+3?null:[speed,0];
  const stance=legs.goal(view,walk,heading,dt);
  maximumTurn=Math.max(maximumTurn,Math.abs(legs.heading-askedHeading)/dt);askedHeading=legs.heading;
  reference=legs.reference;
  return {posture:GUARD,hands:{left:null,right:null},pushes:[],stance};
 });
 try{
  for(let i=0;i<stand.seconds(1+after+Math.PI/rate+5);i++){
   stand.step();const v=body.view;
   if(reference!==null)minimum=Math.min(minimum,v.stance.centre.y-v.stance.support.y);
   if(v.down&&firstDown===null)firstDown=v.time;
  }
  const v=body.view;
  return {config:{speed,rate,sense,after,...(turnLimit===undefined?{}:{turnLimit}),...(turnStartup===undefined?{}:{turnStartup}),model,engine,balance,hz},
   harness:{kind:'Node core stand',engine,hz,actuation:stand.world.actuation,posture:'GUARD',pinned:false,held:'empty',balance},
   firstDown,drop:reference-STANCE_LOWER-minimum,maximumTurn,phase:v.stance.phase,speed:v.stance.velocity.length(),strides:v.stance.strides,
   recoveries:v.stance.recoveries,assist:structuredClone(body.assist.meter)};
 }finally{body.dispose();stand.dispose();}
}
