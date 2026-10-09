import {Worker,isMainThread,parentPort} from 'node:worker_threads';
import {writeFileSync,readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {combatPairs,combatTrial,combatRating,combatFingerprint} from '../research/arena-combat.mjs';
import {groundFight} from '../research/ground-combat.mjs';
import {SCRAPPER} from '../src/core/mind/config.ts';
import {PUNCH_EXECUTION} from '../src/core/skills/combat.ts';
import {withParts} from '../tests/fixtures/minds.mjs';
const search=JSON.parse(gunzipSync(readFileSync('docs/reference/punch-foundation-search.json.gz')));
const candidate=withParts(SCRAPPER,{blow:{tuning:{paths:search.rows[search.selected].settings,execution:PUNCH_EXECUTION}}});
if(!isMainThread)parentPort.on('message',async job=>{try{parentPort.postMessage({...job,result:await(job.task==='ground'?groundFight(job.config):combatTrial(job.config))});}catch(e){parentPort.postMessage({...job,error:e.stack});}});
else{
 const fingerprint=combatFingerprint(),jobs=[];
 for(const split of ['development','heldout'])for(const row of combatPairs({candidate,opponent:'scrapper',count:2,split,capSeconds:30}))jobs.push({...row,task:'arena',pair:`${split}/${row.pair}`});
 for(const hand of ['left','right'])for(const recover of [false,true])jobs.push({task:'ground',config:{candidate,hand,recover,seconds:45}});
 let next=0;const rows=[],workers=[new Worker(new URL(import.meta.url)),new Worker(new URL(import.meta.url))];
 try{await Promise.all(workers.map(worker=>new Promise((resolve,reject)=>{worker.on('error',reject);const feed=()=>{if(next>=jobs.length){resolve();return;}worker.once('message',row=>{if(row.error){reject(new Error(row.error));return;}rows.push(row);console.log(JSON.stringify({task:row.task,id:row.id,ground:row.result.summary,verdict:row.result.verdict}));feed();});worker.postMessage(jobs[next++]);};feed();})));
 if(combatFingerprint()!==fingerprint)console.warn('source changed during Arena qualification: the results may mix two versions of the code');
 writeFileSync(process.argv[2]??'docs/reference/punch-arena.json',JSON.stringify({fingerprint,candidate,rows,rating:combatRating(rows.filter(r=>r.task==='arena'))},null,2)+'\n');
 }finally{await Promise.all(workers.map(worker=>worker.terminate()));}
}
