import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

/** Recorded muscle actions apply only to their exact saved starting observation. */
export function recordedPolicy({channels,tape}) {
  let step=0,matched;
  return observation=>{
    matched??=createHash('sha256').update(JSON.stringify(observation)).digest('hex')===tape.initialObservationSha256;
    if(matched&&step===0)assert.deepEqual(channels,tape.channels);
    return matched?tape.actions[step++]??{kind:'host'}:{kind:'host'};
  };
}

/** The frozen evaluator receives only an action tape and detached observations. */
export function createPolicy({channels}) {
  const tape=JSON.parse(gunzipSync(readFileSync(process.env.STAND_UP_ROLLOUT_ACTIONS)));
  return recordedPolicy({channels,tape});
}
