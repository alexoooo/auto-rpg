import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deserialize } from 'node:v8';
import { gunzipSync } from 'node:zlib';
import { build } from 'vite';
import { rapierModule } from '../src/core/engine/rapier.ts';

const [baselinePath, candidatePath, output] = process.argv.slice(2);
const read = path => deserialize(gunzipSync(readFileSync(path)));
const baseline = read(baselinePath), candidate = read(candidatePath);
const component=Boolean(baseline.configuration?.standing&&candidate.configuration?.standing);
const compact = (r,label) => ({ label, component, result:r.result, traceSha256:r.traceSha256,
  frames:[{observation:r.initial,result:{elapsed:r.initial.time-r.result.takeover}},...r.rows].map(({observation:o,result})=>({
    elapsed:result.elapsed, centre:o.centre, segments:o.segments.map(({position,rotation,handPose})=>({position,rotation,handPose})),
    contacts:o.contacts.filter(c=>c.fixed!==null&&c.impulse>0).flatMap(c=>(c.patch??[]).filter(p=>p.distance<=0).map(p=>p.point)) })) });
const data = { geometry:baseline.geometry, records:[compact(candidate,component?'Weight transfer and foot lift':'Candidate · recorded muscle actions'),
  compact(baseline,component?'Standing hold':'Frozen optimized baseline')] };
const rapier = await rapierModule(), world = new rapier.World({x:0,y:0,z:0});
try {
  for (const g of data.geometry) for (const s of [...g.shapes,...Object.values(g.poses??{}).flat()]) {
    if (s.kind !== 'hull') continue;
    const points = s.points.flatMap(p => {
      const d=p.value.map((v,i)=>v-g.frame.origin[i]);
      return [g.frame.x,g.frame.y,g.frame.z].map(a=>a.reduce((sum,v,i)=>sum+v*d[i],0));
    });
    const collider=world.createCollider(rapier.ColliderDesc.convexHull(new Float32Array(points)));
    s.visual={positions:[...collider.vertices()],indices:[...collider.indices()]};
    world.removeCollider(collider,false);
  }
} finally { world.free(); }
const bundle = await build({ configFile:false,logLevel:'warn',build:{write:false,minify:true,lib:{entry:resolve('research/stand-up-saved-viewer.js'),name:'SavedFallReplay',formats:['iife']}} });
const code=bundle[0].output.find(x=>x.type==='chunk').code;
writeFileSync(output,`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Saved fall · unassisted recovery</title>
<style>*{box-sizing:border-box}body{margin:0;background:#0e1217;color:#e5edf3;font:15px system-ui}main{height:100vh;display:flex;flex-direction:column}header{padding:18px 24px}h1{font-size:21px;margin:0 0 6px}p{margin:5px 0;color:#abbac7}canvas{flex:1;min-height:240px;width:100%;touch-action:none}footer{padding:16px 24px;background:#18202a}nav{display:flex;gap:12px;align-items:center;flex-wrap:wrap}button,select{font:inherit;color:inherit;background:#2b3a49;border:1px solid #516477;border-radius:5px;padding:8px}input{width:100%;margin:16px 0}#status{margin-top:10px}small{color:#9caebb}</style>
<main><header><h1>${component?'Standing component · unassisted weight transfer':'Saved Front fall · unassisted recovery'}</h1><p>Warrior, empty hands, existing compliant soles. Unchanged anatomy and muscle limits.</p><small>Recorded Node Stance Lab motion · game Rapier coordinate engine · 120 Hz · Balance 0. Drag to orbit, wheel to zoom. Yellow dots: loaded floor patches.</small></header><canvas></canvas><footer><nav><select aria-label="Recording"></select><button id="play">Play</button><button id="restart">Restart</button><button id="step">Step 1/120 s</button><select id="speed" aria-label="Speed"><option value=".25">0.25×</option><option value=".5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option></select><span id="clock"></span></nav><input id="time" aria-label="Timeline" type="range" min="0" step="0.008333333333333333" value="0"><div id="status"></div><p><small>${component?'Starts standing; this demonstrates a component, not recovery from a fall.':'Pose playback of measured physical trajectories, including the standing and walking tail. One saved fall; no robustness claim.'} No browser physics resimulation.</small></p></footer></main>
<script id="recording" type="application/json">${JSON.stringify(data).replaceAll('<','\\u003c')}</script><script>${code.replaceAll('</script','<\\/script')}</script></html>`);
console.log(output);
