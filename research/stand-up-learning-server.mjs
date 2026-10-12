import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { createInterface } from 'node:readline';
import { readFileSync } from 'node:fs';
import { learningEnvironment } from './stand-up-learning-environment.mjs';
import { recoveryNetwork } from '../src/core/control/recovery-network.ts';

if (!isMainThread) {
  console.log = (...args) => process.stderr.write(args.join(' ')+'\n');
  const e=await learningEnvironment(workerData.configuration);
  const actor=workerData.actor ? recoveryNetwork(workerData.actor) : null;
  parentPort.postMessage({ready:true,identity:e.identity,observationSize:e.observation().length,actionSize:e.actionSize});
  parentPort.on('message',async ({id,op,value})=>{
    try {
      let result;
      switch(op) {
        case 'reset':result=await e.reset(value);break;
        case 'step':result=e.step(value);break;
        case 'policyStep':if(!actor)throw new Error('no exported actor loaded');result=e.step(actor(e.observation()));break;
        case 'inspect':result=e.inspect();break;
        case 'predict':if(!actor)throw new Error('no exported actor loaded');result=actor(value);break;
        case 'save':result=Buffer.from(e.save()).toString('base64');break;
        case 'restore':e.restore(Buffer.from(value,'base64'));result={observation:e.observation()};break;
        case 'close':e.dispose();result={closed:true};break;
        default:throw new Error('unknown learner operation');
      }
      parentPort.postMessage({id,result});
    }catch(error){parentPort.postMessage({id,error:String(error.stack??error)});}
  });
} else {
  const configuration=JSON.parse(readFileSync(process.argv[2],'utf8'));
  const actor=process.argv[4] ? JSON.parse(readFileSync(process.argv[4],'utf8')) : null;
  const count=Number(process.argv[3]??3);
  if(!Number.isSafeInteger(count)||count<1||count>4)throw new Error('one to four workers required');
  let sequence=0;
  const workers=Array.from({length:count},(_,i)=>{
    const worker=new Worker(new URL(import.meta.url),{stdout:true,stderr:true,workerData:{actor,configuration:{...configuration,seed:(configuration.seed??1)+i}}});
    worker.stdout.on('data',data=>process.stderr.write(data));worker.stderr.on('data',data=>process.stderr.write(data));
    const pending=new Map();let readyResolve,readyReject;
    const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
    worker.on('message',m=>{if(m.ready){readyResolve(m);return;}const p=pending.get(m.id);pending.delete(m.id);if(m.error)p.reject(new Error(m.error));else p.resolve(m.result);});
    worker.on('error',error=>{readyReject(error);for(const p of pending.values())p.reject(error);pending.clear();});
    return {worker,ready,call:(op,value)=>new Promise((resolve,reject)=>{const id=sequence++;pending.set(id,{resolve,reject});worker.postMessage({id,op,value});})};
  });
  const send=value=>process.stdout.write(JSON.stringify(value)+'\n');
  try {
    send({ready:await Promise.all(workers.map(w=>w.ready))});
    for await(const line of createInterface({input:process.stdin,crlfDelay:Infinity})){
      if(!line.trim())continue;
      const request=JSON.parse(line);
      if(!Array.isArray(request.values)||request.values.length!==count)throw new Error('one request value per worker');
      const results=await Promise.all(workers.map((w,i)=>request.values[i]===null?null:w.call(request.op,request.values[i])));
      send({results});if(request.op==='close')break;
    }
  }catch(error){send({error:String(error.stack??error)});process.exitCode=1;}
  finally {await Promise.all(workers.map(w=>w.worker.terminate()));}
}
