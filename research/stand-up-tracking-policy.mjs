import { wholeBodyTracking, trackingRejected } from '../src/core/control/whole-body.ts';
import { detachedDynamics } from './stand-up-detached-dynamics.mjs';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { atan2 } from '../src/core/math/real.ts';
import { turnAboutToRef } from '../src/core/math/turn.ts';

/** Bounded acceleration tracking on a detached prediction model; only muscle actions leave it. */
export function trackingPolicy({model,parameters:p={}}) {
  const detached=detachedDynamics(model),state={phase:'hold',rejected:0,tracking:null,liftedAt:null,
    centre:null,orientation:null,started:null,footStart:null,angles:null,stepTarget:null,stepOrientation:null,shift:null};
  const tracking=wholeBodyTracking(detached.built,detached.muscles,model.gravity,[],[],{
    capacity:4,effortCost:p.effortCost??.001,
    ...(p.jointStops?{jointStops:{dt:1/120,settings:{margin:.02,forceTolerance:1e-5,accelerationTolerance:.1,
      iterations:512,absoluteTolerance:1e-7,relativeTolerance:1e-6}}}:{}),
    contact:{physics:detached.physics,dt:1/120,settings:{maxPoints:64,gap:.005,minUpNormal:.9,pointSeparation:.002,
      ...(p.liftOff?{liftOff:{accelerationTolerance:.1},normalResponseSeconds:.2}:{}),
      forceTolerance:1e-5,redistributionCost:1e-6,iterations:512,absoluteTolerance:1e-7,relativeTolerance:1e-6}}});
  const policy=o=>{
    detached.read(o);state.centre??=[...o.centre];state.orientation??=[...o.segments.find(s=>s.name==='lowerTrunk').rotation];state.started??=o.time;
    state.angles??=p.holdAngles?o.joints.map(j=>j.angle):[...model.referenceAngles];
    const {centre,orientation,started,angles}=state;
    if(p.stepFoot&&!state.stepTarget) {
      const side=p.stepFoot.endsWith('left')?'left':'right',other=side==='left'?'right':'left';
      const at=name=>o.contacts.find(c=>c.segment===name&&c.fixed!==null&&c.impulse>0)?.point;
      const support=at('shank.'+other),knee=at('shank.'+side);
      if(!support||!knee)throw new Error('kneeling step needs two measured knee supports');
      const retained=o.contacts.filter(c=>c.fixed!==null&&c.impulse>0&&
        (c.segment==='shank.'+other||c.segment==='hand.'+other||(!p.releaseHand&&c.segment==='hand.'+side)));
      const middle=retained.reduce((sum,c)=>sum.map((v,i)=>v+c.point[i]/retained.length),[0,0,0]);
      state.shift=[middle[0]-centre[0],0,middle[2]-centre[2]];
      const relative=new Quaternion(...orientation).multiply(Quaternion.Inverse(new Quaternion(...model.rootRest)));
      const across=new Vector3(1,0,0).applyRotationQuaternionToRef(relative,new Vector3()),yaw=new Quaternion();
      turnAboutToRef(Vector3.UpReadOnly,atan2(-across.z,across.x),yaw);
      const forward=new Vector3(0,0,1).applyRotationQuaternionToRef(yaw,new Vector3());
      state.stepTarget=knee.map((v,i)=>i===1?(p.stepHeight??.025):v+forward.asArray()[i]*(p.stepForward??.25));
      state.stepOrientation=yaw.multiply(new Quaternion(...model.segments.find(s=>s.name===p.stepFoot).rest)).asArray();
    }
    const {shift,stepTarget,stepOrientation}=state;
    const progress=Math.max(0,Math.min(1,(o.time-started-(p.wait??.5))/(p.transition??1)));
    const blend=progress*progress*(3-2*progress),target=centre.map((v,i)=>v+blend*((shift??[p.shiftX??0,p.shiftY??0,p.shiftZ??0])[i]));
    const command={joints:model.channels.map((c,i)=>({channel:c.name,angle:angles[i],rate:0,acceleration:0,
      seconds:p.response??.3,weight:p.jointWeight??.2})),
      frames:[{id:'root',frame:{kind:'segment',name:'lowerTrunk'},at:[0,0,0],
        orientation:{target:orientation,velocity:[0,0,0],acceleration:[0,0,0],seconds:p.response??.3,weight:p.rootWeight??3}}],
      centres:[{id:'centre',frames:model.segments.map(s=>({kind:'segment',name:s.name})),
        translation:{target,velocity:[0,0,0],acceleration:[0,0,0],seconds:p.response??.3,weight:p.centreWeight??3}}],grips:[]};
    const moving=p.liftFoot??p.stepFoot;
    if(moving) {
      const foot=o.segments.find(s=>s.name===moving);state.footStart??=[...foot.centre];const {footStart}=state;
      const horizontalError=Math.sqrt((o.centre[0]-target[0])**2+(o.centre[2]-target[2])**2);
      if(state.liftedAt===null&&o.time-started>(p.liftAfter??2.5)&&horizontalError<.03)state.liftedAt=o.time;
      if(state.liftedAt!==null) {
        state.phase='lift';const freed=p.stepFoot?[moving,moving.replace('foot.','shank.'),moving.replace('foot.','thigh.'),
          ...(p.releaseHand?[moving.replace('foot.','hand.')]:[])]:[moving];
        command.supports=freed.map(name=>({frame:{kind:'segment',name},mode:'free'}));
        const local=detached.built.segments.get(moving).body.massProperties.centre;
        const u=Math.min(1,(o.time-state.liftedAt)/(p.stepSeconds??1));
        const target=stepTarget?footStart.map((v,i)=>v+(stepTarget[i]-v)*u+(i===1?4*u*(1-u)*(p.stepArc??.2):0))
          :footStart.map((v,i)=>v+(i===1?(p.liftHeight??.04):0));
        command.frames.push({id:'lift',frame:{kind:'segment',name:moving},at:local,
          translation:{target,velocity:[0,0,0],acceleration:[0,0,0],seconds:p.liftResponse??.3,weight:p.footWeight??3},
          ...(stepOrientation?{orientation:{target:stepOrientation,velocity:[0,0,0],acceleration:[0,0,0],seconds:.3,weight:p.footWeight??3}}:{})});
      }
    }
    const torque=tracking.track(command,p.supportBand??.002);state.tracking=tracking.report();
    const rejected=trackingRejected(tracking.state);if(rejected)state.rejected++;
    const activation=[],velocity=[];
    for(let i=0;i<torque.length;i++) {
      const t=rejected?0:torque[i],capacity=detached.muscles.strength(i,t>=0?1:-1);
      if(!Number.isFinite(t))throw new Error('nonfinite detached tracking torque');
      activation.push(capacity>0?Math.min(1,Math.abs(t)/capacity):0);velocity.push(t>0?'+inf':t<0?'-inf':0);
    }
    return {kind:'muscles',activation,velocity,handPoses:{left:'open',right:'open'}};
  };
  policy.state=state;return policy;
}
