import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader.js";
import "@babylonjs/loaders/glTF/index.js";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { AssetContainer } from "@babylonjs/core/assetContainer.js";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { Bone } from "@babylonjs/core/Bones/bone.js";
import { Skeleton } from "@babylonjs/core/Bones/skeleton.js";
import { visiblePart } from "../../character-lab/catalog.ts";
import { WORKSHOP_SHIELD_BOUNDS } from "./workshop-equipment.ts";
import { workshopCaps } from "./workshop-caps.ts";
import { publicAssetUrl } from "../../asset-url.ts";
import { WORKSHOP_SOURCE, type HumanAppearanceSetting } from "./workshop-profile.ts";
import type { HumanVisualPart } from "./appearance.ts";

const assets = new WeakMap<Scene, AssetContainer>();
export async function loadWorkshopAssets(scene: Scene): Promise<void> {
  if (assets.has(scene) || !scene.getEngine().getRenderingCanvas()) return;
  const container = await LoadAssetContainerAsync(publicAssetUrl("/assets/humanoid/workshop-fighter.glb"), scene);
  assets.set(scene, container);
  scene.onDisposeObservable.addOnce(() => container.dispose());
}

const local = (node: TransformNode): Matrix => Matrix.Compose(node.scaling,
  node.rotationQuaternion ?? Quaternion.FromEulerVector(node.rotation), node.position);
const compose = (row: {position: number[]; rotation: number[]}): Matrix =>
  Matrix.Compose(Vector3.One(), Quaternion.FromArray(row.rotation), Vector3.FromArray(row.position));
// glTF palette indices are independent of Babylon's hierarchy-ordered bones array.
const palette = (skeleton: Skeleton) => new Map(skeleton.bones.map((bone,index)=>[bone.getIndex()??index,bone]));
function compactRegion(mesh:Mesh, faces:readonly number[]):void {
  const vertices=[...new Set(faces)], remap=new Map(vertices.map((vertex,index)=>[vertex,index]));
  for(const kind of mesh.getVerticesDataKinds()) {
    const data=mesh.getVerticesData(kind)!,stride=mesh.getVertexBuffer(kind)!.getSize();
    const packed=new Float32Array(vertices.length*stride);
    vertices.forEach((vertex,index)=>{for(let i=0;i<stride;i++)packed[index*stride+i]=data[vertex*stride+i];});
    mesh.setVerticesData(kind,packed,true,stride);
  }
  mesh.setIndices(faces.map(index=>remap.get(index)!));
}

/** Only achieved physical transforms enter this adapter. It owns no animation or collision. */
export function dressWorkshopFighter(scene: Scene, parts: readonly HumanVisualPart[], side: string,
  setting: HumanAppearanceSetting, kit: "empty" | "sword" | "shield" | "sword-shield") {
  const asset = assets.get(scene);
  if (!asset) {
    if (scene.getEngine().getRenderingCanvas()) throw new Error("Workshop fighter assets were not loaded before construction");
    return null;
  }
  const instance = asset.instantiateModelsToScene(name => `workshop.${side}.${name}`, true, { doNotInstantiate: true });
  const nodes = instance.rootNodes.flatMap(root => [root, ...root.getDescendants()]) as TransformNode[];
  const materials=new Set(nodes.filter((node):node is Mesh=>node instanceof Mesh).map(mesh=>mesh.material).filter(material=>material!==null));
  const textures=new Set([...materials].flatMap(material=>material.getActiveTextures()).filter(texture=>!asset.textures.includes(texture)));
  const originalName = (node: TransformNode) => node.name.replace(`workshop.${side}.`, "");
  const globals = new Map<TransformNode, Matrix>();
  const global = (node: TransformNode): Matrix => {
    let value = globals.get(node);
    if (!value) { value = node.parent ? local(node).multiply(global(node.parent as TransformNode)) : local(node); globals.set(node,value); }
    return value;
  };
  nodes.forEach(global);
  const hosts = new Map(parts.map(part => [`${part.slot}.${part.id.split(".").pop()}`, part.host]));
  const frames = WORKSHOP_SOURCE.frames as Record<string, {position:number[];rotation:number[]}>;
  const definitions = WORKSHOP_SOURCE.bones as Record<string, {host:string}>;
  const fingers = WORKSHOP_SOURCE.grips[kit] as Record<string,number[]>;
  const rows = nodes.filter(node => definitions[originalName(node)]).map(node => {
    const name = originalName(node), key = definitions[name].host;
    const rest = globals.get(node)!.clone(), restLocal = local(node);
    const finger = fingers[name];
    if (finger) {
      const scale = new Vector3(), q = new Quaternion(), p = new Vector3(); restLocal.decompose(scale,q,p);
      Matrix.ComposeToRef(scale, q.multiply(new Quaternion(finger[1],finger[2],finger[3],finger[0])), p, restLocal);
    }
    return { node, name, key, rest, restLocal, finger: !!finger, inverse: Matrix.Invert(compose(frames[key])) };
  });
  const meshes: Mesh[] = [];
  for (const mesh of nodes.filter((node): node is Mesh => node instanceof Mesh && node.getTotalVertices() > 0)) {
    const name = originalName(mesh);
    mesh.setEnabled(visiblePart(name,{...setting,weapon:kit}));
    mesh.receiveShadows = true;
    if(name.startsWith("sword__")||name.startsWith("shield__")) {
      const sword=name.startsWith("sword__"),slot=sword?"primary":"secondary",host=hosts.get(`${slot}.${sword?"blade":"plate"}`);
      if(!host) { mesh.dispose(false,false);continue; }
      const hand=compose(frames[`${slot}.hand`]);
      let offset: Matrix;
      if(sword) {
        const points=WORKSHOP_SOURCE.equipment.blade.points;
        const centre=Vector3.FromArray([0,1,2].map(i=>(Math.min(...points.map(p=>p[i]))+Math.max(...points.map(p=>p[i])))/2));
        offset=Matrix.Identity();Matrix.FromXYZAxesToRef(Vector3.Up(),Vector3.Forward(),Vector3.Right(),offset);offset.setTranslation(centre);
      }else offset=Matrix.Translation(...WORKSHOP_SHIELD_BOUNDS.centre.add(new Vector3(0,.045,0)).asArray() as [number,number,number]);
      const rest=offset.multiply(hand);
      mesh.makeGeometryUnique();mesh.skeleton=null;
      mesh.bakeTransformIntoVertices(globals.get(mesh)!.multiply(Matrix.Invert(rest)));
      mesh.parent=host;mesh.position.setAll(0);mesh.scaling.setAll(1);mesh.rotationQuaternion=Quaternion.Identity();
      mesh.metadata={...mesh.metadata,humanSlot:slot,humanLayer:"equipment"};meshes.push(mesh);
      continue;
    }
    const indices = mesh.getVerticesData("matricesIndices"), weights = mesh.getVerticesData("matricesWeights");
    const jointPalette=mesh.skeleton?palette(mesh.skeleton):new Map<number,Bone>();
    const triangles = mesh.getIndices()!, groups = new Map<string,number[]>();
    for(let triangle=0;triangle<triangles.length;triangle+=3) {
      const totals=new Map<string,number>();
      if(indices && weights && mesh.skeleton) for(let vertex=0;vertex<3;vertex++) for(let influence=0;influence<4;influence++) {
        const i=triangles[triangle+vertex]*4+influence;
        const bone: Bone | undefined=jointPalette.get(indices[i]);
        const boneName: string=bone?.name.replace(`workshop.${side}.`,"")??"";
        const slot=definitions[boneName]?.host.split(".")[0];
        if(slot)totals.set(slot,(totals.get(slot)??0)+weights[i]);
      }
      const slot=[...totals].sort((a,b)=>b[1]-a[1])[0]?.[0]??"torso";
      if(!groups.has(slot))groups.set(slot,[]);
      groups.get(slot)!.push(triangles[triangle],triangles[triangle+1],triangles[triangle+2]);
    }
    for(const [slot,faces] of groups) {
      const region=mesh.clone(`${mesh.name}.${slot}`,mesh.parent,true)!;
      region.makeGeometryUnique();compactRegion(region,faces);
      region.metadata={...mesh.metadata,humanSlot:slot,humanLayer:name.startsWith("armour__")?"armour":"body"};
      region.computeBonesUsingShaders=false;
      meshes.push(region);
    }
    meshes.push(...workshopCaps(mesh,groups));
    mesh.dispose(false,false);
  }
  for (const part of parts) { part.host.isVisible=false; for (const shell of part.shells) shell.isVisible=false; }
  const update = () => {
    const achieved = new Map<TransformNode,Matrix>();
    for (const row of rows) {
      const parent = row.node.parent as TransformNode;
      const parentMatrix = achieved.get(parent) ?? globals.get(parent) ?? Matrix.Identity();
      const host = hosts.get(row.key);
      let matrix = row.finger ? row.restLocal.multiply(parentMatrix) : host
        ? row.rest.multiply(row.inverse).multiply(Matrix.Compose(Vector3.One(),host.rotationQuaternion??Quaternion.Identity(),host.position))
        : row.restLocal.multiply(parentMatrix);
      const suffix=row.name.endsWith("_r")?"primary":"secondary";
      const upperHelper=row.name.startsWith("upperarm_swing_")||row.name.startsWith("upperarm_twist_");
      const foreHelper=row.name.startsWith("forearm_twist_");
      if(upperHelper||foreHelper) {
        const key=`${suffix}.${upperHelper?"upper":"fore"}`, segment=hosts.get(key), hand=hosts.get(`${suffix}.hand`);
        if(segment&&hand) {
          const q=segment.rotationQuaternion!, restQ=Quaternion.FromArray(frames[key].rotation), full=q.multiply(restQ.conjugate());
          let delta=full;
          if(upperHelper) {
            const torso=hosts.get("torso.core")!.rotationQuaternion!;
            const direction=new Vector3(0,-1,0).rotateByQuaternionToRef(restQ,new Vector3()).rotateByQuaternionToRef(torso,new Vector3());
            const actual=new Vector3(0,-1,0).rotateByQuaternionToRef(q,new Vector3());
            const swing=Quaternion.Identity();Quaternion.FromUnitVectorsToRef(direction,actual,swing);
            delta=Quaternion.Slerp(swing.multiply(torso),full,row.name.startsWith("upperarm_swing_")?0:.5);
          }else {
            const handDelta=hand.rotationQuaternion!.multiply(Quaternion.FromArray(frames[`${suffix}.hand`].rotation).conjugate());
            const relative=handDelta.multiply(full.conjugate()),axis=new Vector3(0,-1,0).rotateByQuaternionToRef(q,new Vector3());
            const projection=axis.scale(Vector3.Dot(axis,new Vector3(relative.x,relative.y,relative.z)));
            const twist=new Quaternion(projection.x,projection.y,projection.z,relative.w).normalize();
            delta=Quaternion.Slerp(Quaternion.Identity(),twist,row.name.includes("_1_")?.4:.75).multiply(full);
          }
          const anchorName=upperHelper?`upperarm_${row.name.endsWith("_r")?"r":"l"}`:`hand_${row.name.endsWith("_r")?"r":"l"}`;
          const source=WORKSHOP_SOURCE.bones[anchorName as keyof typeof WORKSHOP_SOURCE.bones].head;
          const sourceAnchor=new Vector3(-source[0],source[2],-source[1]);
          const length=upperHelper?WORKSHOP_SOURCE.upperLength:WORKSHOP_SOURCE.foreLength;
          const anchor=new Vector3(0,(upperHelper?1:-1)*length/2,0).rotateByQuaternionToRef(q,new Vector3()).add(segment.position);
          matrix=row.rest.multiply(Matrix.Translation(-sourceAnchor.x,-sourceAnchor.y,-sourceAnchor.z))
            .multiply(Matrix.Compose(Vector3.One(),delta,anchor));
        }
      }
      achieved.set(row.node,matrix);
      const relative = matrix.multiply(Matrix.Invert(parentMatrix));
      row.node.rotationQuaternion ??= Quaternion.Identity();
      relative.decompose(row.node.scaling,row.node.rotationQuaternion,row.node.position);
    }
    for (const skeleton of instance.skeletons) skeleton.prepare();
    for (const mesh of meshes) { if(mesh.skeleton)mesh.applySkeleton(mesh.skeleton); mesh.refreshBoundingInfo(); }
  };
  update(); const observer=scene.onBeforeRenderObservable.add(update);
  const detached=new Set<string>();
  return { meshes, detach(slots: readonly string[]) {
    update();slots.forEach(slot=>detached.add(slot));
    for(const mesh of meshes)if(mesh.metadata?.humanCap)mesh.isVisible=detached.has(mesh.metadata.humanSlot)
      ||mesh.metadata.capNear.some((slot:string)=>detached.has(slot));
    for(let s=0;s<instance.skeletons.length;s++) {
      const previous=instance.skeletons[s], next=new Skeleton(`${previous.name}.cut`,`${previous.id}.cut`,scene);
      const jointPalette=palette(previous);
      const copies=new Map<Bone,Bone>();
      const copyBone=(bone:Bone):Bone=>{
        const existing=copies.get(bone);if(existing)return existing;
        const parent=bone.getParent();
        const copy=new Bone(bone.name,next,parent?copyBone(parent):null,bone.getLocalMatrix().clone(),undefined,undefined,bone.getIndex());
        copy.linkTransformNode(bone.getTransformNode());copies.set(bone,copy);return copy;
      };
      previous.bones.forEach(copyBone);
      next.bones.splice(0,next.bones.length,...previous.bones.map(bone=>copies.get(bone)!));
      for(const mesh of meshes.filter(mesh=>mesh.skeleton===previous)) {
        mesh.setPositionsForCPUSkinning()!.set(mesh.getVerticesData("position")!);
        mesh.setNormalsForCPUSkinning()!.set(mesh.getVerticesData("normal")!);
        const indices=mesh.getVerticesData("matricesIndices")!,weights=mesh.getVerticesData("matricesWeights")!;
        const slot=mesh.metadata.humanSlot;
        for(let i=0;i<indices.length;i+=4) {
          let total=0;
          for(let j=0;j<4;j++) {
            const name=jointPalette.get(indices[i+j])?.name.replace(`workshop.${side}.`,"")??"";
            const other=definitions[name]?.host.split(".")[0];
            if(other!==slot&&(detached.has(slot)||detached.has(other)))weights[i+j]=0;
            total+=weights[i+j];
          }
          if(!total) {
            indices[i]=[...jointPalette].find(([,bone])=>definitions[bone.name.replace(`workshop.${side}.`,"")]?.host.split(".")[0]===slot)![0];
            weights[i]=1;total=1;
          }
          for(let j=0;j<4;j++)weights[i+j]/=total;
        }
        mesh.setVerticesData("matricesIndices",indices,true);mesh.setVerticesData("matricesWeights",weights,true);mesh.skeleton=next;
      }
      previous.dispose();instance.skeletons[s]=next;
    }
  }, dispose() {
    scene.onBeforeRenderObservable.remove(observer);
    meshes.forEach(mesh=>mesh.dispose(false,false));instance.dispose(); materials.forEach(material=>material.dispose(false,false));
    textures.forEach(texture=>texture.dispose());
  } };
}
