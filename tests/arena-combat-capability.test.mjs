/**
 * **How often the Brawler pair lands** (`research/arena-combat.mjs`), measured and not a gate
 * (`tests/experimental.json`): Node, core world, Rapier, 120 Hz.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { combatTrial } from '../research/arena-combat.mjs';
import { BRAWLER } from './fixtures/minds.mjs';

/**
 * A mirrored pair's 30 s bouts from each gap 3.4 to 4.6 m, 0.2 m apart, read over all fourteen
 * sides, since one bout's count is one draw (from one gap to the next a side's body blows run
 * from 1 to 12): a side lands 3 driven body blows a bout and more than 0.2 HP of driven damage on
 * the mean, under half what the Scrapper pair lands (6.9 and 0.45 HP); fewer than one side in four
 * falls; no side is held in a clinch, hands touching with no driven blow, for the protocol's
 * pressure episode (`COMBAT_PROTOCOL.pressureEpisode`); and none is assisted.
 */
async function landsBodyBlows(mind){
 const outs=[];
 for(const gap of [3.4,3.6,3.8,4,4.2,4.4,4.6]){const row=await combatTrial({left:mind,right:mind,recipe:{capSeconds:30,gap}});outs.push(row.sides.left,row.sides.right);}
 const mean=f=>outs.reduce((sum,out)=>sum+f(out),0)/outs.length,told=JSON.stringify(outs);
 assert.ok(mean(out=>(out.drivenTargets.upperTrunk??0)+(out.drivenTargets.middleTrunk??0))>=3,told);
 assert.ok(mean(out=>out.drivenDamage)>.2,told);
 assert.ok(outs.filter(out=>out.falls>0).length<outs.length/4,told);
 assert.deepEqual(outs.map(out=>out.pressureOnly.episodes),outs.map(()=>0),told);
 assert.deepEqual(outs.map(out=>out.assist),outs.map(()=>({force:0,moment:0})));
}

test('the Brawler pair launches repeated body blows without sustained hugging',async()=>{
 await landsBodyBlows(BRAWLER);
});
