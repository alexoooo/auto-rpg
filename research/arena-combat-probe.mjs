/** Autonomous Warrior bouts; contact pressure and hand-contact damage are not clean-strike scores. */
import { isMainThread, Worker, parentPort } from 'node:worker_threads';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { Duel } from '../src/arena/duel.ts';
import { addArenaSolids } from '../src/arena/room.ts';
import { POINT_FIGHTER, FIGHTER } from '../src/core/mind/config.ts';
import { createWorld } from '../src/core/world.ts';
import { freshEngine } from '../tests/harness/core-stand.mjs';

async function trial(config) {
  const rendering = new NullEngine(), scene = new Scene(rendering), physics = await freshEngine(), world = createWorld(scene, physics);
  addArenaSolids(world.physics);
  const mind = name => name === 'classic' ? FIGHTER : { ...POINT_FIGHTER, hand: name === 'alternate' ? 'alternate' : 'right' };
  const duel = new Duel(world, { left: 'workshop-fighter', right: 'workshop-fighter', gap: config.gap, capSeconds: 30,
    recoverySeconds: 60, held: {left: 'empty', right: 'empty'}, minds: {left: mind(config.left), right: mind(config.right)} });
  const sides = Object.fromEntries(['left','right'].map(side => {
    const d = duel.duelists[side];
    return [side, {phases:{}, falls:0, down:false, handPressure:0, outgoingDamage:0, outgoingEnergy:0, incomingDamage:0,
      hands: ['left','right'].map(hand => ({hand, segment:d.built.segments.get(`hand.${hand}`)})),
      otherBodies:new Set([...duel.duelists[side === 'left' ? 'right' : 'left'].built.segments.values()].map(s=>s.body))}];
  }));
  let minimumGap=Infinity, gapSum=0, samples=0, blowIndex=0;
  try {
    while(world.time < 30 && !duel.verdict) {
      world.step();
      if(world.time >= 5) {
        const a=duel.duelists.left.body.view.head,b=duel.duelists.right.body.view.head;
        const gap=Math.hypot(a.x-b.x,a.z-b.z); minimumGap=Math.min(minimumGap,gap); gapSum+=gap; samples++;
      }
      for(const side of ['left','right']) {
        const d=duel.duelists[side],out=sides[side],report=d.minded.skills.report.strike;
        if(d.body.down && !out.down)out.falls++;out.down=d.body.down;
        if(world.time < 5)continue;
        const phase=d.body.has !== 'command' ? d.body.has : report.phase ?? d.minded.skills.report.engagement?.phase ?? 'guard';out.phases[phase]=(out.phases[phase]??0)+world.dt;
        let pressure=false;
        for(const h of out.hands) {
          const touching=world.physics.contactsOf(h.segment.body).some(c=>out.otherBodies.has(c.other)&&c.impulse>0);pressure ||= touching;
        }
        if(pressure)out.handPressure+=world.dt;
      }
      for(;blowIndex<duel.blows.length;blowIndex++) {
        const blow=duel.blows[blowIndex];if(blow.time<5)continue;
        for(let i=0;i<2;i++) {
          const own=blow.sides[i],other=blow.sides[1-i],out=sides[own.fighter];
          out.incomingDamage+=own.damage;
          if(own.segment.startsWith('hand.')) {out.outgoingDamage+=other.damage;out.outgoingEnergy+=blow.energy;}
        }
      }
    }
    const output={config,harness:{kind:'Node Arena Duel',engine:physics.revision,hz:world.hz,actuation:world.actuation,balance:{left:0,right:0},models:['Warrior','Warrior'],held:'empty'},seconds:world.time,verdict:duel.verdict,afterStartup:{from:5,meanHeadGap:gapSum/samples,minimumHeadGap:minimumGap},sides:{}};
    for(const side of ['left','right']) {
      const out=sides[side],d=duel.duelists[side];
      output.sides[side]={phases:out.phases,handPressureSeconds:out.handPressure,falls:out.falls,bar:d.pool.bar(),cycles:d.minded.skills.report.strike.pointCycle??null,
        outgoingHandDamage:out.outgoingDamage,outgoingHandEnergy:out.outgoingEnergy,incomingDamage:out.incomingDamage};
    }
    return output;
  } finally {duel.dispose();world.dispose();scene.dispose();rendering.dispose();}
}
if(!isMainThread) {
  parentPort.on('message',async job=>{try{parentPort.postMessage({result:await trial(job)});}catch(e){parentPort.postMessage({error:e.stack});}});
} else {
  const jobs=[{left:'right',right:'right',gap:4},{left:'alternate',right:'alternate',gap:4},{left:'alternate',right:'alternate',gap:1.2},
    {left:'alternate',right:'alternate',gap:2.4},{left:'alternate',right:'classic',gap:4},{left:'classic',right:'classic',gap:4}];
  const workers=Array.from({length:2},()=>new Worker(new URL(import.meta.url))),results=[];let next=0;
  try {
    await Promise.all(workers.map(w=>new Promise((resolve,reject)=>{
      w.on('error',reject);const feed=()=>{if(next>=jobs.length){resolve();return;}const job=jobs[next++];w.once('message',m=>{if(m.error){reject(new Error(m.error));return;}results.push(m.result);console.log(JSON.stringify(m.result));feed();});w.postMessage(job);};feed();
    })));
    const output = process.argv[2] ?? 'research/runs/arena-combat-baseline.json';
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output,JSON.stringify({protocol:1,results},null,2)+'\n');
  }finally{await Promise.all(workers.map(w=>w.terminate()));}
}
