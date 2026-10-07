import { pathToFileURL } from 'node:url';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { contactMass } from '../src/core/build/contact-mass.ts';
import { coreStand } from '../tests/harness/core-stand.mjs';
import { modelSpec } from '../src/core/models.ts';
import { createBody, SERVO_SECONDS } from '../src/core/body.ts';
import { DEFAULT_ENGINE } from '../src/core/engine/engines.ts';
import {footStatesOf,readSupport} from '../src/core/control/support.ts';
import { NO_COVER } from '../src/core/mind/intent.ts';
import { combatSkills } from '../src/core/skills/combat.ts';
import { ATTACK_PATH } from '../src/core/skills/attack-path.ts';
import { STANCE_LOWER } from '../src/core/skills/locomotion.ts';
import { motionAtToRef } from '../src/core/control/support.ts';
import { pointOfToRef } from '../src/core/control/support.ts';
import { rigidPoints } from '../src/core/build/rigid.ts';
import { intoFrameToRef } from '../src/core/control/kinematics.ts';

/** Real, unpinned Warrior primitive: the policy supplies only a hand, target and family. */
export async function combatStrike({ hand = 'right', family = 'straight', mode = 'miss', tuning = {}, seconds = 12,
  ahead = .65, across = .15, up = 0, support = null, surface = 'front', direction, armExtension, measureMass = false } = {}) {
 const s = await coreStand(modelSpec('workshop-fighter'), { engine: DEFAULT_ENGINE });
 const body = createBody(s.built, s.world, { servoSeconds: SERVO_SECONDS, feedback: true });
 const sharedSupport = support?.shared === true;
 const skills = combatSkills(body, {...ATTACK_PATH, ...tuning}, null, undefined, sharedSupport), target = [across*(hand==='right'?1:-1), 1.63+up, ahead];
 if(!['front','top','bottom'].includes(surface))throw new Error('unknown stand surface');
 const obstacle = mode==='hit' ? surface!=='front' ? s.world.physics.addFixedBox([target[0],target[1]+(surface==='bottom'?.04:-.04),target[2]],[.2,.08,.2])
  : s.world.physics.addFixedBox([target[0],target[1],target[2]+.04], [.2,.2,.08]) : null;
 const masses = measureMass ? contactMass(s.built) : null;
 const velocity = new Vector3(), spin = new Vector3(), point = new Vector3(), local = new Vector3();
 const limb = s.built.segments.get(`hand.${hand}`), knuckles = rigidPoints(s.built.spec,limb.spec).get('knuckles').value;
 let witness;
 const before = s.world.beforeStep(() => {
  pointOfToRef(limb,knuckles,point); motionAtToRef(limb,point,velocity,spin);
  velocity.subtractInPlace(body.view.stance.velocity);
  const memory = body.state.mind.host.motor.effectors[`hand.${hand}`];
  intoFrameToRef(body.view.root,point.asArray(),local);
  witness = {phase:skills.report.strike.phase, closing:support&&!sharedSupport?Vector3.Dot(velocity,new Vector3(...target).subtract(point).normalize()):surface==='top'?-velocity.y:surface==='bottom'?velocity.y:velocity.z, speed:velocity.length(), velocity:velocity.asArray(),
   pathError:memory.goal?Vector3.Distance(local,memory.point):null,
   saturated:body.muscles.activation.filter(a=>a>=.999).length, channels:body.muscles.channels.length};
 });
 const supportPhases = []; let lastSupport = '';
 const phases = [], contacts = [], errors = [], paths = [], saturation = [], peaks = []; let lastPhase=null, peak=0, fell=false, touched=false, floorContacts=0;
 body.drive((view,dt)=>{
  if(view.resumed) skills.resume(view);
  const command=skills.command(view, {move:null,face:0,guard:NO_COVER,
   ...(sharedSupport?{lower:view.time>=2&&view.time<(support?.riseAt??Infinity)?support.lower:STANCE_LOWER}:{}),
   attack:view.time>=(support?.attackAt??2)&&view.time<(support?.riseAt??Infinity)?{kind:'blow',hand,target,path:{family,...(direction?{direction}:{}),...(armExtension===undefined?{}:{armExtension})}}:null},dt);
  return support&&!sharedSupport? supportedStrikeCommand(view,command,support):command;
 });
 try {
  for(let step=0;step<seconds*s.world.hz;step++) {
   const report=skills.report.strike;
   s.step(); fell ||= body.down;
   if(support&&['head','upperTrunk','middleTrunk','lowerTrunk'].some(n=>s.world.physics.contactsOf(s.built.segments.get(n).body).some(c=>c.fixed===s.floor.id&&c.impulse>0)))floorContacts++;
   if(sharedSupport){const status=skills.report.support,key=status.stage+':'+status.ready;if(key!==lastSupport){supportPhases.push({time:s.world.time,...structuredClone(status)});lastSupport=key;}}
   const {phase,closing:preClosing,speed:preSpeed} = witness;
   if(report.phase!==lastPhase) {
    if(lastPhase==='swing') peaks.push(peak);
    if(report.phase==='swing'){ peak=0; touched=false; }
    phases.push({phase:report.phase,time:s.world.time}); lastPhase=report.phase;
   }
   if(phase==='swing'&&!touched){ peak=Math.max(peak,preClosing); }
   const contact=obstacle&&s.world.physics.contactsOf(s.built.segments.get(`hand.${hand}`).body).find(c=>c.fixed===obstacle.id&&c.impulse>0);
   if(contact&&phase==='swing'&&!touched) {
    masses?.update();
    contacts.push({time:s.world.time,closing:preClosing,speed:preSpeed,velocity:witness.velocity,impulse:contact.impulse,
     ...(masses?{mass:masses.along(limb,contact.point,contact.normal)}:{})}); touched=true;
   }
   if(phase==='swing'&&!touched) {
    errors.push(Vector3.Distance(point,new Vector3(...target)));
    paths.push(witness.pathError); saturation.push(witness.saturated/witness.channels);
   }
  }
  const feet=footStatesOf(s.built); readSupport(feet,feet,new Vector3());
  return {...(sharedSupport?{supportConfig:support,supportState:structuredClone(skills.report.support),supportPhases}:{}),...(support?{support,floorContacts,feet:feet.map(f=>({side:f.side,corners:f.corners.map(p=>p.asArray())}))}:{}),harness:{kind:'Node unpinned core stand',engine:DEFAULT_ENGINE,hz:s.world.hz,balance:0,model:'workshop-fighter',held:'empty'},
   hand,family,mode,surface,...(direction?{direction}:{}),...(armExtension===undefined?{}:{armExtension}),tuning:{...ATTACK_PATH,...tuning},target,fell,phases,contacts,peaks,
   cycles:structuredClone(skills.report.strike.pointCycle),thrown:structuredClone(skills.report.strike.thrown),
   finalHand:body.view.fists[hand].position.asArray(),head:body.view.head.asArray(),support:body.view.stance.phase,
   meanTargetDistance:errors.length?errors.reduce((a,b)=>a+b,0)/errors.length:null,
   pathError:{mean:paths.length?paths.reduce((a,b)=>a+b,0)/paths.length:null,maximum:paths.length?Math.max(...paths):null},
   saturation:saturation.length?saturation.reduce((a,b)=>a+b,0)/saturation.length:null,
   assist:{force:body.assist.meter.force,moment:body.assist.meter.moment}};
 } finally {before.dispose();body.dispose();s.dispose();}
}
/** Research drive from an ordinary stand through a planted root fold, strikes and standing return. */
export function supportedStrikeCommand(view,command,support) {
 const u=Math.min(1,Math.max(0,view.time<support.riseAt?(view.time-2)/support.transition:1-(view.time-support.riseAt)/support.transition));
 const e=u*u*(3-2*u);
 return {...command,posture:{...command.posture,'lumbar flexion':support.lumbar*e,'thoracic flexion':support.thoracic*e},
  stance:{feet:['left','right'],centre:null,heading:0,...command.stance,height:1-support.lower*e,
   ...(view.time<2||view.time>=support.riseAt+support.transition?{}:{pose:{pitch:support.pitch*e,seconds:support.seconds}})}};
}
if(import.meta.url===pathToFileURL(process.argv[1]).href) {
 const config=process.argv[2]?JSON.parse(process.argv[2]):{};
 console.log(JSON.stringify(await combatStrike(config)));
}
