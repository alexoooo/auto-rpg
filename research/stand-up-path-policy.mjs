import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { turningToRef } from '../src/core/build/joint-state.ts';
import { phaseFeatures } from './stand-up-phase-features.mjs';

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

/** Reference muscle commands with measured joint-error feedback and bounded phase tracking. */
export function pathPolicy({ channels, reference, parameters }) {
  const p = { rate: 1, gain: 0, window: 0, poseWeight: 1, rootWeight: 1, release: reference.release,
    releaseHeight: 0, releaseUp: -1, ...parameters };
  const state = { phase: p.startPhase??0, started: null, previous: null, released: false };
  const correction = channels.map(()=>0), turning=[];
  const frames = reference.frames;
  const upOf = o => {
    const q = o.segments.find(s => s.name === 'lowerTrunk').rotation;
    const [x,y,z,w] = q, [a,b,c] = reference.rootUp;
    const tx = 2*(y*c-z*b), ty = 2*(z*a-x*c), tz = 2*(x*b-y*a);
    return [a+w*tx+y*tz-z*ty,b+w*ty+z*tx-x*tz,c+w*tz+x*ty-y*tx];
  };
  const policy = o => {
    if (state.released) return { kind: 'host' };
    state.started ??= o.time;
    const minimum=state.phase+(state.previous===null?0:(o.time-state.previous)*120*(p.minRate??0));
    const maximum=p.maxRate===undefined?Infinity:state.phase+(state.previous===null?0:(o.time-state.previous)*120*p.maxRate);
    if (state.previous !== null) state.phase += (o.time-state.previous)*120*p.rate;
    state.previous = o.time;
    const expected = clamp(Math.round(state.phase),0,frames.length-1), up = upOf(o);
    if (p.window > 0 && state.phase < p.release) {
      const features=p.localGravity?phaseFeatures(o):null;
      let best = Infinity, index = expected;
      const span = Math.round(p.window*120);
      for (let i = Math.max(0,expected-span); i <= Math.min(frames.length-1,expected+span); i++) {
        const f = frames[i];
        let error = 0;
        for (let j=0;j<channels.length;j++) error += (o.joints[j].angle-f.angles[j])**2/channels.length;
        const orientation=features?features.gravity:up,goal=features?f.gravity:f.up;
        error = p.poseWeight*error + p.rootWeight*orientation.reduce((sum,v,k)=>sum+(v-goal[k])**2,0)
          +(features?(p.phaseHeightWeight??0)*(features.height-f.height)**2
            +(p.phaseLoadWeight??0)*Object.entries(f.loads).reduce((sum,[name,v])=>sum+(v-(features.loads[name]??0))**2,0):0)
          + (p.phaseVelocityWeight??0)*o.joints.reduce((sum,j,k)=>sum+(j.speed-f.speeds[k])**2/channels.length,0)
          + .02*((i-expected)/Math.max(1,span))**2;
        if (error < best) { best = error; index = i; }
      }
      state.phase = Math.min(maximum,Math.max(minimum,index));
    }
    const index = clamp(Math.round(state.phase),0,frames.length-1), frame = frames[index];
    if (state.phase >= p.release && o.height >= p.releaseHeight && up[1] >= p.releaseUp) {
      state.released = true; return { kind:'host' };
    }
    if(frame.kind==='host')return {kind:'host'};
    for(let j=0;j<channels.length;j++)correction[j]=frame.angles[j]-o.joints[j].angle;
    if(reference.joints) {
      let start=0;
      for(const joint of reference.joints) {
        const n=joint.dofs.length,angles=o.joints.slice(start,start+n).map(j=>j.angle);
        turningToRef(joint,angles,turning);
        const errors=frame.angles.slice(start,start+n).map((a,j)=>a-angles[j]);
        for(let j=0;j<n;j++)correction[start+j]=turning[j].reduce((s,v,k)=>s+v*errors[k],0);
        start+=n;
      }
    }
    const activation=[...frame.activation];
    return { kind:'muscles', handPoses: {...frame.handPoses},
      velocity: frame.velocity.map((v,j) => {
        if(typeof v==='number')return v*(p.motionRate??1)+p.gain*correction[j]+(p.finiteDamping??0)*(frame.speeds[j]*(p.motionRate??1)-o.joints[j].speed);
        if(!(p.torqueGain>0))return v;
        const asked=(v==='+inf'?1:-1)*frame.activation[j]+p.torqueGain*correction[j]
          +(p.damping??0)*(frame.speeds[j]*(p.motionRate??1)-o.joints[j].speed);
        activation[j]=Math.min(1,Math.abs(asked));return asked>=0?'+inf':'-inf';
      }), activation };
  };
  policy.state = state;
  return policy;
}

/** The CLI-selected immutable reference and parameters are separate from the frozen evaluator. */
export function createPolicy({ channels }) {
  const configuration = JSON.parse(readFileSync(process.env.STAND_UP_PATH_CONFIG,'utf8'));
  const reference = JSON.parse(gunzipSync(readFileSync(configuration.reference)));
  return pathPolicy({ channels, reference, parameters: configuration.parameters });
}
