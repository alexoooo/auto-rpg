import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";

/** Cap only boundaries shared by two module regions, never eye, mouth or garment openings. */
export function workshopCaps(source: Mesh, groups: ReadonlyMap<string, readonly number[]>): Mesh[] {
  const points=source.getVerticesData("position")!, joints=source.getVerticesData("matricesIndices"), weights=source.getVerticesData("matricesWeights");
  if(!joints||!weights||groups.size<2)return [];
  const pointKey=(i:number)=>Array.from(points.slice(i*3,i*3+3),n=>n.toFixed(6)).join(",");
  const edges=new Map<string,{a:number;b:number;slot:string}[]>();
  for(const [slot,triangles]of groups)for(let i=0;i<triangles.length;i+=3)for(let j=0;j<3;j++) {
    const a=triangles[i+j],b=triangles[i+(j+1)%3],key=[pointKey(a),pointKey(b)].sort().join("|");
    if(!edges.has(key))edges.set(key,[]);edges.get(key)!.push({a,b,slot});
  }
  const cuts=new Map<string,{a:number;b:number;other:string}[]>();
  for(const entries of edges.values())if(entries.length===2&&entries[0].slot!==entries[1].slot)for(const edge of entries) {
    if(!cuts.has(edge.slot))cuts.set(edge.slot,[]);
    cuts.get(edge.slot)!.push({...edge,other:entries.find(e=>e!==edge)!.slot});
  }
  const caps:Mesh[]=[];
  for(const [slot,remaining]of cuts)while(remaining.length) {
    const first=remaining.pop()!,loop=[first.a,first.b],near=new Set([first.other]);
    while(pointKey(loop.at(-1)!)!==pointKey(loop[0])) {
      const key=pointKey(loop.at(-1)!),i=remaining.findIndex(e=>pointKey(e.a)===key||pointKey(e.b)===key);
      if(i<0)break;
      const edge=remaining.splice(i,1)[0];near.add(edge.other);loop.push(pointKey(edge.a)===key?edge.b:edge.a);
    }
    if(loop.length<4||pointKey(loop.at(-1)!)!==pointKey(loop[0]))continue;
    loop.pop();
    const vertex=new VertexData();vertex.positions=[];vertex.matricesIndices=[];vertex.matricesWeights=[];vertex.indices=[];vertex.normals=[];vertex.uvs=[];
    for(const i of loop) {
      vertex.positions.push(...points.slice(i*3,i*3+3));vertex.matricesIndices.push(...joints.slice(i*4,i*4+4));
      vertex.matricesWeights.push(...weights.slice(i*4,i*4+4));vertex.uvs.push(0,0);
    }
    // The convex fan closes a cut without changing any intact surface vertex.
    for(let i=1;i<loop.length-1;i++)vertex.indices.push(0,i+1,i);
    VertexData.ComputeNormals(vertex.positions,vertex.indices,vertex.normals);
    const cap=new Mesh(`${source.name}.cap.${slot}.${caps.length}`,source.getScene());vertex.applyToMesh(cap,true);
    cap.parent=source.parent;cap.position.copyFrom(source.position);cap.scaling.copyFrom(source.scaling);cap.rotationQuaternion=source.rotationQuaternion?.clone()??null;
    cap.skeleton=source.skeleton;cap.material=source.material;cap.computeBonesUsingShaders=false;cap.isVisible=false;
    cap.setEnabled(source.isEnabled());cap.metadata={humanSlot:slot,humanLayer:"body",humanCap:true,capNear:[...near]};caps.push(cap);
  }
  return caps;
}
