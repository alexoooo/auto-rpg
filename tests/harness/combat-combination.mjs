import {Vector3} from '@babylonjs/core/Maths/math.vector.js';
import {coreStand} from './core-stand.mjs';
import {modelSpec} from '../../src/core/models.ts';
import {DEFAULT_ENGINE} from '../../src/core/engine/engines.ts';
import {createBody,SERVO_SECONDS} from '../../src/core/body.ts';
import {combatSkills} from '../../src/core/skills/strikes/combat.ts';
import {ATTACK_PATH} from '../../src/core/skills/strikes/attack-path.ts';
import {actionCycles} from '../../research/action-cycles.mjs';
import {NO_COVER} from '../../src/core/intent/intent.ts';
import {motionAtToRef} from '../../src/core/read-motion.ts';

/** Two independent fist targets on an unpinned Warrior, through one shared command and stance. */
export async function combinationStand({lead='right',mode='hit',tuning={}}={}) {
 const s=await coreStand(modelSpec('workshop-fighter'),{engine:DEFAULT_ENGINE});
 const body=createBody(s.built,s.world,{servoSeconds:SERVO_SECONDS,feedback:true});
 const skills=combatSkills(body,{paths:{...ATTACK_PATH,...tuning},overlap:true});
 const obstacle=mode==='hit'?s.world.physics.addFixedBox([0,1.63,.64],[.6,.2,.08]):null;
 const cycles=actionCycles(skills);
 const policy={cycles:cycles.state,stage:'lead',hand:lead,cancelled:false,pairs:0,overlaps:[],witness:null};
 const velocity=new Vector3(),spin=new Vector3();
 body.drive((view,dt)=>{
  const report=skills.report.actions,other=lead==='right'?'left':'right';
  cycles.sample();
  if(view.time>=2&&!policy.cancelled){
   if(policy.stage==='lead'&&report.some(action=>action.effector===`hand.${lead}`&&action.phase==='release')){
    policy.overlaps.push({time:view.time,lead,returned:cycles.reading().returned[lead],sequence:report.find(action=>action.effector===`hand.${lead}`).id});
    policy.stage='follow';policy.hand=other;
   }else if(policy.stage==='follow'&&report.some(action=>action.effector===`hand.${other}`&&action.phase==='release')){
    policy.stage='wait';policy.hand=null;
   }else if(policy.stage==='wait'&&!report.length){policy.pairs++;policy.stage='lead';policy.hand=lead;}
  }
  const actions=['left','right'].flatMap(hand=>cycles.requests(view,'straight',`hand.${hand}`,{kind:'point',at:[hand==='right'?.1:-.1,1.63,.6]},view.time>=2&&!policy.cancelled&&policy.hand===hand));
  const command=skills.command(view,{move:null,face:0,guard:NO_COVER,actions},dt);
  const activeAction=skills.report.actions.find(action=>action.phase!=='release')??skills.report.actions[0],active=activeAction?.effector.split('.')[1];
  if(active){
   motionAtToRef(s.built.segments.get(`hand.${active}`),view.fists[active].position,velocity,spin);
   velocity.subtractInPlace(view.stance.velocity);
  }
  policy.witness={hand:active??null,phase:active?cycles.phase(`hand.${active}`):null,closing:active?velocity.z:0};
  return command;
 });
 return {...s,body,skills,policy,obstacle,cycles,dispose(){body.dispose();s.dispose();}};
}
