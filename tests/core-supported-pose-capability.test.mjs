/**
 * **How the supported fold returns** (`supportedStrikeCommand`, `research/combat-strikes.mjs`),
 * measured on the Node core stand, Rapier, 120 Hz, and not a gate (`tests/experimental.json`): the
 * Warrior folded low, striking a point low in front from the fold's seventh second to its sixteenth,
 * stands again with its head over 1.6 m. That a fork of it plays the same is
 * `core-supported-pose.test.mjs`'s.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { supportedStrikeCommand } from '../research/combat-strikes.mjs';
import { createBody, SERVO_SECONDS } from '../src/core/body.ts';
import { modelSpec } from '../src/core/models.ts';
import { DEFAULT_ENGINE } from '../src/core/engine/engines.ts';
import { combatSkills } from '../src/core/skills/combat.ts';
import { NO_COVER } from '../src/core/mind/intent.ts';
import { coreStand } from './harness/core-stand.mjs';

const support=Object.freeze({lower:.5,pitch:.9,seconds:.5,transition:4,lumbar:.89,thoracic:.368,attackAt:7,riseAt:16});

test('the supported fold, striking low, returns the Warrior standing',async()=>{
 const stand=await coreStand(modelSpec('workshop-fighter'),{engine:DEFAULT_ENGINE});
 const body=createBody(stand.built,stand.world,{servoSeconds:SERVO_SECONDS,feedback:true}),skills=combatSkills(body);
 const strike={id:skills.instance(),action:'strike',effector:'hand.right',target:{kind:'point',at:[.2,.3,.15]}};
 body.drive((view,dt)=>supportedStrikeCommand(view,skills.command(view,{move:null,face:0,
  guard:NO_COVER,actions:view.time>=support.attackAt&&view.time<support.riseAt?[strike]:[]},dt),support));
 try {
  stand.step(2880);
  assert.ok(body.view.head.y>1.6,`its head is ${body.view.head.y} m up`);
 }finally{body.dispose();stand.dispose();}
});
