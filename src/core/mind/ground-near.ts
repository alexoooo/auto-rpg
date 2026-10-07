import type {BodyView} from "../body.ts";
import {sin,cos,hypot} from "../math/real.ts";
import {STANCE_LOWER} from "../skills/locomotion.ts";
import type {SkillReport} from "../skills/skills.ts";
import type {Vec3} from "../spec/quantity.ts";
import { NO_COVER, type BlowAttack, type Intent } from "./intent.ts";
import {lowOpponent} from "./sensed-bounds.ts";
import {highestSurface} from "./openings.ts";
import type {BodySense} from "./senses.ts";
import {lyingAxis} from "./targets.ts";
import type { Side } from "../spec/body.ts";
/** Close approach cells and finite deadlines: `docs/reference/ground-combat.md#policy-settings`. */
const GROUND_NEAR=Object.freeze({across:.35,ahead:.04,outside:.35,along:.12,near:.1,settle:.12,speed:.18,braking:.5,quiet:.1,refresh:.5,lower:.5,targetShift:.2,reach:.6,acquisition:5,attack:8,approach:30,retry:1});
/** Approach beside a quiet observed torso, lower through the shared executor, and return standing. */
export function groundNear(clearMove:(view:BodyView,h:number,m:readonly[number,number]|null)=>readonly[number,number]|null,override:Partial<typeof GROUND_NEAR>={}) {
 const tuning={...GROUND_NEAR,...override};
 const state={phase:'guard',surface:null as string|null,stage:'approach' as 'approach'|'lower'|'attack'|'rise',active:false,foe:null as string|null,hand:null as Side|null,face:0,target:null as Vec3|null,action:null as BlowAttack|null,next:0,elapsed:0,lowTime:0,retry:0};
 const guard = NO_COVER;
 const reset=()=>{state.stage='approach';state.phase='guard';state.active=false;state.foe=null;state.hand=null;state.target=null;state.action=null;state.next=0;state.elapsed=0;state.lowTime=0;state.retry=0;};
 return {state,reset,withdraw(){state.stage='rise';},decide(view:BodyView,report:SkillReport,foe:BodySense,hand:Side,dt:number):Intent|null {
  const support=report.support;if(!support)return null;
  state.retry=Math.max(0,state.retry-dt);const low=lowOpponent(view,foe);
  if(!state.active){
   if(!low||report.strike.hand||support.stage!=='stand')return null;
   if(state.retry)return {move:null,face:report.heading,guard,attack:null};
   state.active=true;state.foe=foe.id;state.hand=hand;state.face=report.heading;
  }
  hand=state.hand!;state.elapsed+=dt;
  if(!low||foe.id!==state.foe||view.down)state.stage='rise';
  if(state.stage==='approach'&&state.elapsed>=tuning.approach)state.stage='rise';
  if(state.stage==='lower'||state.stage==='attack'){
   state.lowTime+=dt;
   if((state.stage==='lower'&&state.lowTime>=tuning.acquisition)||state.lowTime>=tuning.acquisition+tuning.attack)state.stage='rise';
  }
  if(state.stage==='rise'){
   state.phase='low-return';state.action=null;
   if(!report.strike.hand&&support.stage==='stand'){reset();state.retry=tuning.retry;}
   return {move:null,face:state.face,guard,lower:STANCE_LOWER,attack:null};
  }
  if(view.time>=state.next&&!report.strike.hand){
   const candidates=foe.spec.marks.middle.map(segment=>({segment,target:highestSurface(foe,segment,[view.stance.centre.x,view.stance.centre.y,view.stance.centre.z])})).filter(o=>o.target);
   const opening=candidates.reduce<typeof candidates[number]|null>((best,o)=>!best||o.target![1]>best.target![1]?o:best,null);
   if(!opening){state.stage='rise';return {move:null,face:state.face,guard,attack:null};}
   if(state.stage!=='approach'&&state.target&&hypot(opening.target![0]-state.target[0],opening.target![2]-state.target[2])>tuning.targetShift){state.stage='rise';state.action=null;return {move:null,face:state.face,guard,attack:null};}
   state.target=opening.target!;state.surface=opening.segment;state.next=view.time+tuning.refresh;
   if(state.stage==='approach'){
    state.face=lyingAxis(foe);
   }
  }
  if(!state.target)return {move:null,face:state.face,guard,attack:null};
  const target=state.target,c=view.stance.centre,fx=sin(state.face),fz=cos(state.face),rx=cos(state.face),rz=-sin(state.face),side=hand==='right'?1:-1;
  const x=target[0]-side*tuning.across*rx-tuning.ahead*fx,z=target[2]-side*tuning.across*rz-tuning.ahead*fz;
  if(state.stage==='approach'){
   const along=(x-c.x)*fx+(z-c.z)*fz;
   const wx=Math.abs(along)>tuning.along?x-side*tuning.outside*rx:x,wz=Math.abs(along)>tuning.along?z-side*tuning.outside*rz:z;
   const dx=wx-c.x,dz=wz-c.z,far=hypot(dx,dz);
   const clip=(v:number)=>Math.max(-tuning.speed,Math.min(tuning.speed,v/tuning.braking));
   const move=far<tuning.near?null:clearMove(view,report.heading,[clip(dx*sin(report.heading)+dz*cos(report.heading)),clip(dx*cos(report.heading)-dz*sin(report.heading))]);
   if(far<tuning.settle&&view.stance.phase==='stand'&&view.stance.velocity.lengthSquared()<tuning.quiet*tuning.quiet){state.stage='lower';state.lowTime=0;}
   state.phase='low-approach';return {move,face:state.face,guard,attack:null};
  }
  if(hypot(target[0]-c.x,target[2]-c.z)>tuning.reach){state.stage='rise';state.action=null;return {move:null,face:state.face,guard,attack:null};}
  if(support.ready)state.stage='attack';
  if(!report.strike.hand)state.action=state.stage==='attack'?{kind:'blow',hand,target,path:{family:'downward',armExtension:0}}:null;
  state.phase=state.stage==='attack'?report.strike.phase??'low-attack':'low-prepare';
  return {move:null,face:state.face,guard,lower:tuning.lower,attack:state.action};
 }};
}
