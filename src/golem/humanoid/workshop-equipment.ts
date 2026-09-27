import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate.js";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import { joint, registerPartBody } from "../../rig.ts";
import { COLLIDES, LAYER } from "../../physics.ts";
import { defineTerminal, effectorSlot, type EffectorTerminalDefinition } from "../module.ts";
import { TERMINAL_BLADE, TERMINAL_FIST } from "../config.ts";
import { bladeDefinition } from "../effectors/terminals/blade.ts";
import { RigidStrike } from "../effectors/striker.ts";
import { humanEquipment } from "./equipment.ts";
import { workshopSource, type WorkshopModel } from "./workshop-profile.ts";
import { attributeOf } from "../attributes.ts";
import { fistDefinition } from "../effectors/terminals/fist.ts";

/** Keep the board rigid, translating its grip onto the scaled hand at the wrist. */
export const workshopShieldShift = (size: number, model: WorkshopModel = "workshop-fighter") =>
  Vector3.FromArray(workshopSource(model).palm.secondary).add(new Vector3(0, -.045, 0)).scale(size - 1);

const bounds = (points: number[][]) => {
  const low = [0,1,2].map(i=>Math.min(...points.map(p=>p[i])));
  const high = [0,1,2].map(i=>Math.max(...points.map(p=>p[i])));
  return { centre: Vector3.FromArray(low.map((v,i)=>(v+high[i])/2)), size: Vector3.FromArray(high.map((v,i)=>v-low[i])), low, high };
};
export function workshopEquipmentProfile(model: WorkshopModel = "workshop-fighter") {
const WORKSHOP_SOURCE = workshopSource(model);
const sword = bounds(WORKSHOP_SOURCE.equipment.blade.points);
const WORKSHOP_SWORD = bladeDefinition(sword.low[2]-WORKSHOP_SOURCE.palm.primary[2], {
  ...TERMINAL_BLADE, width:sword.size.y, thickness:sword.size.x, length:sword.size.z, tipOffset:sword.size.z,
});
const shieldPoints = WORKSHOP_SOURCE.equipment.plate.points.map(p=>[p[0],p[1]-.045,p[2]]);
const WORKSHOP_SHIELD_BOUNDS = bounds(shieldPoints);
const WORKSHOP_SHIELD = defineTerminal({
  id:"plate", label:"Workshop heater shield", sockets:1, bite:"none", massKg:3.5,
  attachment:"forearm", partRole:"equipment", limits:null,
  build(ctx,onto) {
    if(onto.kind!=="forearm") throw new Error("Workshop shield requires forearm support");
    const name=`${ctx.name}.plate`, {size}=WORKSHOP_SHIELD_BOUNDS;
    const centre=WORKSHOP_SHIELD_BOUNDS.centre.add(workshopShieldShift(attributeOf(ctx,"size"), model));
    const mesh=new Mesh(name,ctx.scene), vertex=new VertexData();
    vertex.positions=shieldPoints.flatMap(p=>Vector3.FromArray(p).subtract(WORKSHOP_SHIELD_BOUNDS.centre).asArray());
    vertex.indices=[];for(let i=1;i<shieldPoints.length-1;i++)vertex.indices.push(0,i,i+1);
    vertex.normals=[];VertexData.ComputeNormals(vertex.positions,vertex.indices,vertex.normals);vertex.applyToMesh(mesh);
    mesh.position.copyFrom(centre.rotateByQuaternionToRef(onto.rotation,new Vector3()).add(onto.world));
    mesh.rotationQuaternion=onto.rotation.clone();
    const aggregate=new PhysicsAggregate(mesh,PhysicsShapeType.CONVEX_HULL,{mass:3.5,friction:.6,restitution:.05},ctx.scene);
    aggregate.shape.filterMembershipMask=ctx.layers.strike;aggregate.shape.filterCollideMask=ctx.layers.strikeCollidesWith;
    const part={name,mesh,body:aggregate.body,shape:aggregate.shape};
    registerPartBody({part,shape:{kind:"box",size:[size.x,size.y,size.z]},massKg:3.5,centerOfMass:null});
    const weld=joint(ctx.scene,onto.link,part,{pivotParent:onto.pivot,pivotChild:centre.negate(),swing:{}});
    const striker=new RigidStrike(part,{kind:"empty",effectorId:`${name}.bash`,hand:effectorSlot(ctx.socket.slot),tipAlong:0});
    return {parts:[{id:name,part,shell:[],health:100,vitalityWeight:0,fatal:false,shield:true,combatRole:"equipment"}],
      strikers:[striker],tipOffset:0,gripStray:()=>null,
      sever(){striker.sever();part.shape.filterMembershipMask=LAYER.DEBRIS;part.shape.filterCollideMask=COLLIDES.DEBRIS;},
      dispose(){striker.sever();weld.dispose();part.body.dispose();part.shape.dispose();mesh.dispose(false,false);}};
  },
});
return { WORKSHOP_SWORD, WORKSHOP_SHIELD, WORKSHOP_SHIELD_BOUNDS };
}
export const { WORKSHOP_SWORD, WORKSHOP_SHIELD, WORKSHOP_SHIELD_BOUNDS } = workshopEquipmentProfile();
export function workshopEquipment(terminal: EffectorTerminalDefinition, size = 1, weight = 1, model: WorkshopModel = "workshop-fighter"): EffectorTerminalDefinition {
  const {WORKSHOP_SWORD,WORKSHOP_SHIELD} = workshopEquipmentProfile(model);
  switch(terminal.id) {
    case "blade": return { ...WORKSHOP_SWORD, attachment:"hand" };
    case "plate": return WORKSHOP_SHIELD;
    case "fist": return size === 1 && weight === 1 ? humanEquipment(terminal) : {
      ...humanEquipment(terminal), ...fistDefinition({ ...TERMINAL_FIST, radius: .045 * size, mass: .35 * weight * size ** 3 }),
      attachment: "hand", partRole: "body", appearance: "human", label: "Empty hand",
    };
    default: throw new Error(`Workshop fighter does not support ${terminal.id}`);
  }
}
