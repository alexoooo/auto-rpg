import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate.js";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import { joint, registerPartBody } from "../../rig.ts";
import { COLLIDES, LAYER } from "../../physics.ts";
import { defineTerminal, effectorSlot } from "../module.ts";
import { materialForGolemRole } from "../materials.ts";
import { RigidStrike } from "../effectors/striker.ts";
import { socketShell } from "../effectors/shell.ts";

/** Coordinates relative to the anatomical wrist, shared by geometry and grip checks. */
export const HEATER_GRIP = new Vector3(0, -.073, 0);
export const HEATER_CENTRE = (side: number) => new Vector3(side * .08, .04, 0);

export const humanShield = defineTerminal({
  id: "plate", label: "strapped heater shield", sockets: 1, bite: "none", massKg: 3.5,
  attachment: "forearm", partRole: "equipment", limits: null,
  build(ctx, onto) {
    if (onto.kind !== "forearm") throw new Error("Heater shield requires forearm support");
    const name = `${ctx.name}.plate`, centre = HEATER_CENTRE(ctx.socket.outboard);
    const mesh = new Mesh(name, ctx.scene), data = new VertexData();
    // Convex heater outline: collision and visible board have the same taper.
    const outline = [[-.23,.30],[.23,.30],[.23,-.05],[0,-.34],[-.23,-.05]];
    const positions: number[] = [], indices: number[] = [], normals: number[] = [];
    for (const x of [-.015,.015]) for (const [y,z] of outline) positions.push(x,y,z);
    for (let i=1;i<4;i++) indices.push(0,i+1,i,5,5+i,6+i);
    for (let i=0;i<5;i++) { const j=(i+1)%5; indices.push(i,j,i+5,j,j+5,i+5); }
    VertexData.ComputeNormals(positions, indices, normals);
    data.positions=positions; data.indices=indices; data.normals=normals; data.applyToMesh(mesh);
    mesh.position.copyFrom(centre.rotateByQuaternionToRef(onto.rotation,new Vector3()).add(onto.world));
    mesh.rotationQuaternion=onto.rotation.clone(); mesh.material=materialForGolemRole(ctx.materials,"shell");
    const aggregate=new PhysicsAggregate(mesh,PhysicsShapeType.CONVEX_HULL,{mass:3.5,friction:.6,restitution:.05},ctx.scene);
    aggregate.shape.filterMembershipMask=ctx.layers.strike;
    aggregate.shape.filterCollideMask=ctx.layers.strikeCollidesWith;
    const part={name,mesh,body:aggregate.body,shape:aggregate.shape};
    // Its nearest box, for the effective mass a contact walks through: the board's thickness, width and height.
    registerPartBody({part,shape:{kind:"box",size:[.03,.46,.64]},massKg:3.5,centerOfMass:null});
    const weld=joint(ctx.scene,onto.link,part,{pivotParent:onto.pivot,pivotChild:centre.negate(),swing:{}});
    const grip=HEATER_GRIP.subtract(centre);
    const shell=[mesh,...socketShell(ctx.scene,{name:`${name}.handle`,host:mesh,materials:ctx.materials,
      radius:.012,from:grip.add(new Vector3(0,0,-.045)),to:grip.add(new Vector3(0,0,.045))})];
    for (const z of [-.045,.045]) shell.push(...socketShell(ctx.scene,{name:`${name}.handle-support.${z}`,host:mesh,materials:ctx.materials,
      radius:.009,from:grip.add(new Vector3(0,0,z)),to:new Vector3(-ctx.socket.outboard*.015,grip.y,z)}));
    // Two broad leather straps wrap the forearm. They carry no extra constraints.
    for (const y of [.08,.18]) {
      const strap=MeshBuilder.CreateTorus(`${name}.strap.${y}`,{diameter:.12,thickness:.014,tessellation:24},ctx.scene);
      strap.parent=mesh; strap.position.copyFrom(new Vector3(0,y,0).subtract(centre));
      strap.material=materialForGolemRole(ctx.materials,"shell"); shell.push(strap);
    }
    const striker=new RigidStrike(part,{kind:"empty",effectorId:`${name}.bash`,hand:effectorSlot(ctx.socket.slot),tipAlong:0});
    return { parts:[{id:name,part,shell,health:100,vitalityWeight:0,fatal:false,shield:true,combatRole:"equipment"}],
      strikers:[striker],tipOffset:0,gripStray:()=>null,
      sever(){striker.sever();part.shape.filterMembershipMask=LAYER.DEBRIS;part.shape.filterCollideMask=COLLIDES.DEBRIS;},
      dispose(){striker.sever();weld.dispose();part.body.dispose();part.shape.dispose();mesh.dispose(false,false);},
    };
  },
});
