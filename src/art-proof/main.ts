import { publicAssetUrl } from "../asset-url.ts";
import { Engine } from "@babylonjs/core/Engines/engine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight.js";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
import { HDRCubeTexture } from "@babylonjs/core/Materials/Textures/hdrCubeTexture.js";
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline.js";
import { SSAO2RenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssao2RenderingPipeline.js";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration.js";
import HavokPhysics from "@babylonjs/havok";
import havokWasmUrl from "@babylonjs/havok/lib/esm/HavokPhysics.wasm?url";
import "@babylonjs/core/Materials/Textures/Loaders/hdrTextureLoader.js";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent.js";
import "@babylonjs/core/Rendering/depthRendererSceneComponent.js";
import "@babylonjs/core/Rendering/geometryBufferRendererSceneComponent.js";
import "@babylonjs/core/Rendering/prePassRendererSceneComponent.js";
import "@babylonjs/core/Materials/standardMaterial.js";
import "@babylonjs/core/PostProcesses/RenderPipeline/postProcessRenderPipelineManagerSceneComponent.js";
import { attachPhysics } from "../physics.ts";
import { CONFIG } from "../config.ts";
import { Golem } from "../golem/golem.ts";
import { defaultGolemSetup } from "../golem/build.ts";
import { loadTemplates, proofMaterials, ASSET_ROOT, type ProofManifest } from "./assets.ts";
import { dressGolem } from "./presenter.ts";
import { buildProofWorld } from "./world.ts";
import { motionLabel, proofIntent, stepProofGolem } from "./motion.ts";

const element=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const status=element("status");
const buttons=[...document.querySelectorAll<HTMLButtonElement>("button")];
buttons.forEach(b=>b.disabled=true);
const pressed=(id:string,value:boolean)=>element(id).setAttribute("aria-pressed",String(value));
let cleanup=()=>{};

async function main() {
  const canvas=element<HTMLCanvasElement>("stage");
  const engine=new Engine(canvas,true,{stencil:true,powerPreference:"high-performance",preserveDrawingBuffer:true});
  // One physical pixel per CSS pixel, capped at the intended 1080p budget on large screens.
  const resize=()=>{engine.setHardwareScalingLevel(Math.max(1,window.innerWidth/1920,window.innerHeight/1080));engine.resize();};
  resize();window.addEventListener("resize",resize);
  const scene=new Scene(engine);scene.clearColor=new Color4(.026,.034,.047,1);
  let disposed=false;
  cleanup=()=>{if(disposed)return;disposed=true;engine.stopRenderLoop();scene.dispose();engine.dispose();window.removeEventListener("resize",resize);};
  window.addEventListener("pagehide",()=>cleanup(),{once:true});
  import.meta.hot?.dispose(()=>cleanup());
  scene.fogMode=Scene.FOGMODE_EXP2;scene.fogDensity=.027;scene.fogColor=new Color3(.042,.051,.068);
  attachPhysics(scene,await HavokPhysics({locateFile:()=>havokWasmUrl}));
  scene.getPhysicsEngine()!.setSubTimeStep(1000/CONFIG.world.physicsHz);
  const camera=new ArcRotateCamera("proof.camera",-Math.PI/2+.40,1.16,6.8,new Vector3(-.52,1.1,0),scene);
  camera.minZ=.04;camera.maxZ=90;camera.fov=.66;camera.lowerRadiusLimit=1.8;camera.upperRadiusLimit=13;
  camera.lowerBetaLimit=.25;camera.upperBetaLimit=1.50;camera.wheelDeltaPercentage=.012;
  camera.panningSensibility=1000;camera.attachControl(canvas,true);
  camera.movement.input.addEntry({source:"pointer",interaction:"pan",button:0,modifiers:{shift:true}});
  camera.movement.input.addEntry({source:"pointer",interaction:"rotate",button:1});
  camera.movement.input.addEntry({source:"pointer",interaction:"pan",button:1,modifiers:{shift:true}});
  const key=new DirectionalLight("proof.key",new Vector3(.45,-1,.55),scene);
  key.position.set(-4,7,-5);key.diffuse=new Color3(1,.83,.63);key.intensity=2.8;
  key.shadowMinZ=.1;key.shadowMaxZ=24;key.autoCalcShadowZBounds=false;
  key.orthoLeft=-7;key.orthoRight=7;key.orthoTop=7;key.orthoBottom=-7;
  const sky=new HemisphericLight("proof.cool-fill",new Vector3(0,1,-.2),scene);
  sky.diffuse=new Color3(.47,.63,.86);sky.groundColor=new Color3(.16,.12,.095);sky.intensity=.5;
  const rim=new DirectionalLight("proof.rim",new Vector3(-.8,-.5,-.65),scene);
  rim.diffuse=new Color3(.42,.61,1);rim.intensity=1.6;
  const shadows=new ShadowGenerator(2048,key);shadows.usePercentageCloserFiltering=true;
  // Sharper flat faces reveal self-shadow striping at the old bias.
  shadows.filteringQuality=ShadowGenerator.QUALITY_MEDIUM;shadows.bias=.0012;shadows.normalBias=.015;
  const environmentReady=new Promise<void>((resolve,reject)=> {
    scene.environmentTexture=new HDRCubeTexture(publicAssetUrl("/assets/env.hdr"),scene,256,false,true,false,true,
      ()=>resolve(),(message)=>reject(new Error(`Environment: ${message}`)));
  });
  scene.environmentIntensity=.95;
  const [materials,templates,kit,manifest] = await Promise.all([
    proofMaterials(scene),loadTemplates(scene,"golem.glb"),loadTemplates(scene,"forge-kit.glb"),
    fetch(ASSET_ROOT+"manifest.json").then(async r=>{if(!r.ok)throw new Error(`Asset manifest: HTTP ${r.status}`);return r.json() as Promise<ProofManifest>;}),
  ]);
  await environmentReady;
  if(disposed)return;
  const world=buildProofWorld(scene,kit,materials,shadows);
  const ao=new SSAO2RenderingPipeline("proof.ao",scene,{ssaoRatio:.5,blurRatio:1},[camera]);
  ao.radius=.16;ao.totalStrength=.8;ao.samples=8;ao.expensiveBlur=false;ao.maxZ=25;
  const pipeline=new DefaultRenderingPipeline("proof.post",true,scene,[camera]);
  pipeline.samples=1;pipeline.fxaaEnabled=true;
  pipeline.imageProcessing.toneMappingEnabled=true;pipeline.imageProcessing.toneMappingType=ImageProcessingConfiguration.TONEMAPPING_ACES;
  pipeline.imageProcessing.exposure=1.15;pipeline.imageProcessing.contrast=1.12;
  pipeline.imageProcessing.vignetteEnabled=true;pipeline.imageProcessing.vignetteWeight=1.35;
  pipeline.bloomEnabled=true;pipeline.bloomThreshold=1.1;pipeline.bloomWeight=.16;pipeline.bloomKernel=48;
  let time=0,paused=false,upgraded=true,cool=false,readout=false;
  let golem:Golem;
  let presenter:ReturnType<typeof dressGolem>;
  const rebuild=()=> {
    presenter?.dispose();golem?.dispose();time=0;
    golem=new Golem(scene,{side:"left",origin:Vector3.Zero(),facing:Math.PI,setup:defaultGolemSetup(),
      mind:{name:"art-proof-motion",decide:()=>proofIntent(time)},controlPolicies:[]});
    presenter=dressGolem(golem,templates,manifest,materials,shadows);presenter.show(upgraded);
    world.update(time);
  };
  rebuild();
  scene.onBeforePhysicsObservable.add(()=> {
    stepProofGolem(golem,1/CONFIG.world.physicsHz,time);time+=1/CONFIG.world.physicsHz;
  });
  const pause=(value:boolean)=>{paused=value;scene.physicsEnabled=!value;pressed("pause",value);element("pause").textContent=value?"Resume":"Pause";};
  const view=(close:boolean)=> {
    document.body.classList.toggle("inspect",close);
    camera.setTarget(new Vector3(close?0:-.52,close?1.35:1.1,0));
    camera.alpha=-Math.PI/2+(close?.55:.40);camera.beta=close?1.24:1.16;camera.radius=close?3.3:6.8;
    pressed("closeup",close);pressed("gameplay",!close);
  };
  const appearance=(value:boolean)=>{upgraded=value;presenter.show(value);pressed("appearance",value);element("appearance").textContent=value?"Modeled":"Original";};
  element("gameplay").onclick=()=>view(false);element("closeup").onclick=()=>view(true);
  element("pause").onclick=()=>pause(!paused);element("restart").onclick=rebuild;
  element("appearance").onclick=()=>appearance(!upgraded);
  element("stone").onclick=()=>{
    cool=!cool;materials.stone.albedoColor=Color3.FromHexString(cool?"#b9cfe1":"#eadbc0").toLinearSpace();
    pressed("stone",cool);element("stone").textContent=cool?"Blue granite":"Limestone";
  };
  element("stats").onclick=()=>{readout=!readout;element("metrics").hidden=!readout;pressed("stats",readout);};
  window.addEventListener("keydown",event=>{
    if(event.code==="Space" && !(event.target instanceof HTMLButtonElement)){event.preventDefault();pause(!paused);}
  });
  let previous=0;
  let benchmark:{start:number;last:number;samples:number[];invalid:boolean}|null=null;
  let result:unknown=null;
  const audit=()=>({width:engine.getRenderWidth(),height:engine.getRenderHeight(),
    renderer:engine.getGlInfo(),meshes:scene.meshes.length,activeMeshes:scene.getActiveMeshes().length,
    triangles:scene.getActiveIndices()/3,drawCalls:engine._drawCalls.current,
    bodies:scene.meshes.filter(mesh=>mesh.physicsBody).length,
    upgraded,clock:time,visibility:document.visibilityState});
  const finishBenchmark=()=> {
    if(!benchmark)return;
    const sorted=[...benchmark.samples].sort((a,b)=>a-b);
    result={...audit(),durationSeconds:(performance.now()-benchmark.start)/1000,frames:sorted.length,
      medianMs:sorted[Math.floor(sorted.length*.5)]??null,p95Ms:sorted[Math.floor(sorted.length*.95)]??null,
      invalidHiddenTab:benchmark.invalid,userAgent:navigator.userAgent};benchmark=null;
  };
  document.addEventListener("visibilitychange",()=>{if(benchmark && document.hidden)benchmark.invalid=true;});
  Object.assign(window,{__artProof:{scene,engine,camera,get golem(){return golem;},audit,pause,view,appearance,restart:rebuild,
    advance:(seconds:number)=>{
      const was=scene.physicsEnabled;scene.physicsEnabled=true;
      for(let frame=0;frame<Math.round(seconds*60);frame++){
        (scene as unknown as {_renderId:number})._renderId++;scene._advancePhysicsEngineStep(1000/60);
      }
      scene.physicsEnabled=false;world.update(time);scene.render();scene.physicsEnabled=was;
    },
    render:()=>{const was=scene.physicsEnabled;scene.physicsEnabled=false;world.update(time);scene.render();scene.physicsEnabled=was;},
    startBenchmark:()=>{if(document.hidden)throw new Error("Focus the proof tab before measuring frame pacing");
      result=null;benchmark={start:performance.now(),last:0,samples:[],invalid:false};},
    finishBenchmark,get benchmarkResult(){return result;},get clock(){return time;},get paused(){return paused;},
  }});
  await scene.whenReadyAsync();
  status.hidden=true;buttons.forEach(b=>b.disabled=false);
  engine.runRenderLoop(()=> {
    const now=performance.now();
    engine._drawCalls.fetchNewFrame();
    world.update(time);scene.render();
    if(benchmark){if(benchmark.last)benchmark.samples.push(now-benchmark.last);benchmark.last=now;if(now-benchmark.start>=60000)finishBenchmark();}
    if(now-previous>250){previous=now;element("phase").textContent=paused?"Paused · camera remains free":motionLabel(time);
      if(readout)element("metrics").textContent=`${engine.getRenderWidth()} × ${engine.getRenderHeight()}\n${engine.getFps().toFixed(0)} fps · ${engine._drawCalls.current} draw calls\n${Math.round(scene.getActiveIndices()/3).toLocaleString()} triangles\n${presenter.meshes.length} modeled pieces\n${time.toFixed(1)} s · ${motionLabel(time)}`;
    }
  });
  const disposeScene=cleanup;
  cleanup=()=>{if(disposed)return;presenter.dispose();golem.dispose();disposeScene();};
}
main().catch(error=>{cleanup();status.hidden=false;status.classList.add("error");status.textContent=`The forge could not load.\n${error instanceof Error?error.message:String(error)}\nCheck that the art-proof assets are present, then reload.`;console.error(error);});
