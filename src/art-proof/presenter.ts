import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
import type { Golem } from "../golem/golem.ts";
import type { ProofManifest, ProofMaterials } from "./assets.ts";

/** Owns visual nodes only. No body geometry, mass, transform or constraint is modified. */
export function dressGolem(golem: Golem, templates: Map<string, Mesh>, manifest: ProofManifest,
  materials: ProofMaterials, shadows: ShadowGenerator) {
  const old = new Map<AbstractMesh, boolean>();
  const made: Mesh[] = [];
  const rows = new Map(manifest.parts.map(row => [row.key,row]));
  try {
    for (const part of golem.visualParts()) {
      const originals = [...new Set([part.host,...part.shells])].filter(m=>m.isVisible);
      originals.forEach((source,index)=> {
        const key=`${part.slot}:${part.moduleId}:${part.id.replace(`${golem.side}.`,"")}:${index}`;
        const row=rows.get(key), template=row && templates.get(row.asset);
        if (!row || !template) throw new Error(`Missing modeled part: ${key}`);
        const mesh=template.clone(`proof.${row.asset}`,null,true)!;
        mesh.setEnabled(true);mesh.isVisible=true;mesh.isPickable=false;
        mesh.parent=source===part.host ? part.host : source.parent;
        mesh.position.copyFrom(source===part.host ? Vector3.Zero() : source.position);
        mesh.rotationQuaternion=source===part.host ? Quaternion.Identity() :
          (source.rotationQuaternion?.clone() ?? Quaternion.FromEulerVector(source.rotation));
        if(source!==part.host) mesh.scaling.copyFrom(source.scaling);
        switch(row.family) {
          case "carvedStone": mesh.material=materials.stone;break;
          case "functionalMetal": mesh.material=materials.bronze;break;
          case "steel": mesh.material=materials.steel;break;
          case "rune": mesh.material=materials.rune;break;
          case "golemWood": mesh.material=materials.wood;break;
          default: throw new Error(`Unknown proof material ${row.family}`);
        }
        mesh.receiveShadows=true;shadows.addShadowCaster(mesh,false);
        old.set(source,source.isVisible);made.push(mesh);
      });
    }
    if(made.length!==rows.size) throw new Error("Model manifest does not match this golem build");
  } catch(error) { for(const mesh of made){shadows.removeShadowCaster(mesh,false);mesh.dispose(false,false);} throw error; }
  const show=(upgraded:boolean)=> {
    for(const [mesh,visible] of old) {
      mesh.isVisible=upgraded?false:visible;
      if(!upgraded)shadows.addShadowCaster(mesh,false);else shadows.removeShadowCaster(mesh,false);
    }
    for(const mesh of made) {
      mesh.isVisible=upgraded;
      if(upgraded)shadows.addShadowCaster(mesh,false);else shadows.removeShadowCaster(mesh,false);
    }
  };
  show(true);
  return { meshes:made, show, dispose:()=> {
    for(const [mesh,visible] of old) if(!mesh.isDisposed()){mesh.isVisible=visible;shadows.removeShadowCaster(mesh,false);}
    for(const mesh of made){shadows.removeShadowCaster(mesh,false);mesh.dispose(false,false);}
  }};
}
