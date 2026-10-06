import {groundNear} from "./ground-near.ts";
import {groundWide} from "./ground-wide.ts";
import {atan2,sin,cos} from "../math/real.ts";
import type {BodyView} from "../body.ts";
import type {Hand} from "../control/motor.ts";
import type {SkillReport} from "../skills/skills.ts";
import type {BodySpec} from "../spec/body.ts";
import {lowOpponent,sensedFootClearance} from "./sensed-bounds.ts";
import {highestSurface} from "./openings.ts";
import type {BodySense} from "./senses.ts";
/** Observed motion and footprint admission cells: `docs/reference/ground-combat.md#motion-and-route-admission`. */
const GROUND_ADMISSION=Object.freeze({quiet:.1,spin:.2,steady:.5,outside:.7,ahead:.04,footRadius:.12});
/** Choose a close or wider approach from detached motion and foot clearance, retaining the active hand. */
export function groundCombat(spec:BodySpec,clearMove:Parameters<typeof groundNear>[0],override:Partial<typeof GROUND_ADMISSION>={},allowBoth=false){
 const near=groundNear(clearMove),wide=groundWide(spec,clearMove),tuning={...GROUND_ADMISSION,...override};
 const state={mode:'wide' as 'near'|'wide',steady:0,phase:'guard',surface:'upperTrunk',near:near.state,wide:wide.state};
 const reset=()=>{near.reset();wide.reset();state.mode='wide';state.steady=0;state.phase='guard';};
 return {state,reset,decide(view:BodyView,report:SkillReport,foe:BodySense,hand:Hand,dt:number){
  if(!lowOpponent(view,foe)&&!near.state.active&&!wide.state.active){reset();return null;}
  const quiet=['upperTrunk','middleTrunk','lowerTrunk'].every(name=>{const p=foe.segments.get(name);return !p||(p.velocity.lengthSquared()<=tuning.quiet*tuning.quiet&&p.spin.lengthSquared()<=tuning.spin*tuning.spin);});
  state.steady=quiet?state.steady+dt:0;
  let selected=state.mode==='near'?near:wide;
  const h=foe.segments.get('head')!.centre,p=foe.segments.get('lowerTrunk')?.centre??foe.centre;
  const axis=atan2(h.x-p.x,h.z-p.z),targets=['upperTrunk','middleTrunk'].map(n=>highestSurface(foe,n)),target=targets.reduce<typeof targets[number]>((best,t)=>t&&(!best||t[1]>best[1])?t:best,null);
  let nearHand:Hand|null=null,best=Infinity;
  if(target){const clear=sensedFootClearance(foe),c=view.stance.centre;for(const candidate of allowBoth?['right','left'] as const:[hand]){
   const side=candidate==='right'?1:-1,x=target[0]-side*tuning.outside*cos(axis)-tuning.ahead*sin(axis),z=target[2]+side*tuning.outside*sin(axis)-tuning.ahead*cos(axis);
   const dx=x-c.x,dz=z-c.z;
   if(![view.stance.soles.left,view.stance.soles.right].every(sole=>clear([sole.x,sole.y,sole.z],[sole.x+dx,sole.y,sole.z+dz],tuning.footRadius)))continue;
   const distance=dx*dx+dz*dz;if(distance<best){best=distance;nearHand=candidate;}
  }}
  const mode=state.steady>=tuning.steady&&nearHand?'near':'wide';
  if(mode==='near')hand=nearHand!;
  if(state.mode==='near'&&!quiet&&selected.state.stage!=='approach')selected.withdraw();
  if(mode!==state.mode&&(mode==='near'||!selected.state.active)&&selected.state.stage==='approach'&&report.support?.stage==='stand'&&!report.strike.hand&&view.stance.phase==='stand'){
   selected.reset();state.mode=mode;selected=state.mode==='near'?near:wide;
  }
  const intent=selected.decide(view,report,foe,hand,dt);state.phase=selected.state.phase;state.surface=selected.state.surface;return intent;
 }};
}
