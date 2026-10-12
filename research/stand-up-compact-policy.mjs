const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

/** Four short posture movements, followed by measured support-gated ordinary-host release. */
export function compactPolicy({channels, reference, parameters:p}) {
  const state={started:null,phase:0,released:false,roll:null};
  const fields=['hip','knee','ankle','shoulder','elbow','wrist','lumbar','thoracic','abduction'];
  const base=[
    [2,2.4,-.7,1.2,1.8,-1,.4,.2,.35],
    [1.7,2,.35,1.8,.4,-1,.3,.2,.3],
    [1.7,2.2,.3,1,.4,-.4,-.15,.1,.3],
    [.2,.3,.1,.4,1,-.1,0,.05,.25],
  ];
  const names={hip:'hip.@ flexion',knee:'knee.@ flexion',ankle:'ankle.@ dorsiflexion',shoulder:'shoulder.@ flexion',
    elbow:'elbow.@ flexion',wrist:'wrist.@ flexion',lumbar:'lumbar flexion',thoracic:'thoracic flexion',abduction:'shoulder.@ abduction'};
  const poses=base.map((values,i)=> {
    const posture={'hip.left abduction':.1,'hip.right abduction':.1,'shoulder.left internal rotation':-.3,'shoulder.right internal rotation':-.3};
    fields.forEach((field,j)=>{for(const side of ['left','right'])posture[names[field].replace('@',side)]=p[`${field}${i}`]??values[j];});
    return channels.map(c=>clamp((posture[c.name]??0)-c.bind,c.min,c.max));
  });
  const durations=base.map((_,i)=>p[`seconds${i}`]??[.5,.75,.8,.8][i]);
  const rotateY=(rotation,axis)=> {
    const [x,y,z,w]=rotation,[a,b,c]=axis;
    const tx=2*(y*c-z*b),ty=2*(z*a-x*c),tz=2*(x*b-y*a);
    return b+w*ty+z*tx-x*tz;
  };
  const policy=o=> {
    if(state.released)return {kind:'host'};
    state.started??=o.time;let time=o.time-state.started,index=0;
    const root=o.segments.find(s=>s.name==='lowerTrunk');
    if(p.rollSeconds>0) {
      const wait=p.waitSeconds??0;
      if(time<wait)return {kind:'muscles',velocity:channels.map(()=>0),activation:channels.map(()=>0)};
      if(state.roll===null) {
        const front=rotateY(root.rotation,reference.rootFront),across=rotateY(root.rotation,reference.rootAcross);
        state.roll=front>.5?'back':front<-.5?'front':across<0?'right':'left';
      }
      time-=wait;
      if(state.roll!=='front') {
        if(time<p.rollSeconds) {
          const stages=reference.roll[state.roll],total=stages.reduce((s,r)=>s+r.seconds,0);
          let clock=time*total/p.rollSeconds,stage=0;
          while(stage<stages.length-1&&clock>=stages[stage].seconds)clock-=stages[stage++].seconds;
          state.phase=-stages.length+stage;
          return {kind:'targets',angles:channels.map(c=>clamp((stages[stage].posture[c.name]??0)-c.bind,c.min,c.max)),
            response:p.rollResponse??.08,speed:p.speed??8,activation:1};
        }
        time-=p.rollSeconds;
      }
    }
    while(index<3&&time>=durations[index])time-=durations[index++];
    state.phase=index;
    const [x,y,z,w]=root.rotation,[a,b,c]=reference.rootUp;
    const tx=2*(y*c-z*b),ty=2*(z*a-x*c),tz=2*(x*b-y*a),up=b+w*ty+z*tx-x*tz;
    const feet=['foot.left','foot.right'].map(n=>o.contacts.some(c=>c.segment===n&&c.fixed!==null&&c.impulse>0));
    if(index===3&&o.height>=(p.releaseHeight??.65)&&up>=(p.releaseUp??.7)&&feet.every(Boolean)) {
      state.released=true;return {kind:'host'};
    }
    return {kind:'targets',angles:poses[index],response:p.response??.12,speed:p.speed??8,activation:1};
  };
  policy.state=state;return policy;
}
