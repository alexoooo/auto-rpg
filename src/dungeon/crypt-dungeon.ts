import { cryptFurniture, type CryptArchetype, type CryptRoomKind } from "./crypt-archetypes.ts";
import { mulberry32 } from "../rng.ts";
import { dressCryptMap, type CryptRoomPlan } from "./crypt-room.ts";
import { findPath, walkable, type DungeonMap } from "./map.ts";
import { companionSpawn } from "./party-placement.ts";

/** Four chambers joined by a seeded spanning tree: three encounters beyond the entrance. */
export function generateCryptDungeon(seed: number): CryptRoomPlan {
  const random=mulberry32(seed), pick=(n:number)=>Math.floor(random()*n);
  const kinds:CryptRoomKind[]=['burial','chapel','rootbound'];
  for(let i=2;i>0;i--){const j=pick(i+1);[kinds[i],kinds[j]]=[kinds[j],kinds[i]];}
  const archetypes:CryptArchetype[]=['guard',...kinds].map((kind,room)=>({room,kind:kind as CryptRoomKind,variant:pick(3),turn:pick(2)*Math.PI}));
  const size=44, floor=new Uint8Array(size*size);
  const rooms=Array.from({length:4},(_,id)=>{
    const centre={x:12+(id%2)*20,z:12+Math.floor(id/2)*20};
    const w=archetypes[id].kind==="chapel"?5:5+pick(3),d=archetypes[id].kind==="chapel"?7:5+pick(3);
    return {id,centre,min:{x:centre.x-w,z:centre.z-d},max:{x:centre.x+w-1,z:centre.z+d-1}};
  });
  const carve=(x:number,z:number)=>{floor[z*size+x]=1;};
  for(const r of rooms)for(let z=r.min.z;z<=r.max.z;z++)for(let x=r.min.x;x<=r.max.x;x++){
    if(archetypes[r.id].kind==='rootbound'&&Math.min(x-r.min.x,r.max.x-x)+Math.min(z-r.min.z,r.max.z-z)<2)continue;
    carve(x,z);
  }
  const edges=[[0,1],[1,3],[3,2],[2,0]],omitted=pick(4);
  const map:DungeonMap={seed:seed>>>0,size,floor,rooms,doors:[],start:{...rooms[0].centre},exit:{...rooms[0].centre},spawns:[],obstacles:[]};
  const adjacency=rooms.map(()=>[] as number[]);
  for(let i=0;i<edges.length;i++)if(i!==omitted){
    const [a,b]=edges[i],ra=rooms[a],rb=rooms[b],axis=ra.centre.z===rb.centre.z?'x':'z';
    adjacency[a].push(b);adjacency[b].push(a);
    const low=Math.min(ra.centre[axis],rb.centre[axis]),high=Math.max(ra.centre[axis],rb.centre[axis]);
    for(let n=low;n<=high;n++)for(let side=-1;side<=1;side++)carve(axis==='x'?n:ra.centre.x+side,axis==='z'?n:ra.centre.z+side);
    for(const r of [ra,rb]){
      const other=r===ra?rb:ra,point={...r.centre};
      point[axis]=other.centre[axis]>r.centre[axis]?r.max[axis]+1:r.min[axis]-1;
      map.doors.push({id:map.doors.length,point,axis,open:false});
    }
  }
  const distances=[0,-1,-1,-1],queue=[0];
  for(const id of queue)for(const next of adjacency[id])if(distances[next]<0){distances[next]=distances[id]+1;queue.push(next);}
  const last=distances.indexOf(Math.max(...distances));map.exit={...rooms[last].centre};
  const furniture=rooms.map(r=>cryptFurniture(r,archetypes[r.id]));
  map.obstacles=furniture.flatMap(f=>f.obstacles);
  for(const r of rooms.slice(1)){
    const candidates=[];
    for(let z=r.min.z+1;z<r.max.z;z++)for(let x=r.min.x+1;x<r.max.x;x++)candidates.push({x,z});
    for(let i=candidates.length-1;i>0;i--){const j=pick(i+1);[candidates[i],candidates[j]]=[candidates[j],candidates[i]];}
    const chosen:{x:number;z:number}[]=[];
    for(const p of candidates)if(walkable(map,p,.65)&&Math.hypot(p.x-map.start.x,p.z-map.start.z)>15&&map.doors.every(d=>Math.hypot(p.x-d.point.x,p.z-d.point.z)>3)
      &&chosen.every(q=>Math.hypot(p.x-q.x,p.z-q.z)>2)&&findPath(map,map.start,p,.65).length){chosen.push(p);if(chosen.length===2)break;}
    if(chosen.length!==2)throw new Error(`Crypt encounter lacks clearance in room ${r.id}: start walkable=${walkable(map,map.start,.65)}, floor candidates=${candidates.filter(p=>walkable(map,p,.65)).length}`);map.spawns.push(...chosen);
  }
  const party=[map.start];for(let i=0;i<3;i++){const p=companionSpawn(map,party);if(!p)throw new Error('Crypt party staging failed');party.push(p);}
  for(const p of [map.exit,...map.spawns,...rooms.map(r=>r.centre)])if(!findPath(map,map.start,p,.65).length)throw new Error('Disconnected crypt dungeon');
  return dressCryptMap(map,mulberry32((seed^0x63727970)>>>0),archetypes,furniture.flatMap(f=>f.placements));
}
