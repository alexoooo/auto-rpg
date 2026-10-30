import { actionCycles } from "./action-cycles.mjs";
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import {turnAboutToRef,spinBetweenToRef} from '../src/core/math/turn.ts';
import '../tests/harness/preload-data.mjs';
import { buildBout } from '../src/evaluation/bout.ts';
import { combatContact, combatFingerprint } from './arena-combat.mjs';
import { BLADE_FIGHTER } from '../src/core/mind/config.ts';
import { PATHS } from '../tests/fixtures/minds.mjs';
import { COMBAT } from '../tests/fixtures/minds.mjs';
import { STAND_ORDERS } from '../src/core/intent/orders.ts';
import { loadEngine, DEFAULT_ENGINE } from '../src/core/engine/engines.ts';
import { motionAtToRef, centreOfToRef } from '../src/core/read-motion.ts';

/** An ordinary shove creates a low target in the actual Arena mind/skills/recovery path. */
export async function groundFight(options = {}) {
 const side=options.side??'left',other=side==='left'?'right':'left',seconds=options.seconds??45;
 const base=options.candidate??PATHS,candidate={...base,actions:base.actions.map(action=>({...action,effectors:options.hand&&options.hand!=='alternate'?['hand.'+options.hand]:action.effectors}))},recover=options.recover??true;
 const config={left:'workshop-fighter',right:'workshop-fighter',loadouts: { left: { left: "empty", right: 'empty' }, right: { left: "empty", right: 'empty' } },balance:{left:0,right:0},
  minds:{[side]:candidate,[other]:recover?COMBAT:BLADE_FIGHTER},gap:options.gap??.8,capSeconds:seconds,recoverySeconds:null};
 const fingerprint=combatFingerprint(),bout=await buildBout(config,{physicsEngine:await loadEngine(DEFAULT_ENGINE)});
 const a=bout.duel.duelists[side],b=bout.duel.duelists[other],skills=a.minded.skills,cycles=actionCycles(skills);
 bout.duel.order(side,STAND_ORDERS);bout.duel.order(other,STAND_ORDERS);
 const linear=new Vector3(),angular=new Vector3(),at=new Vector3();let witness=null,seen=0;
 const supportMotion=options.measureSupport?[]:null,targetTurn=new Quaternion(),pitchTurn=new Quaternion(),poseError=new Vector3(),rootSpin=new Vector3(),trunkSpin=new Vector3();
 const rows=[],summary={begun:null,contacts:0,driven:0,lowDriven:0,damage:0,attackerFell:false,trunkFloor:0,lowReady:0,opponentFell:false,opponentRecovered:false,returnedStanding:false};
 let attackedLow=false;
 const before=bout.world.beforeStep(()=>{
  if(supportMotion){
   const stance=skills.state.command.stance,pose=stance?.pose;
   turnAboutToRef(Vector3.UpReadOnly,stance?.heading??skills.report.heading,targetTurn);
   turnAboutToRef(Vector3.RightReadOnly,pose?.pitch??0,pitchTurn);targetTurn.multiplyInPlace(pitchTurn);
   spinBetweenToRef(a.body.view.root.rotation,targetTurn,1,poseError);
   a.body.muscles.dynamics.root.segment.body.angularVelocityToRef(rootSpin);a.built.segments.get('upperTrunk').body.angularVelocityToRef(trunkSpin);
   supportMotion.push({time:bout.duel.clock,stage:skills.report.support.stage,depth:skills.state.support.depth,phase:skills.report.engagement.phase,
    down:a.body.down,owner:a.body.has,comSpeed:a.body.view.stance.velocity.length(),facing:a.body.view.stance.facing,heading:skills.report.heading,
    rootError:poseError.length(),rootSpin:rootSpin.asArray(),trunkSpin:trunkSpin.asArray(),target:stance?{heading:stance.heading,pitch:pose?.pitch??0}:null});
  }
  const velocities={};for(const hand of ['left','right']){motionAtToRef(a.built.segments.get(`hand.${hand}`),a.body.view.fists[hand].position,linear,angular);linear.subtractInPlace(a.body.view.stance.velocity);velocities[hand]=linear.asArray();}
  const active=skills.report.actions.find(action=>action.effector.startsWith('hand.'));
  witness={phase:active?.stage??null,hand:active?.effector.slice(5)??null,down:a.body.down,foeLow:b.body.down,foeRecovering:b.body.has.startsWith('stand up:'),relativeVelocity:velocities};
 });
 try{
  for(let step=0;step<seconds*120&&!bout.duel.verdict;step++){
   if(step===3*120){const trunk=b.built.segments.get('upperTrunk');trunk.body.applyImpulse(new Vector3(options.axis==='x'?(options.impulse??90):0,0,options.axis==='x'?0:(options.impulse??90)),centreOfToRef(trunk,at));}
   if(step===4*120)bout.duel.order(side,null);
   bout.world.step();cycles.sample();const report=skills.report.support;
   if(report.stage==='lower'&&summary.begun===null)summary.begun=bout.duel.clock;
   summary.attackerFell ||= a.body.down;summary.opponentFell ||= b.body.down;
   if(summary.opponentFell&&!b.body.down&&b.body.has==='command')summary.opponentRecovered=true;
   summary.lowReady+=report.ready?1:0;
   if(['head','upperTrunk','middleTrunk','lowerTrunk'].some(n=>bout.world.physics.contactsOf(a.built.segments.get(n).body).some(c=>c.fixed!==null&&c.impulse>0&&c.normal[1]<-.9)))summary.trunkFloor++;
   for(;seen<bout.duel.blows.length;seen++){
    const blow=bout.duel.blows[seen];if(!blow.sides.some(p=>p.fighter===side&&p.segment.startsWith('hand.')))continue;
    summary.contacts++;const credit=combatContact(blow,side,witness);
    if(credit.driven){summary.driven++;summary.damage+=credit.outgoing;if(report.active&&(witness.foeLow||witness.foeRecovering)){summary.lowDriven++;attackedLow=true;}}
   }
   if(attackedLow&&report.stage==='stand'&&!skills.report.actions.length)summary.returnedStanding=true;
   if(step%120===119)rows.push({time:bout.duel.clock,head:a.body.view.head.asArray(),foeHead:b.body.view.head.asArray(),foeDown:b.body.down,foeOwner:b.body.has,
    support:structuredClone(report),phase:skills.report.engagement.phase,strike:skills.report.actions[0]?.stage??null,ground:structuredClone(skills.state.tactics.ground)});
  }
  summary.cycles=cycles.reading();summary.assist={force:a.body.assist.meter.force,moment:a.body.assist.meter.moment};
  if(combatFingerprint()!==fingerprint)console.warn('ground combat source changed during a physical trial: the results may mix two versions of the code');
  return {fingerprint,harness:{kind:'Node Arena Duel',engine:DEFAULT_ENGINE,hz:120},config,options,seconds:bout.duel.clock,summary,rows,...(supportMotion?{supportMotion}: {})};
 }finally{before.dispose();bout.dispose();}
}
