import test from 'node:test';
import assert from 'node:assert/strict';
import cases from '../research/stand-up-learning-cases.json' with {type:'json'};
import {recoveryQualification,recoveryComparison} from '../research/stand-up-qualification.mjs';
const rows=()=>cases.selection.map(c=>({case:c,policySha:'one',identity:{balance:100,host:'stance',hz:120,artifactSha:'rapier',actuation:'symmetric',specSha:c.model+c.held,sourceSha:'same'},result:{fell:true,success:true,failure:null,seconds:3,effortViolation:0}}));

test('directional recovery gates reject missing cases, mixed assistance and late handovers',()=>{
  const r=rows();assert.equal(recoveryQualification(r).pass,true);
  assert.equal(recoveryQualification(r.slice(1)).pass,false);
  const duplicate=rows();duplicate[1]=duplicate[0];assert.equal(recoveryQualification(duplicate).complete,false);
  const mixed=rows();mixed[0].identity.balance=50;assert.equal(recoveryQualification(mixed).pass,false);
  const late=rows();late[0].result.seconds=7;assert.equal(recoveryQualification(late).pass,false);
  assert.equal(recoveryQualification(late,{level:'substantial'}).pass,true);
  late[0].result.fell=false;assert.equal(recoveryQualification(late,{level:'substantial'}).pass,false);
});

test('comparison requires matched anatomy and a substantive improvement over a strong baseline',()=>{
  const candidate=rows(),baseline=rows();baseline.forEach(r=>r.result.seconds=5);
  assert.equal(recoveryComparison(candidate,baseline).pass,true);
  baseline.forEach(r=>r.result.seconds=4);assert.equal(recoveryComparison(candidate,baseline).pass,false);
  baseline[0].identity.specSha='different';assert.equal(recoveryComparison(candidate,baseline).matched,false);
});


test('fresh confirmation cases must match their own frozen manifest',()=>{
 const manifest=structuredClone(cases),r=rows();
 manifest.selection[1].degrees+=.125;r[1].case=manifest.selection[1];
 assert.equal(recoveryQualification(r).complete,false);
 assert.equal(recoveryQualification(r,{manifest}).pass,true);
});
