import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { atan2, hypot } from "../math/real.ts";
import { spinBetweenToRef, turnAboutToRef } from "../math/turn.ts";
import type { BodyObservation } from "../observation.ts";

interface Model {
  readonly rest: readonly [number, number, number, number];
  readonly rootHeight: number;
  readonly weight: number;
  readonly angles: readonly number[];
  readonly lateAngles?: readonly number[];
  readonly foldAngles?: readonly (number|null)[];
  readonly forceLimit: number;
}
interface Measurement {
  readonly observation: BodyObservation;
  readonly soleUp: readonly number[];
  readonly ready: boolean;
}
interface Settings {
  readonly lift?: number; readonly turn?: number; readonly damping?: number;
  readonly releaseSeconds?: number; readonly repositionAfter?: number; readonly repositionSeconds?: number; readonly postureAfter?: number; readonly settleHorizontal?: number; readonly height?: number; readonly settleAfter?: number; readonly settleHeight?: number; readonly horizontal?: number; readonly response?: number; readonly speed?: number;
  readonly contactCentre?: boolean; readonly stableRelease?: boolean; readonly yawLock?: boolean; readonly verticalPriority?: boolean; readonly supportedRelease?: boolean;
}

/** Metered recovery's root feedback and guard targets; support-gated release is an explicit controller setting. */
export function recoveryFeedback(model: Model, settings: Settings = {}) {
  // Gains use body weights, metres and seconds; the caller's Assist clips the requested wrench.
  const { lift = 1, turn = .12, damping = .055, height = 1, horizontal = 0,
    response = .15, speed = 6, settleAfter = Infinity, settleHeight = height, settleHorizontal = 0, postureAfter = Infinity, repositionAfter = Infinity, repositionSeconds = 1, releaseSeconds = 0, contactCentre = false, stableRelease = false, yawLock = true, verticalPriority = false, supportedRelease = false } = settings;
  const rest = new Quaternion(...model.rest), inverse = Quaternion.Inverse(rest);
  const q = new Quaternion(), yaw = new Quaternion(), target = new Quaternion(), error = new Vector3();
  const up = new Vector3(), across = new Vector3();
  const state = { heading: null as number | null, released: false, started: null as number | null, postureBlend: 0, repositionBlend: 0,
    releaseStarted:null as number|null,lastForce:[0,0,0],lastMoment:[0,0,0] };
  const angles = [...model.angles];
  const mayRelease = (ready:boolean,time:number):boolean => {
    const phase=(time-(state.started??time)-repositionAfter)/repositionSeconds;
    return ready && !(model.foldAngles && state.releaseStarted===null && phase>=0 && phase<1);
  };
  const canRelease = (ready:boolean,time:number):boolean => mayRelease(ready,time)
    && (releaseSeconds<=0 || (state.lastForce.every(v=>v===0) && state.lastMoment.every(v=>v===0))
      || (state.releaseStarted!==null && time-state.releaseStarted>=releaseSeconds));
  const control = (measurement: Measurement) => {
    if (state.released) return { kind: "host" } as const;
    const r = measurement.observation.segments.find(s => s.name === "lowerTrunk")!;
    q.set(...r.rotation).multiplyToRef(inverse, target);
    across.set(1,0,0).applyRotationQuaternionToRef(target, across);
    state.heading ??= atan2(-across.z, across.x);
    up.set(0,1,0).applyRotationQuaternionToRef(target, up);
    turnAboutToRef(Vector3.UpReadOnly, state.heading, yaw).multiplyToRef(rest, target);
    spinBetweenToRef(q,target,1,error);
    if (!yawLock) {
      const size = hypot(up.x,up.z), tilt = atan2(size,up.y);
      if (size > 1e-8) error.set(-up.z*tilt/size,0,up.x*tilt/size);
    }
    state.started ??= measurement.observation.time;
    // A supported release may lose a patch point briefly; only a sustained posture loss rearms help.
    if (stableRelease && state.releaseStarted!==null && measurement.observation.time-state.releaseStarted>1
      && (up.y<.9 || measurement.soleUp.some(v=>v<.9))) state.releaseStarted=null;
    // Lowering a late terminal target lets the loaded soles settle without restarting the recovery.
    const fraction = Math.max(0,Math.min(1,measurement.observation.time-state.started-settleAfter));
    const requestedHeight = height + fraction*(settleHeight-height);
    const unload = Math.max(0,Math.min(1,(requestedHeight*model.rootHeight-r.centre[1])/.25));
    const feet = measurement.observation.segments.filter(s => s.name.startsWith("foot."));
    const centre = [0,1,2].map(k => feet.reduce((sum,f) => sum+f.centre[k]!,0)/feet.length);
    const force = [model.weight*horizontal*(2*(centre[0]!-r.centre[0])-.5*r.velocity[0]),
      model.weight*Math.max(0,lift*unload-.3*r.velocity[1]),
      model.weight*horizontal*(2*(centre[2]!-r.centre[2])-.5*r.velocity[2])];
    if (verticalPriority) {
      force[1] = Math.min(model.forceLimit,force[1]!);
      const available = Math.sqrt(Math.max(0,model.forceLimit*model.forceLimit-force[1]*force[1]));
      const scale = Math.min(1,available/Math.max(1e-9,hypot(force[0]!,force[2]!)));
      force[0] = force[0]!*scale; force[2] = force[2]!*scale;
    }
    const moment = [error.x,error.y,error.z].map((v,i) => model.weight*(turn*v-damping*r.spin[i]!));
    if (settleHorizontal > 0 && measurement.observation.time-state.started > settleAfter
      && up.y > .9 && measurement.soleUp.every(v => v > .9)) {
      if (contactCentre) {
        const patch=measurement.observation.contacts.filter(c=>c.segment.startsWith("foot.") && c.fixed!==null && c.impulse>0)
          .flatMap(c=>(c.patch??[]).filter(p=>p.distance<=0 && Math.abs(p.normal[1])>=.9).map(p=>p.point));
        if (patch.length) for(let i=0;i<centre.length;i++) centre[i]=patch.reduce((sum,p)=>sum+p[i]!,0)/patch.length;
      }
      // Loaded feet need the whole body's centre over them; lifting can keep their edges unloaded.
      force[0] = model.weight*settleHorizontal*(2*(centre[0]!-measurement.observation.centre[0])-.5*r.velocity[0]);
      force[1] = 0;
      force[2] = model.weight*settleHorizontal*(2*(centre[2]!-measurement.observation.centre[2])-.5*r.velocity[2]);
    } else if (up.y > .98 && measurement.soleUp.every(v => v > .95) && unload < .05) {
      force.fill(0); moment.fill(0);
    }
    // A bounded alternate support target changes continuously through the same muscle limits.
    state.postureBlend = model.lateAngles ? Math.max(0,Math.min(1,measurement.observation.time-state.started-postureAfter)) : 0;
    for (let i=0;i<angles.length;i++) angles[i]=state.postureBlend===1 ? (model.lateAngles?.[i]??model.angles[i]!) : model.angles[i]!+state.postureBlend*((model.lateAngles?.[i]??model.angles[i]!)-model.angles[i]!);
    // One brief unloading pulse frees split or overlapping feet before the standing target resumes.
    const reposition = (measurement.observation.time-state.started-repositionAfter)/repositionSeconds;
    state.repositionBlend = model.foldAngles && !(stableRelease && state.releaseStarted!==null) && reposition >= 0 && reposition < 1
      ? reposition < .25 ? reposition/.25 : reposition < .65 ? 1 : (1-reposition)/.35 : 0;
    if (state.repositionBlend > 0) {
      for (let i=0;i<angles.length;i++) {
        const folded = model.foldAngles?.[i];
        if (folded !== null && folded !== undefined) angles[i]=state.repositionBlend===1 ? folded : angles[i]!+state.repositionBlend*(folded-angles[i]!);
      }
      for (let i=0;i<force.length;i++) force[i]=force[i]!*(1-state.repositionBlend)+(i===1?model.weight*state.repositionBlend:0);
    }
    const ready = supportedRelease ? measurement.ready : up.y > .95 && measurement.soleUp.every(v => v > .8) && r.centre[1] > .9*model.rootHeight;
    if (canRelease(ready,measurement.observation.time)) {
      state.released=true;return {kind:"host"} as const;
    }
    if (mayRelease(ready,measurement.observation.time) || (stableRelease && state.releaseStarted!==null)) {
      // Fade the last recovery wrench before returning ownership to ordinary locomotion.
      state.releaseStarted ??= measurement.observation.time;
      const remaining=Math.max(0,1-(measurement.observation.time-state.releaseStarted)/releaseSeconds);
      for(let i=0;i<force.length;i++){force[i]=state.lastForce[i]!*remaining;moment[i]=state.lastMoment[i]!*remaining;}
    } else {
      state.releaseStarted=null;
      for(let i=0;i<force.length;i++){state.lastForce[i]=force[i]!;state.lastMoment[i]=moment[i]!;}
    }
    return { kind: "targets", angles, response, speed, activation: 1, assist: { force, moment } } as const;
  };
  return Object.assign(control,{state,canRelease});
}
