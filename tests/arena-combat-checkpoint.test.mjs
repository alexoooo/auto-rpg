import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';
import {spawnSync} from 'node:child_process';
import {combatCheckpoint,appendCombatRow,combatGroups,combatLeague} from '../research/combat-records.mjs';
import {combatPairs,combatFingerprint,combatTrial} from '../research/arena-combat.mjs';

const jobs=combatPairs({candidate:'scrapper',opponent:'puncher',count:1,capSeconds:3}).map(j=>({...j,search:{round:2,parent:'puncher'}}));
let physical;
async function trials(){return physical??=(async()=>{const rows=[];for(const job of jobs)rows.push({...job,result:await combatTrial(job.config)});return rows;})();}

test('checkpoint validates the complete manifest and preserves failed-trial history without scoring it',async()=>{
 const rows=await trials(),fp=combatFingerprint(),record=combatCheckpoint(jobs,fp);
 appendCombatRow(record,{...jobs[0],error:'interrupted physical worker'});assert.equal(record.rows.length,0);assert.equal(record.complete,false);
 appendCombatRow(record,rows[0]);assert.equal(record.complete,false);
 const resumed=combatCheckpoint(jobs,fp,record);assert.deepEqual(resumed.rows,[rows[0]]);assert.deepEqual(resumed.failures,record.failures);
 appendCombatRow(resumed,rows[1]);assert.equal(resumed.complete,true);
 assert.throws(()=>combatCheckpoint([...jobs,jobs[0]],fp),/duplicate/);
 assert.throws(()=>combatCheckpoint(jobs,fp+'changed',record),/fingerprint/);
 assert.throws(()=>combatCheckpoint(jobs.map(j=>({...j,extra:1})),fp,record),/manifest/);
 assert.throws(()=>appendCombatRow(resumed,rows[0]),/duplicate/);
 assert.throws(()=>appendCombatRow(record,{...rows[1],config:{...rows[1].config,extra:1}}),/metadata/);
 assert.throws(()=>appendCombatRow(record,{...rows[1],result:{...rows[1].result,config:{...rows[1].result.config,extra:1}}}),/physical trial/);
 assert.throws(()=>combatCheckpoint(jobs,fp,{...record,complete:true}),/missing/);
 assert.throws(()=>combatCheckpoint(jobs,fp,{...record,failures:[{...jobs[1],error:'failed',unknown:1}]}),/history/);
});

test('the CLI resumes the missing actual bout in a fresh worker and keeps the retained result exactly',async()=>{
 const rows=await trials(),directory=mkdtempSync(join(tmpdir(),'arena-combat-')),output=join(directory,'run.json'),manifest=join(directory,'jobs.json');
 try{
  const record=combatCheckpoint(jobs,combatFingerprint());appendCombatRow(record,rows[0]);
  writeFileSync(output,JSON.stringify(record));writeFileSync(manifest,JSON.stringify(jobs));
  const command=['research/arena-combat-run.mjs','--jobs',manifest,'--output',output,'--resume','--workers','1'];
  const result=spawnSync(process.execPath,command,{encoding:'utf8'});assert.equal(result.status,0,result.stderr+'\n'+result.stdout);
  const complete=JSON.parse(readFileSync(output));assert.deepEqual(complete.rows,rows);assert.equal(complete.complete,true);assert.equal(complete.rating.pairs,1);
  assert.ok(result.stdout.includes('"resumed":1'));
  const again=spawnSync(process.execPath,command,{encoding:'utf8'});assert.equal(again.status,0,again.stderr);assert.ok(again.stdout.includes('"remaining":0'));
  assert.deepEqual(JSON.parse(readFileSync(output)).rows,rows);
 }finally{assert.equal(dirname(resolve(directory)),resolve(tmpdir()));assert.match(basename(directory),/^arena-combat-/);rmSync(directory,{recursive:true,force:true});}
});

test('league seasons retain engine/body/loadout strata and never count identical deterministic recipes twice',async()=>{
 const rows=await trials(),run={fingerprint:combatFingerprint(),complete:true,rows},groups=combatGroups(rows);
 assert.equal(groups.length,1);assert.deepEqual(groups[0].descriptor.candidate,'scrapper');assert.equal(groups[0].rating.pairs,1);
 assert.equal(groups[0].total.seconds,6);assert.equal(groups[0].pairedDamageDelta.standardError,null);assert.equal(groups[0].endings.time.draws,2);
 const repeated=combatLeague([run,structuredClone(run)]);assert.equal(repeated.duplicatePairs,1);assert.equal(repeated.seasons[0].groups[0].rating.bouts,2);
 const different=combatLeague([run,{...run,fingerprint:run.fingerprint+'other'}]);assert.equal(different.seasons.length,2);
 const engines=[];for(const job of jobs){const config={...job.config,engine:'rapier'};engines.push({...job,config,result:await combatTrial(config)});}
 const engineLeague=combatLeague([run,{...run,rows:engines}]);assert.equal(engineLeague.duplicatePairs,0);assert.equal(engineLeague.seasons[0].groups.length,2);
 const strata=[];for(const job of jobs){const side=job.candidateSide,other=side==='left'?'right':'left',config={...job.config,recipe:{...job.config.recipe,held:{[side]:'club',[other]:'empty'}}};strata.push({...job,config,result:await combatTrial(config)});}
 assert.equal(combatGroups([...rows,...strata.map(r=>({...r,pair:1}))]).length,2);
 const partial=structuredClone(run);partial.rows[0].config.tape=[{step:1,side:'left',orders:null}];partial.rows[0].result=await combatTrial(partial.rows[0].config);
 assert.throws(()=>combatLeague([run,partial]),/partially duplicated/);
 assert.throws(()=>combatLeague([{...run,complete:false}]),/complete physical/);
});
