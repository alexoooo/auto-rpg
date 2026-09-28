import { HighlightLayer } from "@babylonjs/core/Layers/highlightLayer.js";
import "@babylonjs/core/Layers/effectLayerSceneComponent.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { DungeonActor } from "./run.ts";

/** A narrow silhouette, depth-tested against the scene, with no change to body materials.
 * Babylon's expanded-mesh outline becomes black under this scene's SSAO prepass;
 * the stencil highlight layer composites its colour after that pass instead.
 */
export class EnemyHover {
  private layer: HighlightLayer | null = null;
  private scene: Scene | null = null;
  private meshes = new Set<Mesh>();
  show(actor: DungeonActor | null): void {
    const meshes=new Set(actor?.meshes.filter(p=>p.visible&&p.mesh.isVisible&&p.mesh.isEnabled()&&p.mesh instanceof Mesh&&p.mesh.getTotalVertices()>0).map(p=>p.mesh as Mesh)??[]);
    const scene=meshes.values().next().value?.getScene();
    if(scene&&scene!==this.scene){this.dispose();this.scene=scene;
      this.layer=new HighlightLayer("dungeon.enemy-hover",scene,{mainTextureRatio:1,blurTextureSizeRatio:1,blurHorizontalSize:1,blurVerticalSize:1});
      this.layer.innerGlow=false;
    }
    for(const mesh of this.meshes)if(!meshes.has(mesh))this.layer?.removeMesh(mesh);
    for(const mesh of meshes)if(!this.meshes.has(mesh))this.layer?.addMesh(mesh,new Color3(.96,.42,.28));
    this.meshes=meshes;if(this.layer)this.layer.isEnabled=meshes.size>0;
  }
  clear(): void { this.show(null); }
  dispose(): void {
    if(this.scene&&!this.scene.isDisposed)this.layer?.dispose();
    this.layer=null;this.scene=null;this.meshes.clear();
  }
}
