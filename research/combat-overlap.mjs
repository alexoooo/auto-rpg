import {pathToFileURL} from 'node:url';
import {combinationStand} from '../tests/harness/combat-combination.mjs';

/** Measured overlapping fist cycles; closing speeds exclude startup, return and struck peaks. */
export async function combatOverlap({lead='right',mode='hit',seconds=10,tuning={}}={}){
 const s=await combinationStand({lead,mode,tuning});
 try{
  const contacts=[],phases=[];let overlapSteps=0,fell=false,last=null;
  for(let i=0;i<seconds*120;i++){
   s.step();fell ||= s.body.down;
   const state=s.skills.state,key=[state.hand,state.phase,state.returning?.hand].join('/');
   if(key!==last){phases.push({time:s.world.time,hand:state.hand,phase:state.phase,returning:state.returning?.hand??null});last=key;}
   if(state.returning&&state.command.effectors["hand.left"]&&state.command.effectors["hand.right"])overlapSteps++;
   const w=s.policy.witness;
   if(w.phase==='swing'&&s.obstacle){
    const contact=s.world.physics.contactsOf(s.built.segments.get(`hand.${w.hand}`).body).find(c=>c.fixed===s.obstacle.id&&c.impulse>0);
    if(contact)contacts.push({time:s.world.time,hand:w.hand,closing:w.closing,impulse:contact.impulse});
   }
  }
  return {harness:{kind:'Node unpinned core stand',engine:s.world.physics.name??'rapier-coordinate',hz:s.world.hz,
   model:'workshop-fighter',held:'empty',balance:0},lead,mode,seconds,tuning,fell,overlapSteps,phases,contacts,
   overlaps:structuredClone(s.policy.overlaps),pairs:s.policy.pairs,cycles:structuredClone(s.skills.report.strike.pointCycle),
   thrown:structuredClone(s.skills.report.strike.thrown),assist:{force:s.body.assist.meter.force,moment:s.body.assist.meter.moment}};
 }finally{s.dispose();}
}
if(import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(await combatOverlap(process.argv[2]?JSON.parse(process.argv[2]):{})));
