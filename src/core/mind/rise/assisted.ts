import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BodyView } from "../../body.ts";
import { centreOfToRef } from "../../control/support.ts";
import { recoveryFeedback } from "../../control/recovery-feedback.ts";
import { recoveryMeasurement } from "../../control/recovery-measurement.ts";
import { norm } from "../../math/real.ts";
import { observeBody } from "../../observation.ts";
import { ASSISTED_RECOVERY, assistedPosture, recoveryFoldAngles } from "../../control/recovery-posture.ts";
import { deepFreeze } from "../../state.ts";
import type { BodySpec } from "../../spec/body.ts";
import { commandable } from "../../body.ts";
import type { World } from "../../world.ts";
import type { OwnBody } from "../mind.ts";
import type { SubMind } from "../sub-mind.ts";
import { supportRecovery } from "./support-recovery.ts";

/** Recovery feedback gains, a twelve-second attempt ceiling and the measured one-body-weight allowance. */
const SETTINGS = deepFreeze({ ...ASSISTED_RECOVERY.settings,
  seconds: 12, requiredWeight: 1, ceilingTolerance: 1e-9 });

/** The two body families whose recovery posture and assistance are evaluated. */
export const assistedRiseFits = (spec: BodySpec): boolean => commandable(spec) && ["workshop-fighter","workshop-rogue"].includes(spec.model);

/** Root-assisted feedback with physical support release and the existing recovery as a bounded fallback. */
export function assistedRise(own: OwnBody, view: BodyView, world: World): SubMind {
  if (!assistedRiseFits(own.built.spec)) throw new Error("assisted rise has no posture for this body");
  const { built, muscles, assist } = own, root = built.segments.get("lowerTrunk")!;
  const fallback = supportRecovery(own,view,world), posture = assistedPosture(built.spec), latePosture = assistedPosture(built.spec,true);
  const channels = muscles.channels.map(c => ({min:c.dof.spec.min.value,max:c.dof.spec.max.value,name:c.name}));
  const weight = [...built.segments.values()].reduce((sum,s) => sum+s.rigid.mass,0)*norm(world.physics.gravity);
  const control = recoveryFeedback(deepFreeze({rest:[root.rest.x,root.rest.y,root.rest.z,root.rest.w] as [number,number,number,number],
    rootHeight:centreOfToRef(root,new Vector3()).y,weight,forceLimit:assist.most.force,
    angles:channels.map(c => Math.max(c.min,Math.min(c.max,posture[c.name]??0))),
    lateAngles:channels.map(c => Math.max(c.min,Math.min(c.max,latePosture[c.name]??0))),
    foldAngles:recoveryFoldAngles(channels,SETTINGS.repositionKnee)}),SETTINGS);
  const observe = observeBody(built,muscles,world,() => view.senses,undefined,() => view.down,true);
  const measure = recoveryMeasurement(built,observe), force = new Vector3(), moment = new Vector3();
  const state = {phase:"idle" as "idle" | "entry" | "assist" | "fallback",time:0,
    feedback:control.state,fallback:fallback.state,attempts:0};
  const permitted = () => assist.on && assist.most.force >= weight*(SETTINGS.requiredWeight-SETTINGS.ceilingTolerance);
  const release = () => assist.ask(force.setAll(0),moment.setAll(0));
  return {get name(){return `assisted rise: ${state.phase === "assist" && state.feedback.releaseStarted !== null ? "releasing" : state.phase === "assist" && state.feedback.repositionBlend > 0 ? "reposition feet" : state.phase === "assist" && state.feedback.postureBlend > 0 ? "settling" : state.phase}`;},state,
    wants(senses){
      if (state.phase === "idle") return fallback.wants(senses);
      if (state.phase === "fallback") return fallback.wants(senses);
      if (!permitted() || state.time >= SETTINGS.seconds) {
        release();fallback.begin();state.phase="fallback";return true;
      }
      if (state.phase === "assist" && control.canRelease(measure().ready,world.time)) {state.feedback.released=true;return false;}
      return true;
    },
    begin(){
      state.time=0;state.attempts++;state.feedback.heading=null;state.feedback.released=false;state.feedback.started=null;state.feedback.postureBlend=0;state.feedback.repositionBlend=0;state.feedback.releaseStarted=null;state.feedback.lastForce.fill(0);state.feedback.lastMoment.fill(0);
      fallback.begin();state.phase=permitted()?"entry":"fallback";
    },
    end(){release();fallback.end();state.phase="idle";},
    step(senses,dt){
      state.time+=dt;
      if (state.phase === "fallback") {fallback.step(senses,dt);return;}
      // A physical entry step uses the same recovery host that generates the training falls.
      if (state.phase === "entry") {fallback.step(senses,dt);state.phase="assist";return;}
      const command=control(measure());
      if (command.kind === "host") {release();muscles.velocity.fill(0);return;}
      muscles.activation.fill(command.activation);
      for(let i=0;i<channels.length;i++){
        const c=muscles.channels[i]!,start=i-c.index;let speed=0;
        for(let k=0;k<c.joint.dofs.length;k++) speed+=muscles.turning(i,k)
          *Math.max(-command.speed,Math.min(command.speed,(command.angles[start+k]!-muscles.angle(start+k))/command.response));
        muscles.velocity[i]=speed;
      }
      built.handPoses.request([{hand:"left",pose:"open"},{hand:"right",pose:"open"}]);
      assist.ask(force.set(command.assist.force[0]!,command.assist.force[1]!,command.assist.force[2]!),
        moment.set(command.assist.moment[0]!,command.assist.moment[1]!,command.assist.moment[2]!));
    }};
}
