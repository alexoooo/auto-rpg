import { CRYPT_ROOM_LOOK, type CryptArchetype } from "./crypt-archetypes.ts";
import type { DungeonMap, Point } from "./map.ts";
import type { TorchPlacement } from "./dressing.ts";

/** Footprints used by deterministic packing and its coverage checks. */
export const CRYPT_PAVING: Readonly<Record<string, readonly [number,number]>> = {
  paving0:[1,1],paving1:[1,1],paving2:[1,1],paving3:[1,1],
  'slabs-long':[2,1],'slabs-large':[2,2],'slabs-broken':[2,2],'slabs-fractured':[1,1],
};
export interface CryptPlacement { piece: string; x: number; z: number; turn: number; obstacleId?: string }
export interface CryptRoomPlan {
  map: DungeonMap;
  archetypes: CryptArchetype[];
  placements: CryptPlacement[];
  torches: TorchPlacement[];
  bounds: { min: Point; max: Point };
  damp: Point[];
}

/** Dresses a crypt's map from the masonry kit: its paving, its walls and niches, each room's extras and torches,
 * and the furniture it is handed. `art` is the decoration's own stream of draws. */
export function dressCryptMap(map: DungeonMap, art: () => number, archetypes: CryptArchetype[], furniture: CryptPlacement[]): CryptRoomPlan {
  const {size,floor}=map;
  const min={x:Math.min(...map.rooms.map(r=>r.min.x)),z:Math.min(...map.rooms.map(r=>r.min.z))};
  const max={x:Math.max(...map.rooms.map(r=>r.max.x)),z:Math.max(...map.rooms.map(r=>r.max.z))};
  const lookAt=(x:number,z:number)=>{
    const room=map.rooms.find(r=>x>=r.min.x-1&&x<=r.max.x+1&&z>=r.min.z-1&&z<=r.max.z+1);
    const type=archetypes.find(a=>a.room===room?.id);return type?CRYPT_ROOM_LOOK[type.kind]:undefined;
  };
  const placements:CryptPlacement[]=[],put=(piece:string,x:number,z:number,turn=0)=>placements.push({piece,x,z,turn});
  const paved=new Set<number>();
  const solid=new Map<string,{x:number;z:number;nx:number;nz:number}>(),key=(x:number,z:number)=>`${x},${z}`;
  for(let z=0;z<size;z++)for(let x=0;x<size;x++)if(floor[z*size+x]){
    if(!paved.has(z*size+x)){
      const room=map.rooms.find(r=>x>=r.min.x&&x<=r.max.x&&z>=r.min.z&&z<=r.max.z);
      const kind=archetypes.find(a=>a.room===room?.id)?.kind;
      const roll=art(),turn=art()<.5?0:Math.PI/2;
      let piece=roll<(kind==='chapel'?.58:.30)?'slabs-large':roll<.63?'slabs-broken':'slabs-long';
      let [w,d]=CRYPT_PAVING[piece];if(turn){[w,d]=[d,w];}
      const fits=Array.from({length:d},(_,dz)=>Array.from({length:w},(_,dx)=>({x:x+dx,z:z+dz}))).flat()
        .every(p=>p.x<size&&p.z<size&&floor[p.z*size+p.x]&&!paved.has(p.z*size+p.x)&&(!room||(p.x<=room.max.x&&p.z<=room.max.z)));
      if(!fits){w=d=1;piece=art()<.4?'slabs-fractured':'paving'+Math.floor(art()*4);}
      put(piece,x+(w-1)/2,z+(d-1)/2,turn);
      for(let dz=0;dz<d;dz++)for(let dx=0;dx<w;dx++)paved.add((z+dz)*size+x+dx);
    }
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
    if(span.some(p=>!p||p.nx!==nx||p.nz!==nz||cornerSide(p)!==0||consumed.has(key(p.x,p.z)))||art()>(lookAt(x,z)?.niches??.12))continue;
    put('niche',x,z,Math.atan2(nx,nz));niches.push(placements.at(-1)!);
    for(const p of span)consumed.add(key(p!.x,p!.z));
  }
  for(const {x,z,nx,nz} of solid.values())if(!consumed.has(key(x,z))){
    const corner=cornerSide({x,z,nx,nz}),look=lookAt(x,z);
    const detail=(Math.abs(nx?z:x)%3===0)?'wall-pier':art()<.55?'wall-panel':'wall-repair';
    put(corner<0?'corner-left':corner>0?'corner-right':art()<.78?detail:'wall',x,z,Math.atan2(nx,nz));
    if(art()<(look?.roots??.15))put('roots',x,z,Math.atan2(nx,nz));
    if(look?.damp&&art()<.75)put('floor-roots',x+nx,z+nz,Math.atan2(nx,nz));
  }
  for(const p of niches){
    if(art()<(lookAt(p.x,p.z)?.roots??0))put('roots',p.x,p.z,p.turn);
    const nx=Math.sin(p.turn),nz=Math.cos(p.turn);
    if(art()<(lookAt(p.x,p.z)?.scatter??1))put('scatter',p.x+nx*.85,p.z+nz*.85,p.turn);
  }
  for(const door of map.doors)put('portal',door.point.x,door.point.z,door.axis==='x'?Math.PI/2:0);
  placements.push(...furniture);
  const torches:TorchPlacement[]=[];
  for(const room of map.rooms){
    const {min,max,centre}=room;
    const type=archetypes.find(a=>a.room===room.id),look=type?CRYPT_ROOM_LOOK[type.kind]:undefined;
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
  return {map,archetypes,placements,torches,bounds:{min,max},damp:torches.filter(t=>CRYPT_ROOM_LOOK[archetypes.find(a=>a.room===t.room)!.kind].damp).map(t=>({x:t.light.x+t.facing.x*1.4,z:t.light.z+t.facing.z*1.4}))};
}
