import { wholeBodyTracking, trackingRejected } from '../src/core/control/whole-body.ts';
import { detachedDynamics } from './stand-up-detached-dynamics.mjs';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { atan2 } from '../src/core/math/real.ts';
import { turnAboutToRef } from '../src/core/math/turn.ts';

/** Bounded acceleration tracking on a detached prediction model; only muscle actions leave it. */
export function trackingPolicy({model,parameters:p={}}) {
  const detached=detachedDynamics(model),state={phase:'hold',rejected:0,tracking:null,liftedAt:null,
    centre:null,orientation:null,started:null,footStart:null,angles:null,stepTarget:null,stepOrientation:null,shift:null,
    placedAt:null,placedCentre:null,yaw:null};
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
      const support=at('shank.'+other)??(p.riseOnly?o.segments.find(s=>s.name==='foot.'+other).centre:null);
      const knee=at('shank.'+side)??(p.riseOnly?o.segments.find(s=>s.name===p.stepFoot).centre:null);
      if(!support||!knee)throw new Error('kneeling step needs two measured knee supports');
      const retained=o.contacts.filter(c=>c.fixed!==null&&c.impulse>0&&
        (c.segment==='shank.'+other||c.segment==='hand.'+other||(!p.releaseHand&&c.segment==='hand.'+side)));
      const middle=retained.reduce((sum,c)=>sum.map((v,i)=>v+c.point[i]/retained.length),[0,0,0]);
      state.shift=[middle[0]-centre[0],0,middle[2]-centre[2]];
      const relative=new Quaternion(...orientation).multiply(Quaternion.Inverse(new Quaternion(...model.rootRest)));
      const across=new Vector3(1,0,0).applyRotationQuaternionToRef(relative,new Vector3()),yaw=new Quaternion();
      turnAboutToRef(Vector3.UpReadOnly,atan2(-across.z,across.x),yaw);
      state.yaw=yaw.asArray();
      const forward=new Vector3(0,0,1).applyRotationQuaternionToRef(yaw,new Vector3());
      const outside=new Vector3(side==='left'?-1:1,0,0).applyRotationQuaternionToRef(yaw,new Vector3());
      const restHeight=model.segments.find(s=>s.name===p.stepFoot).referenceCentre[1];
      state.stepTarget=knee.map((v,i)=>i===1?(p.stepHeight??(restHeight-(p.loadDepth??.001)))
        :v+forward.asArray()[i]*(p.stepForward??.25)+outside.asArray()[i]*(p.stepOut??0));
      state.stepOrientation=yaw.multiply(new Quaternion(...model.segments.find(s=>s.name===p.stepFoot).rest)).asArray();
      if(p.riseOnly) {
        state.stepTarget=[...o.segments.find(s=>s.name===p.stepFoot).centre];state.stepTarget[1]=restHeight-(p.loadDepth??.001);
        state.placedAt=o.time;state.placedCentre=[...o.centre];state.liftedAt=o.time;
      }
    }
    const {shift,stepTarget,stepOrientation}=state;
    const progress=Math.max(0,Math.min(1,(o.time-started-(p.wait??.5))/(p.transition??1)));
    const blend=progress*progress*(3-2*progress),target=centre.map((v,i)=>v+blend*((shift??[p.shiftX??0,p.shiftY??0,p.shiftZ??0])[i]));
    const supported=name=>{
      const foot=o.segments.find(s=>s.name===name),rest=model.segments.find(s=>s.name===name).rest;
      const relative=new Quaternion(...foot.rotation).multiply(Quaternion.Inverse(new Quaternion(...rest)));
      const up=new Vector3(0,1,0).applyRotationQuaternionToRef(relative,new Vector3());
      return up.y>.9&&o.contacts.some(c=>c.segment===name&&c.fixed!==null&&c.impulse>0);
    };
    if(p.stepFoot&&state.liftedAt!==null&&state.placedAt===null&&supported(p.stepFoot)) {
      state.placedAt=o.time;state.placedCentre=[...o.centre];
    }
    const extend=state.placedAt!==null&&p.extend;
    let rootTarget=orientation;
    if(state.placedAt!==null) {
      state.phase=extend?'extend':'place';
      const other=p.stepFoot.endsWith('left')?'right':'left';
      const retained=o.contacts.filter(c=>c.fixed!==null&&c.impulse>0&&(c.segment===p.stepFoot||c.segment==='shank.'+other));
      const middle=retained.reduce((sum,c)=>sum.map((v,i)=>v+c.point[i]/retained.length),[0,0,0]);
      if(retained.length)for(const i of [0,2])target[i]=middle[i];
      if(extend) {
        const u=Math.min(1,(o.time-state.placedAt)/(p.riseSeconds??1));
        target[1]=state.placedCentre[1]+(model.standing-state.placedCentre[1])*u;
        const bearing=supported('foot.'+other)?[p.stepFoot,'foot.'+other]:[p.stepFoot];
        for(const i of [0,2])target[i]=bearing.reduce((sum,name)=>sum+o.segments.find(s=>s.name===name).centre[i]/bearing.length,0);
        rootTarget=new Quaternion(...state.yaw).multiply(new Quaternion(...model.rootRest)).asArray();
      }
    }
    const command={joints:model.channels.map((c,i)=>({channel:c.name,angle:extend?model.referenceAngles[i]:angles[i],rate:0,acceleration:0,
      seconds:p.response??.3,weight:p.jointWeight??.2})),
      frames:[{id:'root',frame:{kind:'segment',name:'lowerTrunk'},at:[0,0,0],
        orientation:{target:rootTarget,velocity:[0,0,0],acceleration:[0,0,0],seconds:p.response??.3,weight:p.rootWeight??3}}],
      centres:[{id:'centre',frames:model.segments.map(s=>({kind:'segment',name:s.name})),
        translation:{target,velocity:[0,0,0],acceleration:[0,0,0],seconds:p.response??.3,weight:p.centreWeight??3}}],grips:[]};
    const moving=p.liftFoot??p.stepFoot;
    if(moving) {
      const foot=o.segments.find(s=>s.name===moving);state.footStart??=[...foot.centre];const {footStart}=state;
      const horizontalError=Math.sqrt((o.centre[0]-target[0])**2+(o.centre[2]-target[2])**2);
      if(state.liftedAt===null&&o.time-started>(p.liftAfter??2.5)&&horizontalError<(p.transferTolerance??.03))state.liftedAt=o.time;
      if(state.liftedAt!==null) {
        if(state.placedAt===null)state.phase='lift';const freed=p.stepFoot?[...(state.placedAt===null?[moving]:[]),moving.replace('foot.','shank.'),moving.replace('foot.','thigh.'),
          ...(p.releaseHand?[moving.replace('foot.','hand.')]:[])]:[moving];
        command.supports=freed.map(name=>({frame:{kind:'segment',name},mode:'free'}));
        const local=detached.built.segments.get(moving).body.massProperties.centre;
        const u=Math.min(1,(o.time-state.liftedAt)/(p.stepSeconds??1));
        // Rise-only control loads an existing support instead of swinging that foot through the air.
        const arc=p.riseOnly?0:(p.stepArc??.2);
        const target=stepTarget?footStart.map((v,i)=>v+(stepTarget[i]-v)*u+(i===1?4*u*(1-u)*arc:0))
          :footStart.map((v,i)=>v+(i===1?(p.liftHeight??.04):0));
        command.frames.push({id:'lift',frame:{kind:'segment',name:moving},at:local,
          translation:{target,velocity:[0,0,0],acceleration:[0,0,0],seconds:p.liftResponse??.3,weight:p.footWeight??3},
          ...(stepOrientation?{orientation:{target:stepOrientation,velocity:[0,0,0],acceleration:[0,0,0],seconds:.3,weight:p.footWeight??3}}:{})});
      }
    }
    if(extend) {
      const other=p.stepFoot.endsWith('left')?'foot.right':'foot.left',yaw=new Quaternion(...state.yaw);
      const a=model.segments.find(s=>s.name===p.stepFoot),b=model.segments.find(s=>s.name===other);
      const offset=new Vector3(b.referenceCentre[0]-a.referenceCentre[0],0,0).applyRotationQuaternionToRef(yaw,new Vector3());
      const target=state.stepTarget.map((v,i)=>v+offset.asArray()[i]);
      if(!p.retainRiseSupports)command.supports=model.segments.filter(s=>!s.name.startsWith('foot.')||(s.name===other&&!supported(other)))
        .map(s=>({frame:{kind:'segment',name:s.name},mode:'free'}));
      command.frames.push({id:'second-foot',frame:{kind:'segment',name:other},at:b.properties.centre,
        translation:{target,velocity:[0,0,0],acceleration:[0,0,0],seconds:.3,weight:p.footWeight??3},
        orientation:{target:yaw.multiply(new Quaternion(...b.rest)).asArray(),velocity:[0,0,0],acceleration:[0,0,0],seconds:.3,weight:p.footWeight??3}});
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
