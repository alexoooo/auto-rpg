import type { BodyView } from "../body.ts";
import { cos, hypot, sin } from "../math/real.ts";
import { STANCE_LOWER } from "../skills/locomotion.ts";
import type { SkillReport } from "../skills/skills.ts";
import type { Side, BodySpec } from "../spec/body.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { GUARD_ACTION, type CombatAction, type Intent } from "./intent.ts";
import { upperSurface } from "./openings.ts";
import { groundRoute } from "./ground-route.ts";
import { clearFootTranslation, lowOpponent, sensedFootClearance } from "./sensed-bounds.ts";
import type { BodySense } from "./senses.ts";
import { lyingAxis } from "./targets.ts";

/** Physical approach probes and finite transitions: `docs/reference/ground-combat.md#policy-settings`. */
const GROUND_COMBAT = Object.freeze({ across: .1, ahead: .65,
  near: .1, settle: .12, speed: .18, braking: .5, quiet: .1, refresh: .5, lower: .5,
  targetShift: .2, reach: .8, attack: 8, acquisition: 5, approach: 30, retry: 1, footRadius: .12, lookahead: 1, orientations: 8 });

/** Side approach, supported lowering, refreshed strokes and standing return behind the neutral intent. */
export function groundWide(spec: BodySpec, clearMove: (view: BodyView, heading: number, move: readonly [number, number] | null) => readonly [number, number] | null) {

  const left=spec.segments.find(s=>s.name==="foot.left")!,right=spec.segments.find(s=>s.name==="foot.right")!;
  const width=Math.abs(left.centreOfMass.value[0]-right.centreOfMass.value[0])/2;
  const state = { phase: "guard", stage: "approach" as "approach" | "lower" | "attack" | "rise",
    active: false, hand: null as Side | null, foe: null as string | null, face: 0, target: null as Vec3 | null, surface: null as string | null,
    action: null as CombatAction | null, route: null as readonly Vec3[] | null, walk: null as readonly [number,number] | null, stride: -1, planned: false, next: 0, elapsed: 0, retry: 0, lowTime: 0 };
  const reset = () => { state.active = false; state.hand = null; state.stage = "approach"; state.foe = null; state.target = null;
    state.route = null; state.walk = null; state.stride = -1; state.planned = false; state.action = null; state.next = 0; state.elapsed = 0; state.lowTime = 0; state.retry = 0; state.phase = "guard"; };
  const hands = { left: GUARD_ACTION, right: GUARD_ACTION };
  return { state, reset, withdraw(){state.stage='rise';}, decide(view: BodyView, report: SkillReport, foe: BodySense, hand: Side, dt: number): Intent | null {
    state.retry = Math.max(0, state.retry - dt);
    const low = lowOpponent(view, foe), supported = report.support;
    if (!supported) return null;
    if (!state.active) {
      if (!low || report.strike.hand || supported.stage !== "stand") return null;
      if (state.retry > 0) return { move: null, face: report.heading, hands, combat: null };
      state.active = true; state.hand = hand; state.foe = foe.id; state.stage = "approach"; state.elapsed = 0; state.next = 0;
    }
    hand = state.hand!;
    state.elapsed += dt;
    if (!low || state.foe !== foe.id || view.down) state.stage = "rise";
    if (state.stage === "approach" && state.elapsed >= GROUND_COMBAT.approach) state.stage = "rise";
    if (state.stage === "lower" || state.stage === "attack") {
      state.lowTime += dt;
      if ((state.stage === "lower" && state.lowTime >= GROUND_COMBAT.acquisition)
        || state.lowTime >= GROUND_COMBAT.acquisition + GROUND_COMBAT.attack) state.stage = "rise";
    }
    if (state.stage === "rise") {
      state.phase = "low-return"; state.action = null;
      if (!report.strike.hand && supported.stage === "stand") { reset(); state.retry = GROUND_COMBAT.retry; }
      return { move: null, face: state.face, hands, lower: STANCE_LOWER, combat: null };
    }
    if (view.time >= state.next && !report.strike.hand) {
      const candidates=foe.spec.marks.middle.map(segment=>({segment,target:upperSurface(foe,segment,[view.stance.centre.x,view.stance.centre.y,view.stance.centre.z])})).filter(o=>o.target!==null);
      const opening=candidates.reduce<typeof candidates[number]|null>((best,o)=>!best||o.target![1]>best.target![1]?o:best,null);
      if (!opening) { state.stage = "rise"; return { move: null, face: state.face, hands, combat: null }; }
      if (state.stage !== "approach" && state.target && hypot(opening.target![0] - state.target[0], opening.target![2] - state.target[2]) > GROUND_COMBAT.targetShift) {
        state.stage = "rise"; state.action = null;
        return { move: null, face: state.face, hands, combat: null };
      }
      const previousTarget = state.target;
      state.target = opening.target!; state.surface = opening.segment; state.next = view.time + GROUND_COMBAT.refresh;
      if (state.stage === "approach") {
        const axis = lyingAxis(foe), clear = sensedFootClearance(foe), c = view.stance.centre;
        
        let best = Infinity, chosen: number | null = null;
        for(let n=0;n<GROUND_COMBAT.orientations;n++) {
          const face=state.planned&&n===0?state.face:axis+n*2*Math.PI/GROUND_COMBAT.orientations,side=hand==="right"?1:-1;
          const fx=sin(face),fz=cos(face),rx=cos(face),rz=-sin(face);
          const x=opening.target![0]-side*GROUND_COMBAT.across*rx-GROUND_COMBAT.ahead*fx;
          const z=opening.target![2]-side*GROUND_COMBAT.across*rz-GROUND_COMBAT.ahead*fz;
          if(![-1,1].every(s=>{const foot:Vec3=[x+s*width*rx,view.stance.support.y,z+s*width*rz];return clear(foot,foot,GROUND_COMBAT.footRadius);}))continue;
          const route=groundRoute(foe,[c.x,view.stance.support.y,c.z],[x,view.stance.support.y,z],GROUND_COMBAT.footRadius);
          if(!route)continue;
          let score=0,at:Vec3=[c.x,view.stance.support.y,c.z];
          for(const point of route){score+=hypot(point[0]-at[0],point[2]-at[2]);at=point;}

          if(score<best){best=score;chosen=face;state.route=route;}
          if(state.planned&&n===0&&chosen!==null&&previousTarget&&hypot(opening.target![0]-previousTarget[0],opening.target![2]-previousTarget[2])<GROUND_COMBAT.targetShift)break;
        }
        if(chosen!==null){state.face=chosen;state.planned=true;}
        else { state.planned=false;state.phase="low-wait";return {move:null,face:report.heading,hands,combat:null}; }

      }
    }
    if (!state.target || !state.planned) return { move: null, face: state.face, hands, combat: null };
    const target = state.target, f = [sin(state.face), cos(state.face)], r = [cos(state.face), -sin(state.face)], c = view.stance.centre;
    const desired = [target[0] - (hand==="right"?1:-1)*GROUND_COMBAT.across * r[0]! - GROUND_COMBAT.ahead * f[0]!,
      target[2] - (hand==="right"?1:-1)*GROUND_COMBAT.across * r[1]! - GROUND_COMBAT.ahead * f[1]!];
    if (state.stage === "approach") {
      while(state.route&&state.route.length>1&&hypot(state.route[0]![0]-c.x,state.route[0]![2]-c.z)<GROUND_COMBAT.near)state.route=state.route.slice(1);
      const waypoint=state.route?.[0]??[desired[0]!,view.stance.support.y,desired[1]!];
      const dx = waypoint[0]! - c.x, dz = waypoint[2]! - c.z, far = hypot(dx, dz);
      const clip = (v: number) => Math.max(-GROUND_COMBAT.speed, Math.min(GROUND_COMBAT.speed, v / GROUND_COMBAT.braking));
      let move: readonly [number,number] | null = null;
      if (far >= GROUND_COMBAT.near && (!state.walk || state.stride !== view.stance.strides)) {
        const asked = [clip(dx * sin(report.heading) + dz * cos(report.heading)), clip(dx * cos(report.heading) - dz * sin(report.heading))] as const;
        const h = report.heading;
        for (const candidate of [asked, [asked[0], 0], [0, asked[1]], [0, -GROUND_COMBAT.speed], [0, GROUND_COMBAT.speed], [GROUND_COMBAT.speed, 0], [-GROUND_COMBAT.speed, 0]] as const) {
          if(candidate[0]===0&&candidate[1]===0)continue;
          const wx = (candidate[0] * sin(h) + candidate[1] * cos(h)) * GROUND_COMBAT.lookahead;
          const wz = (candidate[0] * cos(h) - candidate[1] * sin(h)) * GROUND_COMBAT.lookahead;
          if (!view.stance.soles.left || !view.stance.soles.right) continue;
          if (clearFootTranslation(view, foe, wx, wz, GROUND_COMBAT.footRadius)) {
            move = clearMove(view, h, candidate); if (move) break;
          }
        }
      }
      if(far<GROUND_COMBAT.near){state.walk=null;}
      else if(state.stride!==view.stance.strides||!state.walk) {
        state.stride=view.stance.strides;
        state.walk=move?[move[0]*sin(report.heading)+move[1]*cos(report.heading),move[0]*cos(report.heading)-move[1]*sin(report.heading)]:null;
      }
      if(state.walk)move=[state.walk[0]*sin(report.heading)+state.walk[1]*cos(report.heading),state.walk[0]*cos(report.heading)-state.walk[1]*sin(report.heading)];
      if (far < GROUND_COMBAT.settle && view.stance.velocity.lengthSquared() < GROUND_COMBAT.quiet * GROUND_COMBAT.quiet && view.stance.phase === "stand") {
        state.stage = "lower"; state.lowTime = 0;
      }
      state.phase = "low-approach";
      return { move, face: state.face, hands, combat: null };
    }
    if (hypot(target[0] - c.x, target[2] - c.z) > GROUND_COMBAT.reach) {
      state.stage = "rise"; state.action = null;
      return { move: null, face: state.face, hands, combat: null };
    }
    if (supported.ready) state.stage = "attack";
    if (!report.strike.hand) state.action = state.stage === "attack" ? { hand, target, family: "downward", armExtension: 0 } : null;
    state.phase = state.stage === "attack" ? report.strike.phase ?? "low-attack" : "low-prepare";
    return { move: null, face: state.face, hands, lower: GROUND_COMBAT.lower, combat: state.action };
  } };
}
