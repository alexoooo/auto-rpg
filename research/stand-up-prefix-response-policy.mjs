import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {responsePolicy} from './stand-up-response-policy.mjs';

const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** A saved-case prefix continues only when its complete observed trajectory matches. */
export function prefixPolicy({channels,prefix,continuation,fallback}) {
  const state={matched:null,steps:0,stage:'unselected'},hash=createHash('sha256');
  const policy=observation=>{
    if(state.matched===null) {
      state.matched=digest(observation)===prefix.initialObservationSha256;
      state.stage=state.matched?'prefix':'fallback';
      if(state.matched)assert.deepEqual(channels,prefix.channels);
    }
    if(state.stage==='fallback')return fallback(observation);
    if(state.stage==='prefix') {
      if(state.steps>0)hash.update(JSON.stringify(observation));
      if(state.steps<prefix.actions.length)return prefix.actions[state.steps++];
      assert.equal(digest(observation),prefix.endpointObservationSha256);
      assert.equal(hash.digest('hex'),prefix.traceSha256,'the complete physical prefix must match before continuation');
      state.stage='continuation';
    }
    return continuation(observation);
  };
  policy.state=state;return policy;
}

/** The frozen evaluator supplies detached observations; continuations emit ordinary recovery actions. */
export function createPolicy({channels}) {
  const configuration=JSON.parse(readFileSync(process.env.STAND_UP_PREFIX_RESPONSE_CONFIG));
  const load=file=>JSON.parse(gunzipSync(readFileSync(file)));
  const reference=load(configuration.reference),prefix=load(configuration.prefixTape);
  assert.equal(configuration.prefixSteps,prefix.actions.length);
  assert.deepEqual(reference.identity,prefix.identity);
  let continuation;
  switch(configuration.continuation??'response') {
    case 'response':continuation=responsePolicy({channels,reference,parameters:configuration.parameters});break;
    case 'host':continuation=()=>({kind:'host'});break;
    default:throw new Error('unknown prefix continuation');
  }
  return prefixPolicy({channels,prefix,continuation,
    fallback:responsePolicy({channels,reference:load(configuration.fallback.reference),parameters:configuration.fallback.parameters})});
}
