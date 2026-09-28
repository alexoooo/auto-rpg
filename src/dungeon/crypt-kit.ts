import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { Quaternion } from "@babylonjs/core/Maths/math.vector.js";
import type { AssetContainer } from "@babylonjs/core/assetContainer.js";
import type { CryptRoomPlan } from "./crypt-room.ts";

/** Bake placements once and batch by material; no kit node becomes a physics body. */
export function assembleCryptKit(container: AssetContainer, plan: CryptRoomPlan): void {
  const root=container.meshes.find(m=>m.name==='__root__');
  if(root){root.rotationQuaternion=Quaternion.Identity();root.scaling.setAll(1);root.computeWorldMatrix(true);}
  const sources=container.meshes.filter((m):m is Mesh=>m instanceof Mesh&&m.getTotalVertices()>0);
  const groups=new Map<string,Mesh[]>();
  for(const p of plan.placements){
    const pieces=sources.filter(m=>m.name.startsWith(p.piece+'__'));
    if(!pieces.length)throw new Error(`Missing crypt kit piece: ${p.piece}`);
    for(const source of pieces){
      const mesh=source.clone('placed.'+source.name,null,true)!;
      mesh.parent=null;mesh.position.set(p.x,0,p.z);mesh.rotationQuaternion=Quaternion.RotationYawPitchRoll(p.turn,0,0);
      mesh.scaling.setAll(1);mesh.computeWorldMatrix(true);
      const material=source.name.split('__')[1];
      if(!groups.has(material))groups.set(material,[]);groups.get(material)!.push(mesh);
    }
  }
  for(const source of sources){source.setEnabled(false);}
  for(const [material,meshes] of groups){
    const merged=Mesh.MergeMeshes(meshes,true,true,undefined,false,false);
    if(!merged)throw new Error(`Cannot assemble crypt ${material}`);
    merged.name='reference.'+material;container.meshes.push(merged);
  }
}
