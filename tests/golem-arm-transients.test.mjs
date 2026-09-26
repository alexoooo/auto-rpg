import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { createHeadlessArena } from './harness/golem-headless-arena.mjs';
import { Golem } from '../src/golem/golem.ts';
import { defaultGolemSetup } from '../src/golem/build.ts';
import { NEUTRAL } from '../src/mind.ts';
import { applyButtonPose } from '../src/bench/buttons.ts';
import { stepPair } from '../src/fighter.ts';
import { flatSupportedWorldRegistry } from '../src/supported-locomotion-production.ts';
import { CONFIG } from '../src/config.ts';

// The control step is the solver's substep at whatever rate it runs: a clock advanced by a literal
// 1/240 runs at half speed under 120 Hz physics, and every window below then reads the wrong seconds.
const SUBSTEP = 1 / CONFIG.world.physicsHz;

for (const hand of ['primary', 'secondary']) for (const frames of [[1000/60], [1000/30], [8,27,11,42,16]]) {
  test(`${hand} press/release and sweep stops settle at the tip (${frames})`, async () => {
    const arena = await createHeadlessArena(), { scene } = arena;
    const source = { state: structuredClone(NEUTRAL) }, world = flatSupportedWorldRegistry();
    source.state.actingHand = hand;
    // The script's feet and acting hand, and everything else at rest -- the composition the retired
    // puppet split gave this test, spelt out: the spare hand, the trunk and the head's buttons stay
    // neutral, so a press drives the one arm under measurement and not the head's lunge as well.
    const spare = hand === 'primary' ? 'secondary' : 'primary';
    const scripted = { name: 'scripted', decide: () => ({
      ...source.state, natural: NEUTRAL.natural, posture: NEUTRAL.posture, [spare]: NEUTRAL[spare],
    }) };
    const pair = ['left','right'].map((side,i) => new Golem(scene, {
      side, origin: new Vector3(0,0,i*8), facing:i*Math.PI, setup:defaultGolemSetup(),
      mind:scripted, controlPolicies:[], locomotionWorld:world,
    }));
    for (const g of pair) for (const {part} of g.limbs)
      scene.getPhysicsEngine().getPhysicsPlugin().setActivationControl(part.body,1);
    let clock=0, phase=-1, frame=0;
    const clouds = Array.from({length:6},()=>pair.map(()=>[]));
    const before=scene.onBeforePhysicsObservable.add(()=>{
      stepPair(...pair,SUBSTEP,clock); clock+=SUBSTEP;
    });
    const after=scene.onAfterPhysicsObservable.add(()=>{
      const age=clock-2-phase;
      if (phase<0 || phase>=6 || age<.35 || age>.95) return;
      pair.forEach((g,i)=>clouds[phase][i].push(g.strikers.find(s=>s.hand===hand).tipPosition().clone()));
    });
    try {
      let elapsed=0;
      while(elapsed<8) {
        phase=Math.floor(elapsed-2);
        const pose=phase===0 || phase===4 ? {thrust:true,guard:false}
          : phase===2 ? {thrust:false,guard:true} : {thrust:false,guard:false};
        applyButtonPose(source.state,hand,pose);
        // A real sweep with momentum, then a stop, not a teleported cursor.
        source.state[hand].pointerX=elapsed>=6 && elapsed<6.25 ? -.6+1.2*(elapsed-6)/.25 : elapsed>=6.25?.6:0;
        scene._renderId++;
        const ms=frames[frame++%frames.length]; scene._advancePhysicsEngineStep(ms);elapsed+=ms/1000;
      }
      let worst=0;
      for (let p=0;p<6;p++) for (const samples of clouds[p]) {
        // Sweep itself ends at phase 4 + .25: assess its remaining .25s settling separately.
        const points=p===4?samples.slice(Math.ceil(.25*CONFIG.world.physicsHz)):samples;
        // At least 0.3 s of the window, counted in seconds rather than samples so it means one thing at any rate.
        assert.ok(points.length>=.3*CONFIG.world.physicsHz,'the awake settling window must actually be sampled');
        const last=points.at(-1);
        let local=0; for (const point of points) local=Math.max(local,Vector3.Distance(point,last));
        worst=Math.max(worst,local);
      }
      console.log(`tip residual ${hand} ${frames}: ${(worst*1000).toFixed(3)} mm`);
      assert.ok(worst<.005,`tip still wanders ${(worst*1000).toFixed(3)} mm after 350ms`);
    } finally {
      scene.onBeforePhysicsObservable.remove(before);scene.onAfterPhysicsObservable.remove(after);
      pair.forEach(g=>g.dispose());arena.dispose();
    }
  });
}
