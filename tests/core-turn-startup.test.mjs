/**
 * **The startup turn ceiling** (`locomotion`, `src/core/skills/locomotion.ts`): how fast the walk
 * may turn while it sets off, and what starts that clock again.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3,Quaternion} from '@babylonjs/core/Maths/math.vector.js';
import {locomotion,validTurnStartup} from '../src/core/skills/locomotion.ts';

const dt=1/120,startup={seconds:.6,limit:2};
const view={time:dt,born:0,standing:.9,root:{rotation:Quaternion.Identity()},stance:{phase:'stand',centre:new Vector3(0,.9,0),support:new Vector3(),velocity:new Vector3(),
 soles:{left:new Vector3(-.1,0,0),right:new Vector3(.1,0,0)}}};

test('startup turn scheduling bounds inputs, preserves the whole-walk ceiling and restarts after standing, placement and resume',()=>{
 assert.equal(validTurnStartup(),true);assert.equal(validTurnStartup(startup),true);
 for(const value of [null,{}, {seconds:0,limit:2},{seconds:NaN,limit:2},{seconds:1,limit:0},{seconds:1,limit:Infinity}]){
  assert.equal(validTurnStartup(value),false);assert.throws(()=>locomotion(null,4,value),/startup/);
 }
 const legs=locomotion(null,4,startup);let previous=0;
 for(let i=0;i<100;i++){
  const before=legs.state.walkTime;legs.goal(view,[.25,0],3,dt);
  assert.ok(Math.abs(legs.heading-previous)<= (before<startup.seconds?2:4)*dt+1e-12);previous=legs.heading;
 }
 assert.equal(legs.state.walkTime,startup.seconds);assert.ok(legs.heading>2);
 for(const reset of [()=>legs.goal(view,null,3,dt),()=>legs.goal(view,[0,0],3,dt),()=>legs.place(view,{left:[-.1,0],right:[.1,0]}),()=>legs.resume(view)]){
  reset();assert.equal(legs.state.walkTime,0);const before=legs.heading;
  legs.goal(view,[.25,0],3,dt);assert.ok(Math.abs(legs.heading-before)<=2*dt+1e-12);
  for(let i=0;i<100;i++)legs.goal(view,[.25,0],3,dt);
 }
 const tighter=locomotion(null,1,startup);tighter.goal(view,[.25,0],3,dt);assert.ok(tighter.heading<=dt+1e-12);
});
