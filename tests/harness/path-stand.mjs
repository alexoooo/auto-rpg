import {coreStand} from './core-stand.mjs';
import {modelSpec} from '../../src/core/models.ts';
import {DEFAULT_ENGINE} from '../../src/core/engine/engines.ts';
import {createBody,SERVO_SECONDS} from '../../src/core/body.ts';
import {NO_COVER} from '../../src/core/mind/intent.ts';
import {skillSet} from '../../src/core/skills/arbiter.ts';
import {pathExecutor} from '../../src/core/skills/combat.ts';
import {ATTACK_PATH} from '../../src/core/skills/attack-path.ts';
import {locomotion} from '../../src/core/skills/locomotion.ts';
import {guardSkill} from '../../src/core/skills/guard.ts';
import {supportFold} from '../../src/core/skills/support-fold.ts';
import {actionCycles} from '../../research/action-cycles.mjs';

/**
 * **A Warrior on the core stand striking one point again and again** through a path executor of
 * one action, `strike` (`action` its family, arm style and support height), by numbered requests
 * (`actionCycles`) from `from` s until `until` s. `target` is the point request's target, whose
 * fields a test may change between steps; `ground` gives the skill set its support fold. `paths`
 * is the executor's memory, `stage()` the live stroke's stage, and `states()` everything a fork
 * of the stand carries.
 */
export async function pathStand({hand='right',action={},tuning={},target,from=2,until=Infinity,ground=false}={}) {
 const s=await coreStand(modelSpec('workshop-fighter'),{engine:DEFAULT_ENGINE});
 const body=createBody(s.built,s.world,{servoSeconds:SERVO_SECONDS,feedback:true}),effector=`hand.${hand}`;
 const actions=[{name:'strike',executor:'paths',effectors:[effector],family:'straight',...action}];
 const executor=pathExecutor(body,actions,{paths:{...ATTACK_PATH,...tuning}});
 const skills=skillSet(body,{},{legs:locomotion(body.envelope),guard:guardSkill(body.built.spec),support:ground?supportFold(body):null,
  executors:[{name:'paths',executor}],actions});
 const cycles=actionCycles(skills),aim={kind:'point',at:[hand==='right'?.1:-.1,1.63,.6],...target};
 body.drive((view,dt)=>{
  if(view.resumed)skills.resume(view);
  return skills.command(view,{move:null,face:0,guard:NO_COVER,actions:cycles.requests(view,'strike',effector,aim,view.time>=from&&view.time<until)},dt);
 },skills.release);
 return {...s,body,skills,cycles,aim,paths:executor.state,
  stage:()=>skills.report.actions[0]?.stage??null,
  states:()=>({body:body.state,skills:skills.state,cycles:cycles.state})};
}
