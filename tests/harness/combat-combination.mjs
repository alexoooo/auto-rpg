import {Vector3} from '@babylonjs/core/Maths/math.vector.js';
import {coreStand} from './core-stand.mjs';
import {modelSpec} from '../../src/core/models.ts';
import {DEFAULT_ENGINE} from '../../src/core/engine/engines.ts';
import {createBody,SERVO_SECONDS} from '../../src/core/body.ts';
import {combatSkills} from '../../src/core/skills/combat.ts';
import {ATTACK_PATH} from '../../src/core/skills/attack-path.ts';
import {GUARD_ACTION} from '../../src/core/mind/intent.ts';
import {motionAtToRef} from '../../src/core/control/support.ts';

/** Two independent fist targets on an unpinned Warrior, through one shared command and stance. */
export async function combinationStand({lead='right',mode='hit',tuning={}}={}) {
 const s=await coreStand(modelSpec('workshop-fighter'),{engine:DEFAULT_ENGINE});
 const body=createBody(s.built,s.world,{servoSeconds:SERVO_SECONDS,handFeedback:true});
 const skills=combatSkills(body,{...ATTACK_PATH,...tuning},null,undefined,false,undefined,undefined,true);
 const obstacle=mode==='hit'?s.world.physics.addFixedBox([0,1.63,.64],[.6,.2,.08]):null;
 const policy={stage:'lead',hand:lead,cancelled:false,pairs:0,overlaps:[],witness:null};
 const velocity=new Vector3(),spin=new Vector3();
 body.drive((view,dt)=>{
  const report=skills.report.strike,other=lead==='right'?'left':'right';
  if(view.time>=2&&!policy.cancelled){
   if(policy.stage==='lead'&&report.overlapHand===other){
    policy.overlaps.push({time:view.time,lead,returned:report.pointCycle.returned[lead],sequence:skills.state.sequence});
    policy.stage='follow';policy.hand=other;
   }else if(policy.stage==='follow'&&report.hand===other&&report.phase==='return'){
    policy.stage='wait';policy.hand=null;
   }else if(policy.stage==='wait'&&!report.hand){policy.pairs++;policy.stage='lead';policy.hand=lead;}
  }
  const hand=policy.hand;
  const command=skills.command(view,{move:null,face:0,hands:{left:GUARD_ACTION,right:GUARD_ACTION},
   combat:view.time>=2&&!policy.cancelled&&hand?{hand,family:'straight',target:[hand==='right'?.1:-.1,1.63,.6]}:null},dt);
  const active=skills.state.hand;
  if(active){
   motionAtToRef(s.built.segments.get(`hand.${active}`),view.fists[active].position,velocity,spin);
   velocity.subtractInPlace(view.stance.velocity);
  }
  policy.witness={hand:active,phase:skills.state.phase,closing:active?velocity.z:0};
  return command;
 });
 return {...s,body,skills,policy,obstacle,dispose(){body.dispose();s.dispose();}};
}
