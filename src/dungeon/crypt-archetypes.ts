import type { DungeonObstacle, Room } from "./map.ts";
import type { CryptPlacement } from "./crypt-room.ts";

export type CryptRoomKind = "guard" | "burial" | "chapel" | "rootbound";
export interface CryptArchetype { room: number; kind: CryptRoomKind; variant: number; turn: number }
/** Footprints are shared by exported furnishings and their authoritative colliders: each piece's width, depth and
 * height, m (`docs/reference/look.md#crypt-rooms`). */
export const CRYPT_FURNITURE = {
  tomb: [2.5,1.15,1.1], column: [.8,.8,2.65], altar: [2.4,1.1,1.05],
  bench: [1.7,.55,.65], rack: [1.8,.6,1.9], cluster: [1.8,1.5,.55],
} as const;
/** Open frames obstruct feet, not vision. Keep this independent of collision height. */
const CRYPT_SIGHT = { tomb:false, column:true, altar:false, bench:false, rack:false, cluster:false } as const;
export function cryptFurniture(room: Room, type: CryptArchetype): { obstacles: DungeonObstacle[]; placements: CryptPlacement[] } {
  const obstacles: DungeonObstacle[]=[],placements: CryptPlacement[]=[];
  const mirror=type.turn===0?1:-1,shift=(type.variant-1)*.3;
  const add=(piece:keyof typeof CRYPT_FURNITURE,x:number,z:number,turn=0)=>{
    const [w,d,height]=CRYPT_FURNITURE[piece],rotated=Math.abs(Math.sin(turn))>.5;
    const at={x:room.centre.x+x*mirror,z:room.centre.z+z*mirror};
    const id=`crypt.${room.id}.${piece}.${obstacles.length}`;
    obstacles.push({id,...at,width:rotated?d:w,depth:rotated?w:d,height,blocksSight:CRYPT_SIGHT[piece]});
    placements.push({piece,...at,turn:turn+type.turn,obstacleId:id});
  };
  switch(type.kind){
    case "guard":
      add('rack',-2.7,-3.5);add('rack',2.7,-3.5);
      if(type.variant===0){add('bench',-2.7,3.2);add('bench',2.7,3.2);}
      else {add('bench',-3.5,2.3+shift,Math.PI/2);add('bench',3.5,2.3-shift,type.variant===1?Math.PI/2:0);}
      break;
    case "burial":
      add('tomb',-2.7,-2.5+shift,type.variant===1?Math.PI/2:0);
      add('tomb',2.7,-2.5-shift,type.variant===2?Math.PI/2:0);
      add('tomb',type.variant===2?2.7:-2.7,2.5,0);
      break;
    case "chapel":
      // The altar sits off the doorway axis; the central aisle stays two metres wide.
      add('altar',type.variant===1?2.2:-2.2,room.max.z-room.centre.z-1);
      for(const x of [-3,3])for(const z of [-3,3])add('column',x,z);
      for(const x of [-2.6,2.6])for(const z of [-1.5,1.5])add('bench',x,z+shift);
      break;
    case "rootbound":
      add('cluster',-2.7,-2+shift);add('cluster',2.5,2.4-shift,Math.PI/2);
      break;
  }
  return {obstacles,placements};
}

/** Each kind of room's look: the odds of a niche, a root and scatter, whether it is damp, and its torches' colour,
 * strength and shadow (`docs/reference/look.md#crypt-rooms`). */
export const CRYPT_ROOM_LOOK = {
  guard: {niches:.08,roots:0,scatter:.05,damp:false,color:'#ffc077',intensity:6,shadow:85},
  burial: {niches:.85,roots:.12,scatter:.3,damp:false,color:'#ff9c4b',intensity:4,shadow:60},
  chapel: {niches:.35,roots:.05,scatter:.15,damp:false,color:'#ffe2ad',intensity:8,shadow:95},
  rootbound: {niches:.5,roots:1,scatter:1,damp:true,color:'#e7ba78',intensity:5,shadow:70},
} as const;
