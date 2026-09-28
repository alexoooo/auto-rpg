import { CRYPT_ROOM_LOOK, type CryptArchetype } from "./crypt-archetypes.ts";
import { companionSpawn } from "./party-placement.ts";
import { mulberry32 } from "../rng.ts";
import { findPath, walkable, type DungeonMap, type Point } from "./map.ts";
import type { TorchPlacement } from "./dressing.ts";

export interface CryptPlacement { piece: string; x: number; z: number; turn: number; obstacleId?: string }
export interface CryptRoomPlan {
  map: DungeonMap;
  archetypes?: CryptArchetype[];
  placements: CryptPlacement[];
  torches: TorchPlacement[];
  bounds: { min: Point; max: Point };
  damp: Point[];
}

/** Gameplay randomness never consumes the decoration stream. All positions are game metres. */
export function generateCryptRoom(seed: number): CryptRoomPlan {
  const random=mulberry32(seed), art=mulberry32((seed^0x63727970)>>>0);
  const pick=(n:number)=>Math.floor(random()*n), width=10+2*pick(3), depth=10+2*pick(3);
  const size=26, min={x:6,z:6}, max={x:6+width-1,z:6+depth-1};
  const floor=new Uint8Array(size*size), carve=(x:number,z:number)=>{floor[z*size+x]=1;};
  for(let z=min.z;z<=max.z;z++)for(let x=min.x;x<=max.x;x++)carve(x,z);
  const alongX=random()<.5, entry=2+pick((alongX?depth:width)-4), leave=2+pick((alongX?depth:width)-4);
  const at=(along:number,out:number,exit=false):Point=>alongX
    ? {x:(exit?max.x:min.x)+(exit?out:-out),z:min.z+along}
    : {x:min.x+along,z:(exit?max.z:min.z)+(exit?out:-out)};
  for(const exit of [false,true])for(let out=1;out<=3;out++)for(let side=-1;side<=1;side++){
    const p=at((exit?leave:entry)+side,out,exit);carve(p.x,p.z);
  }
  const start=at(entry,1.3), exit=at(leave,2.3,true), door=at(leave,1,true);
  const map:DungeonMap={seed:seed>>>0,size,floor,rooms:[{id:0,min,max,centre:{x:Math.floor((min.x+max.x)/2),z:Math.floor((min.z+max.z)/2)}}],
    doors:[{id:0,point:door,axis:alongX?'x':'z',open:false}],start,exit,spawns:[],obstacles:[]};
  const turn=pick(2)*Math.PI/2, tw=turn?1.15:2.5, td=turn?2.5:1.15;
  const candidates=Array.from({length:24},()=>({x:min.x+2+random()*(width-5),z:min.z+2+random()*(depth-5)}));
  candidates.push({x:min.x+2,z:min.z+2});
  for(const p of candidates){
    map.obstacles=[{id:'crypt.sarcophagus',...p,width:tw,depth:td,height:1.1,blocksSight:false}];
    const taken=[start];
    for(let i=0;i<3;i++){const p=companionSpawn(map,taken);if(p)taken.push(p);}
    if(taken.length===4&&findPath(map,start,exit,.65).length)break;
  }
  if(!findPath(map,start,exit,.65).length)throw new Error('Crypt room has no exit route');
  const party=[start];for(let i=0;i<3;i++){const p=companionSpawn(map,party);if(!p)throw new Error('Crypt has no party staging space');party.push(p);}
  const spawnCandidates:Point[]=[];
  for(let z=min.z+1;z<max.z;z++)for(let x=min.x+1;x<max.x;x++)spawnCandidates.push({x,z});
  for(let i=spawnCandidates.length-1;i>0;i--){const j=pick(i+1);[spawnCandidates[i],spawnCandidates[j]]=[spawnCandidates[j],spawnCandidates[i]];}
  for(const p of spawnCandidates)if(walkable(map,p,.65)&&Math.hypot(p.x-start.x,p.z-start.z)>5
    &&party.every(q=>Math.hypot(p.x-q.x,p.z-q.z)>2)
    &&Math.hypot(p.x-door.x,p.z-door.z)>3.1
    &&map.spawns.every(q=>Math.hypot(p.x-q.x,p.z-q.z)>2)&&findPath(map,start,p,.65).length){
    map.spawns.push(p);if(map.spawns.length===3)break;
  }
  if(map.spawns.length!==3)throw new Error('Crypt room cannot place its encounter');
  return dressCryptMap(map,art);
}

/** The same masonry kit dresses both the proof room and connected gameplay maps. */
export function dressCryptMap(map: DungeonMap, art: () => number, archetypes?: CryptArchetype[], furniture?: CryptPlacement[]): CryptRoomPlan {
  const {size,floor}=map;
  const min={x:Math.min(...map.rooms.map(r=>r.min.x)),z:Math.min(...map.rooms.map(r=>r.min.z))};
  const max={x:Math.max(...map.rooms.map(r=>r.max.x)),z:Math.max(...map.rooms.map(r=>r.max.z))};
  const lookAt=(x:number,z:number)=>{
    const room=map.rooms.find(r=>x>=r.min.x-1&&x<=r.max.x+1&&z>=r.min.z-1&&z<=r.max.z+1);
    const type=archetypes?.find(a=>a.room===room?.id);return type?CRYPT_ROOM_LOOK[type.kind]:undefined;
  };
  const placements:CryptPlacement[]=[],put=(piece:string,x:number,z:number,turn=0)=>placements.push({piece,x,z,turn});
  const solid=new Map<string,{x:number;z:number;nx:number;nz:number}>(),key=(x:number,z:number)=>`${x},${z}`;
  for(let z=0;z<size;z++)for(let x=0;x<size;x++)if(floor[z*size+x]){
    put('paving'+Math.floor(art()*4),x,z);
    if(lookAt(x,z)?.damp && art()<.18)put('scatter',x,z);
    for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]])if(!floor[(z+dz)*size+x+dx])solid.set(key(x+dx,z+dz),{x:x+dx,z:z+dz,nx:-dx,nz:-dz});
  }
  const cornerSide=(c:{x:number;z:number;nx:number;nz:number})=>{
    for(const sign of [-1,1]) {
      const x=c.x+c.nx+c.nz*sign,z=c.z+c.nz-c.nx*sign;
      if(!floor[z*size+x]&&solid.has(key(x,z)))return sign;
    }
    return 0;
  };
  const consumed=new Set<string>(),niches:typeof placements=[];
  for(const cell of solid.values()){
    const {x,z,nx,nz}=cell, tx=nz,tz=-nx;
    const span=[-1,0,1].map(i=>solid.get(key(x+tx*i,z+tz*i)));
    if(span.some(p=>!p||p.nx!==nx||p.nz!==nz||cornerSide(p)!==0||consumed.has(key(p.x,p.z)))||art()>(lookAt(x,z)?.niches??(archetypes?.length ? .12 : .48)))continue;
    put('niche',x,z,Math.atan2(nx,nz));niches.push(placements.at(-1)!);
    for(const p of span)consumed.add(key(p!.x,p!.z));
  }
  for(const {x,z,nx,nz} of solid.values())if(!consumed.has(key(x,z)))put(cornerSide({x,z,nx,nz})<0?'corner-left':cornerSide({x,z,nx,nz})>0?'corner-right':'wall',x,z,Math.atan2(nx,nz));
  for(const p of niches){
    if(art()<(lookAt(p.x,p.z)?.roots??(archetypes?.length?0:.65)))put('roots',p.x,p.z,p.turn);
    const nx=Math.sin(p.turn),nz=Math.cos(p.turn);
    if(art()<(lookAt(p.x,p.z)?.scatter??1))put('scatter',p.x+nx*.85,p.z+nz*.85,p.turn);
  }
  for(const door of map.doors)put('portal',door.point.x,door.point.z,door.axis==='x'?Math.PI/2:0);
  if(furniture)placements.push(...furniture);
  else for(const tomb of map.obstacles??[])put('tomb',tomb.x,tomb.z,tomb.width>tomb.depth?0:Math.PI/2);
  const torches:TorchPlacement[]=[];
  for(const room of map.rooms){
    const {min,max,centre}=room;
    const type=archetypes?.find(a=>a.room===room.id),look=type?CRYPT_ROOM_LOOK[type.kind]:undefined;
    if(type?.kind==='guard')for(const x of [centre.x-2.7,centre.x+2.7])put('banner',x,max.z+1,Math.PI);
    if(type?.kind==='rootbound')for(const c of solid.values())if(lookAt(c.x,c.z)===look&&art()<.55)put('roots',c.x,c.z,Math.atan2(c.nx,c.nz));
    const candidates=[...solid.values()].filter(c=>(c.x===min.x-1&&c.z>=min.z&&c.z<=max.z)||(c.z===max.z+1&&c.x>=min.x&&c.x<=max.x));
    const priority=(c:{x:number;z:number})=>c.x===min.x-1?Math.abs(c.z-centre.z):Math.abs(c.x-centre.x)+.1;
    const chosen:TorchPlacement[]=[];
    for(const c of candidates.sort((a,b)=>priority(a)-priority(b))){
      if(chosen.some(t=>Math.hypot(c.x-t.cell.x,c.z-t.cell.z)<Math.min(max.x-min.x+1,max.z-min.z+1)*.65))continue;
      chosen.push({...(look?{color:look.color,intensity:look.intensity,shadowIntensity:look.shadow}:{}),room:room.id,cell:{x:c.x,z:c.z},facing:{x:c.nx,z:c.nz},
        flame:{x:c.x+c.nx*.65,y:2.05,z:c.z+c.nz*.65},light:{x:c.x+c.nx,y:2.05,z:c.z+c.nz}});
      if(chosen.length===2)break;
    }
    torches.push(...chosen);
  }
  return {map,archetypes,placements,torches,bounds:{min,max},damp:torches.filter(t=>!archetypes||CRYPT_ROOM_LOOK[archetypes.find(a=>a.room===t.room)!.kind].damp).map(t=>({x:t.light.x+t.facing.x*1.4,z:t.light.z+t.facing.z*1.4}))};
}
