import {pathToFileURL} from 'node:url';
import {writeFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {punchCalibration} from './punch-calibration.mjs';
import {groundFight} from './ground-combat.mjs';
import {punchScore} from './punch-foundation.mjs';
import {combatFingerprint} from './arena-combat.mjs';
import {PLANTED_PUNCH_EXECUTION} from '../src/core/skills/combat.ts';
import {SCRAPPER} from '../src/core/mind/config.ts';
import {withParts} from '../tests/fixtures/minds.mjs';

/** Stability admits each limb and each task independently, without a force-improvement threshold. */
export function punchStabilityAdmission(standing,ground) {
 return punchScore(standing).accepted && ground.length===4 && ['left','right'].every(hand=>
  [false,true].every(recover=>ground.some(r=>r.options.hand===hand&&r.options.recover===recover&&
   r.summary.begun!==null&&r.summary.begun<15&&r.summary.lowReady>100&&r.summary.lowDriven>=2&&
   !r.summary.attackerFell&&r.summary.trunkFloor===0&&r.summary.returnedStanding&&
   r.summary.cycles.returned[hand]>=2&&r.summary.cycles.failed===0&&
   r.summary.assist.force===0&&r.summary.assist.moment===0)));
}

/** Ordinary unpinned standing and actual Arena ground tasks, retaining every failed trial. */
export async function qualifyPunchStability(paths={contactSpeed:5,swingSeconds:.12,elbowExtension:.5,torso:.2}) {
 const fingerprint=combatFingerprint(),standing=[],ground=[];
 for(const hand of ['left','right'])for(const family of ['straight','cross']) {
  const r=await punchCalibration({hand,family,seconds:8,armExtension:paths.elbowExtension,paths,
   execution:PLANTED_PUNCH_EXECUTION,matchedFeedback:true,pad:{face:'compliant'}});
  standing.push(r);process.stderr.write(`standing ${hand}/${family}: ${r.qualification.accepted}\n`);
 }
 for(const hand of ['left','right'])for(const recover of [false,true]) {
  const r=await groundFight({hand,recover,seconds:45,
   candidate:withParts(SCRAPPER,{blow:{tuning:{paths,execution:PLANTED_PUNCH_EXECUTION}}}),measureSupport:true});
  ground.push(r);process.stderr.write(`ground ${hand}/${recover}: ${JSON.stringify(r.summary)}\n`);
 }
 if(combatFingerprint()!==fingerprint)console.warn('source changed during punch stability qualification: the results may mix two versions of the code');
 return {version:1,fingerprint,paths,execution:PLANTED_PUNCH_EXECUTION,standing,ground,
  accepted:punchStabilityAdmission(standing,ground)};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
 const record=await qualifyPunchStability();
 writeFileSync(process.argv[2]??'docs/reference/punch-stability.json.gz',gzipSync(JSON.stringify(record)));
 console.log(JSON.stringify({accepted:record.accepted}));
}
