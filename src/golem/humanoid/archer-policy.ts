import type { CommandMind, Mind } from "../../mind.ts";
import { freshBodyCommand } from "../../body-command.ts";
import { freshIntent } from "../../action-primitives.ts";

const clamp = (n: number) => Math.max(-1, Math.min(1, n));
const wrap = (n: number) => Math.atan2(Math.sin(n), Math.cos(n));

/** Ranged decisions use the body's achieved readiness; no policy timer can manufacture a shot. */
export function humanoidArcher(): Mind & CommandMind {
  let previous: {x:number;y:number;z:number} | null = null;
  let blocked = 0;
  let retreating = false;
  let lastGround: {x:number;z:number} | null = null, stalled = 0;
  return {
    name: "humanoid-archer", obeysOrders: true,
    decide: () => freshIntent(),
    captureState: () => ({ previous, blocked, retreating, lastGround, stalled }),
    restoreState(s) { ({previous,blocked,retreating,lastGround,stalled}=s as never); },
    command(view, dt, orders) {
      const out = freshBodyCommand(), {self, opponent} = view;
      if (!self.ranged || self.ranged.phase === "disabled" || self.vitality <= 0) return out;
      const dx = opponent.ground.x-self.ground.x, dz = opponent.ground.z-self.ground.z;
      const distance = Math.hypot(dx,dz), bearing = Math.atan2(dx,dz);
      if (distance<3) retreating=true;
      if (distance>4.5) retreating=false;
      stalled=retreating && lastGround && Math.hypot(self.ground.x-lastGround.x,self.ground.z-lastGround.z)<dt*.08 ? stalled+dt : 0;
      lastGround={x:self.ground.x,z:self.ground.z};
      const target = {x:opponent.vitalPoint.x,y:opponent.vitalPoint.y,z:opponent.vitalPoint.z};
      const flight = distance / 48;
      if (previous && dt > 0) {
        target.x += clamp((opponent.vitalPoint.x-previous.x)/dt/4)*4*flight;
        target.z += clamp((opponent.vitalPoint.z-previous.z)/dt/4)*4*flight;
      }
      previous = {x:opponent.vitalPoint.x,y:opponent.vitalPoint.y,z:opponent.vitalPoint.z};
      target.y += 4.905*flight*flight;
      let mx = 0, mz = 0;
      const destination = orders?.destination ?? (typeof orders?.target === "object" && distance > 7 ? orders.target : null);
      if (destination) {
        const x=destination.x-self.ground.x,z=destination.z-self.ground.z,d=Math.hypot(x,z);
        if (d>.3) { mx=x/Math.max(1,d);mz=z/Math.max(1,d); }
      } else if (retreating || distance > 7) {
        const sign = retreating ? -1 : 1;
        mx=sign*Math.sin(bearing);mz=sign*Math.cos(bearing);
      }
      blocked = self.ranged.phase === "aim" || self.ranged.clear ? 0 : blocked+dt;
      if (!destination && (blocked>4 || stalled>.5)) { mx+=Math.cos(bearing)*.6;mz-=Math.sin(bearing)*.6; }
      const moving = Math.hypot(mx,mz)>.1;
      const desired = moving ? bearing : Math.atan2(target.x-self.ground.x,target.z-self.ground.z)+Math.PI/2;
      out.natural.lookYaw=moving?0:-1.4;
      out.gait.turn=clamp(wrap(desired-self.facing)*2);
      out.gait.forward=clamp(mx*Math.sin(self.facing)+mz*Math.cos(self.facing));
      out.gait.strafe=clamp(mx*Math.cos(self.facing)-mz*Math.sin(self.facing));
      const draw = !moving && opponent.vitality>0 && self.support === "supported" && Math.abs(wrap(desired-self.facing))<.15;
      out.effectors.primary.ranged={target,draw,release:draw && self.ranged.ready};
      return out;
    },
  };
}

