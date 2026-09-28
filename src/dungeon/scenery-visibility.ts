import { canSee, type DungeonMap, type Point } from "./map.ts";
import { doorCells } from "./fog.ts";

/** Presentation memory only. Never feed this set back to exploration or actor visibility. */
export function revealScenery(map: DungeonMap, hero: Point, visible: ReadonlySet<number>,
  explored: ReadonlySet<number>, memory: Set<number>): Set<number> {
  for (const key of explored) memory.add(key);
  for (const key of visible) memory.add(key);
  const blocked = new Set(map.doors.filter(d => !d.open).flatMap(d => doorCells(d).map(p => p.z * map.size + p.x)));
  for (let z=Math.max(0,Math.floor(hero.z-12));z<=Math.min(map.size-1,Math.ceil(hero.z+12));z++)
    for(let x=Math.max(0,Math.floor(hero.x-12));x<=Math.min(map.size-1,Math.ceil(hero.x+12));x++) {
      const key=z*map.size+x;
      if(!map.floor[key]||memory.has(key)||blocked.has(key))continue;
      if([[-.35,-.35],[.35,-.35],[-.35,.35],[.35,.35]].some(([dx,dz])=>canSee(map,hero,{x:x+dx,z:z+dz})))memory.add(key);
    }
  // Only enclosed, small room-interior gaps qualify; no flood into adjoining corridors.
  for(const room of map.rooms){
    const seen=new Set<number>();
    for(let z=room.min.z;z<=room.max.z;z++)for(let x=room.min.x;x<=room.max.x;x++){
      const first=z*map.size+x;if(!map.floor[first]||memory.has(first)||seen.has(first))continue;
      const pending=[first],component:number[]=[];let enclosed=true;
      while(pending.length){
        const key=pending.pop()!;if(seen.has(key))continue;seen.add(key);component.push(key);
        const cx=key%map.size,cz=Math.floor(key/map.size);
        if(blocked.has(key)||(map.obstacles??[]).some(o=>o.blocksSight&&Math.abs(cx-o.x)<o.width/2+.5&&Math.abs(cz-o.z)<o.depth/2+.5))enclosed=false;
        for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
          const nx=cx+dx,nz=cz+dz,n=nz*map.size+nx;
          if(nx<room.min.x||nx>room.max.x||nz<room.min.z||nz>room.max.z||!map.floor[n]||blocked.has(n)){enclosed=false;continue;}
          if(!memory.has(n)&&!seen.has(n))pending.push(n);
        }
      }
      if(enclosed&&component.length<=4)for(const key of component)memory.add(key);
    }
  }
  return memory;
}
