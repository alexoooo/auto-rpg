import type { DungeonMap } from "./map.ts";
import type { TorchPlacement } from "./dressing.ts";

/** Authored metre-space layout. Rendering and headless gameplay consume the same obstacles. */
export function referenceChamber(seed = 271828): DungeonMap {
  const size=22, floor=new Uint8Array(size*size);
  const room=(x0:number,z0:number,x1:number,z1:number)=>{for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++)floor[z*size+x]=1;};
  room(4,5,15,13);room(8,2,10,4);room(8,14,10,18);
  return {seed,size,floor,rooms:[{id:0,min:{x:4,z:5},max:{x:15,z:13},centre:{x:9,z:9}}],
    doors:[{id:0,point:{x:9,z:14},axis:"z",open:false}],start:{x:9,z:5.5},exit:{x:9,z:17.5},
    spawns:[{x:5.5,z:10.5},{x:12.5,z:10.5},{x:12,z:8.5}],
    obstacles:[{id:"reference.sarcophagus",x:12.8,z:6.6,width:2.5,depth:1.15,height:1.1,blocksSight:false}]};
}
export const REFERENCE_CAMERA={pitch:42*Math.PI/180,azimuth:135*Math.PI/180,zoom:6.5};
export const REFERENCE_TORCHES: readonly TorchPlacement[] = [
  {room:0,cell:{x:3,z:8},facing:{x:1,z:0},flame:{x:3.65,y:2.05,z:8},light:{x:4,y:2.05,z:8}},
  {room:0,cell:{x:12,z:14},facing:{x:0,z:-1},flame:{x:12,y:2.05,z:13.35},light:{x:12,y:2.05,z:13}},
];
