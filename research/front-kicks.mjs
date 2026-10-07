import {pathToFileURL} from 'node:url';
import {writeFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {Vector3} from '@babylonjs/core/Maths/math.vector.js';
import {coreStand} from '../tests/harness/core-stand.mjs';
import {modelSpec} from '../src/core/human/spec.ts';
import {createBody,SERVO_SECONDS} from '../src/core/body.ts';
import {DEFAULT_ENGINE} from '../src/core/engine/engines.ts';
import {combatSkills} from '../src/core/skills/combat.ts';
import {KICK_PATH} from '../src/core/skills/kick.ts';
import {GUARD_ACTION} from '../src/core/mind/intent.ts';
import {pointOfToRef,motionAtToRef} from '../src/core/control/support.ts';
import {supportRecovery} from '../src/core/mind/rise/support-recovery.ts';
import {coarseForces} from './punch-calibration.mjs';
import {punchPad} from './punch-pad.mjs';
import {combatFingerprint} from './arena-combat.mjs';

/** Ordinary shared skills, physical unloading, native contacts and independent pad momentum. */
export async function frontKickStand({foot='right',hz=120,seconds=24,height=.45,ahead=.45,
  mode='hit',cancelAt=Infinity,tuning={},pad={},recovery=false}={}) {
  if(!['left','right'].includes(foot)||!['hit','miss','block'].includes(mode)
    ||![120,480,960,1920].includes(hz)||![seconds,height,ahead].every(Number.isFinite)
    ||seconds<=2||ahead<=0||!(cancelAt>=2))throw new Error('invalid front kick calibration');
  const config={foot,hz,seconds,height,ahead,mode,cancelAt:Number.isFinite(cancelAt)?cancelAt:null,tuning,pad,recovery};
  const s=await coreStand(modelSpec('workshop-fighter'),{engine:DEFAULT_ENGINE,hz});
  let sensor;
  const identity={kind:'object',id:mode==='block'?'block-pad':'kick-pad'};
  const body=createBody(s.built,s.world,{servoSeconds:SERVO_SECONDS,handFeedback:true,
    contactIdentity:other=>other===sensor?.body?identity:other?null:{kind:'world'},
    effectorContacts:segment=>(sensor?.state.materialContacts??[]).filter(c=>c.segment===segment)
      .map(c=>({target:identity,point:c.point,normal:[0,0,1],impulse:c.force*s.world.dt})),
    ...(recovery?{subs:[(own,view)=>supportRecovery(own,view,s.world)]}:{})});
  const skills=combatSkills(body,undefined,null,undefined,false,undefined,undefined,false,undefined,{...KICK_PATH,...tuning});
  const target=[foot==='right'?.1:-.1,height,ahead];
  sensor=punchPad(s.world,[target[0]+(mode==='miss'?1:0),height,ahead],{face:'compliant',size:[.2,.08,.11],...pad});
  body.drive((view,dt)=>{
    if(view.resumed)skills.resume(view);
    return skills.command(view,{move:null,face:0,hands:{left:GUARD_ACTION,right:GUARD_ACTION},
      combat:null,kick:view.time>=2&&view.time<cancelAt?{foot,target,targetId:'kick-pad'}:null},dt);
  },view=>skills.resume(view));
  const limb=s.built.segments.get(`foot.${foot}`),point=new Vector3(),velocity=new Vector3(),spin=new Vector3();
  const names=new Map([...s.built.segments.values()].map(p=>[p.body,p.spec.name]));
  const state={phases:[],samples:[],impacts:[],active:null,last:'',previousPhase:null,launch:0,seen:0,
    fell:false,floorContacts:0,drivenPeak:0,witness:null,unloadedLaunches:0,loadedLaunches:0};
  const before=s.world.beforeStep(()=>{
    const kick=skills.report.kick,phase=kick.phase,key=`${kick.stage}:${phase}`;
    pointOfToRef(limb,limb.spec.points.strike.value,point);motionAtToRef(limb,point,velocity,spin);
    if(key!==state.last){state.phases.push({time:s.world.time,stage:kick.stage,phase,
      point:point.asArray(),centre:body.view.stance.centre.asArray(),support:structuredClone(skills.state.kick.support)});state.last=key;}
    if(phase==='swing'&&state.previousPhase!=='swing'){
      state.launch++;
      if(skills.state.kick.support.loads[foot]===0)state.unloadedLaunches++;else state.loadedLaunches++;
    }
    state.previousPhase=phase;
    state.witness={time:s.world.time,phase,launch:state.launch,point:point.asArray(),velocity:velocity.asArray(),
      speed:velocity.length(),down:body.down,torques:Array.from(body.muscles.pulled),
      bounds:{positive:Array.from(body.muscles.bounds.positive),negative:Array.from(body.muscles.bounds.negative)}};
    sensor.prepare();for(const segment of s.built.segments.values())sensor.load(segment);
  });
  const after=s.world.afterStep(()=>{
    const reading=sensor.read(),contacts=[...new Set([...reading.contacts.map(c=>names.get(c.other)??'other'),
      ...reading.materialContacts.map(c=>c.segment)])];
    const sample={...reading,contacts,phase:state.witness.phase,launch:state.launch};state.samples.push(sample);
    state.fell ||= body.down;
    if(['head','upperTrunk','middleTrunk','lowerTrunk'].some(n=>s.world.physics.contactsOf(s.built.segments.get(n).body)
      .some(c=>c.fixed===s.floor.id&&c.impulse>0)))state.floorContacts++;
    if(state.active&&(state.launch!==state.active.launch||s.world.time-state.active.lastPush>.025)){
      state.impacts.push(state.active);state.active=null;
    }
    const pushed=reading.impulse>sensor.config.quietImpulse;
    if(pushed&&!state.active&&state.witness.phase==='swing'&&state.launch!==state.seen){
      state.active={launch:state.launch,time:s.world.time,lastPush:s.world.time,impulse:0,peakStepForce:0,
        preImpact:structuredClone(state.witness),samples:[],contacts:[],truncated:false};state.seen=state.launch;
    }
    if(state.active){
      state.active.samples.push(sample);state.active.impulse+=reading.impulse;
      state.active.peakStepForce=Math.max(state.active.peakStepForce,reading.force);
      if(pushed)state.active.lastPush=s.world.time;
      for(const name of contacts)if(!state.active.contacts.includes(name))state.active.contacts.push(name);
    }else if(state.witness.phase==='swing'&&!pushed&&state.seen!==state.launch)
      state.drivenPeak=Math.max(state.drivenPeak,state.witness.speed);
  });
  return {...s,body,skills,sensor,state,config,target,reading(){
    const impacts=[...state.impacts,...(state.active?[{...state.active,truncated:true}]:[])].map(e=>({...structuredClone(e),
      eligible:!e.truncated&&!e.preImpact.down&&e.contacts.length>0&&e.contacts.every(n=>n===`foot.${foot}`),
      waveform120:coarseForces(e.samples,hz,120)}));
    const faults=[];
    if(state.fell)faults.push('fall');if(state.floorContacts)faults.push('trunk-floor contact');
    if(skills.report.kick.failed)faults.push('failed cycle');
    if(state.loadedLaunches)faults.push('loaded launch');
    if(skills.report.kick.returned[foot]<3)faults.push('fewer than three verified returns');
    if(mode==='hit'&&impacts.filter(e=>e.eligible).length<3)faults.push('fewer than three clean impacts');
    if(mode==='miss'&&impacts.length)faults.push('miss contacted apparatus');
    if(body.assist.meter.force||body.assist.meter.moment)faults.push('assistance');
    if(state.samples.some(s=>s.displacement>sensor.config.size[2]||s.materialContacts.some(c=>c.penetration>sensor.config.size[2])))faults.push('pad stroke exceeded');
    return {config,harness:{kind:'Node unpinned core stand',engine:DEFAULT_ENGINE,revision:s.world.physics.revision,
      hz,model:'workshop-fighter',held:'empty',balance:0,actuation:s.world.actuation},target,
      apparatus:{...sensor.config,damping:sensor.damping,normal:[0,0,1]},report:structuredClone({...skills.report.kick}),
      cycle:structuredClone(skills.state.kick),fell:state.fell,floorContacts:state.floorContacts,
      drivenPeak:state.drivenPeak,unloadedLaunches:state.unloadedLaunches,loadedLaunches:state.loadedLaunches,
      impacts,phases:structuredClone(state.phases),samples:structuredClone(state.samples),
      assist:{force:body.assist.meter.force,moment:body.assist.meter.moment},head:body.view.head.asArray(),
      qualification:{accepted:faults.length===0,faults}};
  },dispose(){before.dispose();after.dispose();sensor.dispose();body.dispose();s.dispose();}};
}

export async function frontKickCalibration(config={}){
  const s=await frontKickStand(config);try{s.step(s.seconds(config.seconds??24));return s.reading();}finally{s.dispose();}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const search=process.argv[2]==='--search',fingerprint=combatFingerprint(),rows=[];
  const cells=search?[{},{swingSeconds:.35,contactSpeed:2.5},{swingSeconds:.3,contactSpeed:3}]:[{}];
  for(const tuning of cells)for(const foot of ['left','right'])for(const mode of ['hit','miss','block']){
    const r=await frontKickCalibration({foot,mode,tuning});rows.push(r);
    process.stderr.write(`${JSON.stringify(tuning)} ${foot}/${mode}: ${JSON.stringify(r.qualification)}\n`);
  }
  if(combatFingerprint()!==fingerprint)throw new Error('source changed during kick qualification');
  writeFileSync((search?process.argv[3]:process.argv[2])??`docs/reference/front-kicks${search?'-search':''}.json.gz`,gzipSync(JSON.stringify({fingerprint,rows})));
}
