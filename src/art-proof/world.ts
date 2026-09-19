import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { PointLight } from "@babylonjs/core/Lights/pointLight.js";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate.js";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import { Effect } from "@babylonjs/core/Materials/effect.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
import type { Material } from "@babylonjs/core/Materials/material.js";
import { COLLIDES, LAYER } from "../physics.ts";
import { validateRoomPlacements, validateVisualColliderPairs, type RoomGroup, type RoomPlacement } from "../arena-room.ts";
import type { ProofMaterials } from "./assets.ts";
import "@babylonjs/core/Meshes/instancedMesh.js";

Effect.ShadersStore.proofFireVertexShader = `precision highp float;
attribute vec3 position; attribute vec2 uv; uniform mat4 worldViewProjection; varying vec2 vUV;
void main(){vUV=uv;gl_Position=worldViewProjection*vec4(position,1.0);}`;
Effect.ShadersStore.proofFireFragmentShader = `precision highp float;
varying vec2 vUV; uniform float time;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
void main(){float y=vUV.y;float x=(vUV.x-.5)*2.;
x+=sin(y*9.-time*3.)*.13*y;
float n=noise(vec2(x*5.,y*7.-time*2.7))*.7+noise(vec2(x*12.,y*18.-time*4.))*.3;
float field=(1.-y)*.78-abs(x)*1.3+(n-.5)*.55;
float a=smoothstep(.0,.18,field)*smoothstep(0.,.06,y);
float core=smoothstep(.15,.72,field);
vec3 c=mix(vec3(2.6,.12,.006),vec3(5.,2.,.28),core);
gl_FragColor=vec4(c,a*.82);}`;

export function buildProofWorld(scene: Scene, kit: Map<string,Mesh>, m: ProofMaterials, shadows: ShadowGenerator) {
  const colliders=new Set<string>();
  const pairs: {visual:string;collider:string}[]=[];
  const placements: RoomPlacement[]=[];
  const groups: RoomGroup[]=[{role:"wall",metresPerRepeat:1,placements}];
  const solids: PhysicsAggregate[]=[];
  const collider=(name:string,position:Vector3,size:Vector3)=> {
    const box=MeshBuilder.CreateBox(name,{width:size.x,height:size.y,depth:size.z},scene);
    box.position.copyFrom(position);box.isVisible=false;
    const aggregate=new PhysicsAggregate(box,PhysicsShapeType.BOX,{mass:0,friction:.9,restitution:.02},scene);
    aggregate.shape.filterMembershipMask=LAYER.WORLD;aggregate.shape.filterCollideMask=COLLIDES.WORLD;
    colliders.add(name);solids.push(aggregate);return box;
  };
  collider("proof.ground",new Vector3(0,-.5,0),new Vector3(60,1,60));
  const place=(asset:string,name:string,at:Vector3,scale:Vector3,material:Material,solid=true)=> {
    const source=kit.get(asset);if(!source)throw new Error(`Missing forge asset ${asset}`);
    source.material=material;source.receiveShadows=true;
    const mesh=source.createInstance(name);mesh.position.copyFrom(at);mesh.scaling.copyFrom(scale);
    mesh.rotationQuaternion=Quaternion.Identity();mesh.isVisible=true;mesh.setEnabled(true);
    mesh.isPickable=false;
    if(solid) {
      const bounds=source.getBoundingInfo().boundingBox.extendSize.scale(2).multiply(scale);
      const bodyName=`${name}.collider`;collider(bodyName,at,bounds);
      pairs.push({visual:name,collider:bodyName});
      placements.push({name,role:"wall",position:at.asArray() as [number,number,number],
        halfExtent:bounds.scale(.5).asArray() as [number,number,number],rotationY:0,solid:true,collider:bodyName});
      shadows.addShadowCaster(mesh);
    }
    return mesh;
  };
  // Tops coincide with the physical slab; only tiny bevels/gaps break the visual plane.
  const pavement=place("pavement","proof.floor",Vector3.Zero(),Vector3.One(),m.basalt,false);
  pairs.push({visual:pavement.name,collider:"proof.ground"});
  place("fissures","proof.molten-joints",Vector3.Zero(),Vector3.One(),m.lava,false);
  const underlay=MeshBuilder.CreateGround("proof.underlay",{width:60,height:60},scene);
  underlay.position.y=-.012;underlay.material=m.basalt;underlay.receiveShadows=true;
  for(let i=-6;i<=6;i++) {
    const h=1.5+(Math.sin(i*7.7)+1)*.6;
    place("outcrop",`proof.cliff.${i}`,new Vector3(i*1.7,h*1.5,8.3),new Vector3(1.2,h,1.5),m.basalt);
  }
  // A curved-looking, stepped masonry silhouette, with an unobstructed front for inspection.
  for(let x=-6;x<=6;x++) {
    const rows=4+Math.round(Math.abs(Math.sin(x*1.7))*3);
    for(let y=0;y<rows;y++)place("masonry",`proof.rear.${x}.${y}`,
      new Vector3(x*.99+(y%2)*.22,y*.47+.24,5.4),Vector3.One(),m.basalt);
    place("coping",`proof.cap.${x}`,new Vector3(x*.99+(rows%2)*.22,rows*.47+.08,5.4),Vector3.One(),m.basalt);
  }
  for(const x of [-5.5,5.5])for(let z=-2;z<=4;z++) {
    for(let y=0;y<2;y++)place("masonry",`proof.side.${x}.${z}.${y}`,
      new Vector3(x,y*.47+.24,z),new Vector3(.58,1,1.8),m.basalt);
  }
  for(const x of [-4,-2,2,4]) {
    place("plinth",`proof.pillar.base.${x}`,new Vector3(x,.1,4.75),new Vector3(1.6,1.2,1.6),m.basalt);
    for(let y=0;y<4;y++)place("column",`proof.pillar.${x}.${y}`,
      new Vector3(x,.8+y*1.17,4.75),new Vector3(1.5,1,1.5),m.basalt);
    place("plinth",`proof.pillar.cap.${x}`,new Vector3(x,5,4.75),new Vector3(1.8,1.4,1.8),m.basalt);
  }
  for(const x of [-3,0,3]) {
    const banner=place("banner",`proof.banner.${x}`,new Vector3(x,3.6,4.97),new Vector3(1.25,1.2,1),m.banner,false);
    // Thin fabric is a scrim, explicitly admitted by the room-placement rule.
    groups.push({role:"banner",metresPerRepeat:1,placements:[{name:banner.name,role:"banner",position:[x,3.6,4.97],
      halfExtent:[.5,1.2,.08],rotationY:0,solid:false,collider:null}]});
    const emblem=MeshBuilder.CreateTorus(`proof.sigil.${x}`,{diameter:.28,thickness:.018,tessellation:4},scene);
    emblem.position.set(x,3.55,4.90);emblem.rotation.x=Math.PI/2;emblem.rotation.z=Math.PI/4;emblem.material=m.bronze;
  }
  const fire=new ShaderMaterial("proof.fire",scene,"proofFire",{
    attributes:["position","uv"],uniforms:["worldViewProjection","time"],needAlphaBlending:true});
  fire.backFaceCulling=false;fire.disableDepthWrite=true;
  const fires:Vector3[]=[new Vector3(-2.9,1.48,2.0),new Vector3(2.9,1.48,2.0),new Vector3(-4.8,.95,-2.4),new Vector3(4.8,.95,-2.4)];
  const lights:PointLight[]=[];
  for(const [i,p] of fires.entries()) {
    place("plinth",`proof.brazier.foot.${i}`,new Vector3(p.x,.10,p.z),Vector3.One(),m.basalt);
    const h=p.y-.25;
    place("column",`proof.brazier.stem.${i}`,new Vector3(p.x,h/2+.12,p.z),new Vector3(.8,h/1.2,.8),m.basalt);
    place("brazier",`proof.brazier.bowl.${i}`,new Vector3(p.x,p.y-.07,p.z),Vector3.One(),m.bronze);
    const plane=MeshBuilder.CreatePlane(`proof.flame.${i}`,{width:.6,height:.90},scene);
    plane.position.copyFrom(p.add(new Vector3(0,.34,0)));plane.material=fire;plane.billboardMode=Mesh.BILLBOARDMODE_Y;plane.isPickable=false;
    const light=new PointLight(`proof.firelight.${i}`,p.add(new Vector3(0,.25,0)),scene);
    light.diffuse=new Color3(1,.34,.075);light.intensity=6;light.range=6;lights.push(light);
  }
  const emberSource=MeshBuilder.CreateSphere("proof.ember-source",{diameter:.012,segments:3},scene);
  emberSource.material=m.lava;emberSource.setEnabled(false);
  const embers=Array.from({length:64},(_,i)=> {
    const mesh=emberSource.createInstance(`proof.ember.${i}`);mesh.setEnabled(true);mesh.isPickable=false;return mesh;
  });
  const failures=[...validateRoomPlacements(groups,colliders),...validateVisualColliderPairs(scene,pairs)];
  if(failures.length)throw new Error(failures.join("\n"));
  return { colliders:solids, update:(time:number)=> {
    fire.setFloat("time",time);
    lights.forEach((light,i)=>light.intensity=5.5+.5*Math.sin(time*8+i*3)+.3*Math.sin(time*13+i));
    embers.forEach((mesh,i)=> {
      const p=fires[i%fires.length], age=(time*.35+i*.618)%1;
      mesh.position.set(p.x+Math.sin(i*17+time*.7)*age*.25,p.y+age*1.5,p.z+Math.cos(i*13+time*.4)*age*.24);
      mesh.scaling.setAll(Math.max(.05,1-age)*(.7+(i%3)*.25));
    });
    m.lava.emissiveColor.set(2.7+.3*Math.sin(time*1.7),.16,.005);
  }};
}
