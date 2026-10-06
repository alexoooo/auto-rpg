import { pathToFileURL } from 'node:url';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { coreStand } from '../tests/harness/core-stand.mjs';
import { modelSpec } from '../src/core/human/spec.ts';
import { createBody, SERVO_SECONDS } from '../src/core/body.ts';
import { DEFAULT_ENGINE } from '../src/core/engine/engines.ts';
import { GUARD_ACTION } from '../src/core/mind/intent.ts';
import { combatSkills } from '../src/core/skills/combat.ts';
import { ATTACK_PATH } from '../src/core/skills/attack-path.ts';
import { motionAtToRef } from '../src/core/control/support.ts';
import { pointOfToRef } from '../src/core/control/support.ts';
import { rigidPoints } from '../src/core/build/rigid.ts';
import { intoFrameToRef } from '../src/core/control/kinematics.ts';

/** Real, unpinned Warrior primitive: the policy supplies only a hand, target and family. */
export async function combatStrike({ hand = 'right', family = 'straight', mode = 'miss', tuning = {}, seconds = 12,
  ahead = .65, across = .15, up = 0 } = {}) {
 const s = await coreStand(modelSpec('workshop-fighter'), { engine: DEFAULT_ENGINE });
 const body = createBody(s.built, s.world, { servoSeconds: SERVO_SECONDS, handFeedback: true });
 const skills = combatSkills(body, {...ATTACK_PATH, ...tuning}), target = [across*(hand==='right'?1:-1), 1.63+up, ahead];
 const obstacle = mode==='hit' ? s.world.physics.addFixedBox([target[0],target[1],target[2]+.04], [.2,.2,.08]) : null;
 const velocity = new Vector3(), spin = new Vector3(), point = new Vector3(), local = new Vector3();
 const limb = s.built.segments.get(`hand.${hand}`), knuckles = rigidPoints(s.built.spec,limb.spec).get('knuckles').value;
 let witness;
 const before = s.world.beforeStep(() => {
  pointOfToRef(limb,knuckles,point); motionAtToRef(limb,point,velocity,spin);
  velocity.subtractInPlace(body.view.stance.velocity);
  const memory = body.state.mind.host.motor.hands[hand];
  intoFrameToRef(body.view.root,point.asArray(),local);
  witness = {phase:skills.report.strike.phase, closing:velocity.z, speed:velocity.length(), velocity:velocity.asArray(),
   pathError:memory.goal?Vector3.Distance(local,memory.point):null,
   saturated:body.muscles.activation.filter(a=>a>=.999).length, channels:body.muscles.channels.length};
 });
 const phases = [], contacts = [], errors = [], paths = [], saturation = [], peaks = []; let lastPhase=null, peak=0, fell=false, touched=false;
 body.drive((view,dt)=>{
  if(view.resumed) skills.resume(view);
  return skills.command(view, {move:null,face:0,hands:{left:GUARD_ACTION,right:GUARD_ACTION},
   combat:view.time>=2?{hand,target,family}:null},dt);
 });
 try {
  for(let step=0;step<seconds*s.world.hz;step++) {
   const report=skills.report.strike;
   s.step(); fell ||= body.down;
   const {phase,closing:preClosing,speed:preSpeed} = witness;
   if(report.phase!==lastPhase) {
    if(lastPhase==='swing') peaks.push(peak);
    if(report.phase==='swing'){ peak=0; touched=false; }
    phases.push({phase:report.phase,time:s.world.time}); lastPhase=report.phase;
   }
   if(phase==='swing'&&!touched){ peak=Math.max(peak,preClosing); }
   const contact=obstacle&&s.world.physics.contactsOf(s.built.segments.get(`hand.${hand}`).body).find(c=>c.fixed===obstacle.id&&c.impulse>0);
   if(contact&&phase==='swing'&&!touched) { contacts.push({time:s.world.time,closing:preClosing,speed:preSpeed,velocity:witness.velocity,impulse:contact.impulse}); touched=true; }
   if(phase==='swing'&&!touched) {
    errors.push(Vector3.Distance(point,new Vector3(...target)));
    paths.push(witness.pathError); saturation.push(witness.saturated/witness.channels);
   }
  }
  return {harness:{kind:'Node unpinned core stand',engine:DEFAULT_ENGINE,hz:s.world.hz,balance:0,model:'workshop-fighter',held:'empty'},
   hand,family,mode,tuning:{...ATTACK_PATH,...tuning},target,fell,phases,contacts,peaks,
   cycles:structuredClone(skills.report.strike.pointCycle),thrown:structuredClone(skills.report.strike.thrown),
   finalHand:body.view.fists[hand].position.asArray(),head:body.view.head.asArray(),support:body.view.stance.phase,
   meanTargetDistance:errors.length?errors.reduce((a,b)=>a+b,0)/errors.length:null,
   pathError:{mean:paths.length?paths.reduce((a,b)=>a+b,0)/paths.length:null,maximum:paths.length?Math.max(...paths):null},
   saturation:saturation.length?saturation.reduce((a,b)=>a+b,0)/saturation.length:null,
   assist:{force:body.assist.meter.force,moment:body.assist.meter.moment}};
 } finally {before.dispose();body.dispose();s.dispose();}
}
if(import.meta.url===pathToFileURL(process.argv[1]).href) {
 const config=process.argv[2]?JSON.parse(process.argv[2]):{};
 console.log(JSON.stringify(await combatStrike(config)));
}
