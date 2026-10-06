import test from 'node:test';
import assert from 'node:assert/strict';
import {auditPunchMass} from '../research/punch-mass-audit.mjs';
import {DEFAULT_ENGINE} from '../src/core/engine/engines.ts';
test('independent free-body impulses agree with contact mass; sourced bracing produces a distinct response',async()=>{
 const record=await auditPunchMass({rates:[120]});assert.equal(record.harness.engine,DEFAULT_ENGINE);
 assert.ok(record.harness.revision.includes('adapter-9'));assert.equal(record.windowSeconds,1/120);assert.equal(record.rows.length,12);
 for(const row of record.rows){assert.ok(row.measuredWindowMass>0);assert.deepEqual(row.assists,{force:0,moment:0});
  if(row.mode==='free')assert.ok(Math.abs(row.measuredWindowMass/row.model-1)<.02);
  else assert.ok(row.measuredWindowMass/row.model>1.1);
 }
 assert.ok(record.rows.filter(r=>r.mode==='grounded').every(r=>r.floorImpulse>0));
});
