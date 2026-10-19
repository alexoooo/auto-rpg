/**
 * **How the approach learns its range** (`actionTactics`, `src/core/mind/action-tactics.ts`): which
 * ledger records shorten its spacing, once each, and the settings it refuses.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from '@babylonjs/core/Maths/math.vector.js';
import {actionTactics} from '../src/core/mind/action-tactics.ts';
import {behaviourFaults} from '../src/core/mind/behaviours.ts';
import {humanSpec} from '../src/core/human/spec.ts';
import {FIGHTING} from '../src/core/mind/config.ts';
const spec=humanSpec('workshop-fighter');
function reader(){
 const tactics=actionTactics(spec,[],{...FIGHTING,list:[{kind:'approach',spacing:.125,spacingStep:.03125}]});
 const sight={view:{time:0,stance:{centre:new Vector3()},senses:{side:'own',others:[],solids:[]}},report:{heading:0,actions:[],ledger:[]}};
 return {tactics,sight};
}
const record=(sequence,changes={})=>({sequence,action:'strike',committed:true,ending:{kind:'completed'},contacts:{loadedInCommit:false},...changes});
test('range adaptation consumes exact completed clean misses once and saturates without inspecting history',()=>{
 const {tactics,sight}=reader();
 for(let i=1;i<=6;i++){
  sight.report.ledger=[record(i)];tactics.decide(sight,1/120);tactics.decide(sight,1/120);
  assert.deepEqual(tactics.state.spacing,[Math.max(0,.125-i*.03125)]);
  assert.equal(tactics.state.sequence,i);
 }
});
test('refusal, interruption, prepare failure, return timeout and loaded commitment do not train distance',()=>{
 for(const changes of [{committed:false},{ending:{kind:'refused'}},{ending:{kind:'interrupted'}},{ending:{kind:'abandoned'}},{ending:{kind:'stalled'}},{contacts:{loadedInCommit:true}}]){
  const {tactics,sight}=reader();sight.report.ledger=[record(1,changes)];tactics.decide(sight,1/120);
  assert.deepEqual(tactics.state.spacing,[.125]);
 }
});
test('approach learning settings reject nonfinite and negative values',()=>{
 for(const [spacing,spacingStep]of [[NaN,0],[0,NaN],[0,Infinity],[0,-1],[-.1,.1]])
  assert.ok(behaviourFaults({kind:'approach',spacing,spacingStep}).length);
 assert.deepEqual(behaviourFaults({kind:'approach',spacing:0,spacingStep:0}),[]);
});
