import { mulberry32 } from "../rng.ts";
import { dressCryptMap, type CryptRoomPlan } from "./crypt-room.ts";
import { findPath, walkable, type DungeonMap } from "./map.ts";
import { companionSpawn } from "./party-placement.ts";

/** Four chambers joined by a seeded spanning tree: three encounters beyond the entrance. */
export function generateCryptDungeon(seed: number): CryptRoomPlan {
  const random=mulberry32(seed), pick=(n:number)=>Math.floor(random()*n);
  const size=44, floor=new Uint8Array(size*size);
  const rooms=Array.from({length:4},(_,id)=>{
    const centre={x:12+(id%2)*20,z:12+Math.floor(id/2)*20};
    const w=5+pick(3),d=5+pick(3);
    return {id,centre,min:{x:centre.x-w,z:centre.z-d},max:{x:centre.x+w-1,z:centre.z+d-1}};
  });
  const carve=(x:number,z:number)=>{floor[z*size+x]=1;};
  for(const r of rooms)for(let z=r.min.z;z<=r.max.z;z++)for(let x=r.min.x;x<=r.max.x;x++)carve(x,z);
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
  // Corner tombs leave the axial corridors and the party staging area clear.
  map.obstacles=rooms.map(r=>({id:`crypt.sarcophagus.${r.id}`,x:r.min.x+2,z:r.min.z+2,width:2.5,depth:1.15,height:1.1,blocksSight:false}));
  for(const r of rooms.slice(1))for(const p of [{x:r.centre.x-2,z:r.centre.z+2},{x:r.centre.x+2,z:r.centre.z-2}]){
    if(!walkable(map,p,.65))throw new Error('Crypt encounter lacks clearance');
    map.spawns.push(p);
  }
  const party=[map.start];for(let i=0;i<3;i++){const p=companionSpawn(map,party);if(!p)throw new Error('Crypt party staging failed');party.push(p);}
  for(const p of [map.exit,...map.spawns,...rooms.map(r=>r.centre)])if(!findPath(map,map.start,p,.65).length)throw new Error('Disconnected crypt dungeon');
  return dressCryptMap(map,mulberry32((seed^0x63727970)>>>0));
}
