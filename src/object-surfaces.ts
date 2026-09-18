import type { Material } from "@babylonjs/core/Materials/material.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";

export interface ObjectMaterials {
  steel: Material;
  edge: Material;
  brass: Material;
  leather: Material;
  wood: Material;
  paintedWood: Material;
  bowString: Material;
  arrowAccent: Material;
}

export type ObjectSurfaceFamily = keyof ObjectMaterials;
export type GrainDirection = "none" | "long" | "around" | "board";

const PARTS = [
  "sword.blade", "sword.point", "sword.guard", "sword.grip", "sword.pommel",
  "shield.plate", "shield.rim", "shield.boss", "shield.grip",
  "buckler.plate", "buckler.rim", "buckler.boss", "buckler.grip",
  "axe.haft", "axe.wrap", "axe.eye", "axe.bit", "axe.edge",
  "bow.stave", "bow.tipA", "bow.tipB", "bow.grip", "bow.stringA", "bow.stringB", "bow.nocked",
  "club.haft", "club.head", "club.band0", "club.band1", "club.wrap",
  "arrow.shaft", "arrow.head", "arrow.fletch", "arrow.trace",
  "arena.post",
] as const;

export type ObjectPart = (typeof PARTS)[number];
export interface ObjectSurfaceAssignment {
  family: ObjectSurfaceFamily;
  grain: GrainDirection;
  /** Clockwise quarter turns around the centre of Babylon's generated UV set. */
  quarterTurns: 0 | 1 | 2 | 3;
}

/**
 * The complete visual assignment for Babylon-built combat objects. Geometry,
 * collision and scoring deliberately have no entry here: this table can alter
 * only an existing mesh's UV coordinates and shared material reference.
 */
export const OBJECT_PART_SURFACES = {
  "sword.blade": { family: "edge", grain: "none", quarterTurns: 0 },
  "sword.point": { family: "edge", grain: "none", quarterTurns: 0 },
  "sword.guard": { family: "brass", grain: "none", quarterTurns: 0 },
  "sword.grip": { family: "leather", grain: "around", quarterTurns: 1 },
  "sword.pommel": { family: "brass", grain: "none", quarterTurns: 0 },
  "shield.plate": { family: "paintedWood", grain: "board", quarterTurns: 1 },
  "shield.rim": { family: "steel", grain: "none", quarterTurns: 0 },
  "shield.boss": { family: "edge", grain: "none", quarterTurns: 0 },
  "shield.grip": { family: "leather", grain: "around", quarterTurns: 1 },
  "buckler.plate": { family: "steel", grain: "none", quarterTurns: 0 },
  "buckler.rim": { family: "brass", grain: "none", quarterTurns: 0 },
  "buckler.boss": { family: "edge", grain: "none", quarterTurns: 0 },
  "buckler.grip": { family: "leather", grain: "around", quarterTurns: 1 },
  "axe.haft": { family: "wood", grain: "long", quarterTurns: 0 },
  "axe.wrap": { family: "leather", grain: "around", quarterTurns: 1 },
  "axe.eye": { family: "steel", grain: "none", quarterTurns: 0 },
  "axe.bit": { family: "edge", grain: "none", quarterTurns: 0 },
  "axe.edge": { family: "edge", grain: "none", quarterTurns: 0 },
  "bow.stave": { family: "wood", grain: "long", quarterTurns: 1 },
  "bow.tipA": { family: "leather", grain: "around", quarterTurns: 1 },
  "bow.tipB": { family: "leather", grain: "around", quarterTurns: 1 },
  "bow.grip": { family: "leather", grain: "around", quarterTurns: 1 },
  "bow.stringA": { family: "bowString", grain: "none", quarterTurns: 0 },
  "bow.stringB": { family: "bowString", grain: "none", quarterTurns: 0 },
  "bow.nocked": { family: "arrowAccent", grain: "long", quarterTurns: 0 },
  "club.haft": { family: "wood", grain: "long", quarterTurns: 0 },
  "club.head": { family: "wood", grain: "long", quarterTurns: 0 },
  "club.band0": { family: "steel", grain: "none", quarterTurns: 0 },
  "club.band1": { family: "steel", grain: "none", quarterTurns: 0 },
  "club.wrap": { family: "leather", grain: "around", quarterTurns: 1 },
  "arrow.shaft": { family: "wood", grain: "long", quarterTurns: 0 },
  "arrow.head": { family: "arrowAccent", grain: "none", quarterTurns: 0 },
  "arrow.fletch": { family: "arrowAccent", grain: "none", quarterTurns: 0 },
  "arrow.trace": { family: "arrowAccent", grain: "none", quarterTurns: 0 },
  "arena.post": { family: "wood", grain: "long", quarterTurns: 0 },
} as const satisfies Record<ObjectPart, ObjectSurfaceAssignment>;

const LONG_GRAIN_TURNS = new Map<ObjectPart, number>([
  ["axe.haft", 0], ["bow.stave", 1], ["club.haft", 0], ["club.head", 0],
  ["arrow.shaft", 0], ["arena.post", 0],
]);
const BOARD_GRAIN_TURNS = new Map<ObjectPart, number>([["shield.plate", 1]]);

export function validateObjectSurfaceTable(
  table: Record<string, ObjectSurfaceAssignment>,
): string[] {
  const failures: string[] = [];
  const expected = new Set<string>(PARTS);
  const known = new Set<ObjectSurfaceFamily>([
    "steel", "edge", "brass", "leather", "wood", "paintedWood", "bowString", "arrowAccent",
  ]);
  for (const part of PARTS) {
    const row = table[part];
    if (!row) {
      failures.push(`${part} has no surface assignment`);
      continue;
    }
    if (!known.has(row.family)) failures.push(`${part} names unknown surface ${String(row.family)}`);
    const expectedTurns = LONG_GRAIN_TURNS.get(part);
    if (expectedTurns !== undefined && (row.grain !== "long" || row.quarterTurns !== expectedTurns)) {
      failures.push(`${part} wood grain does not run along its long axis`);
    }
    const expectedBoardTurns = BOARD_GRAIN_TURNS.get(part);
    if (expectedBoardTurns !== undefined && (row.grain !== "board" || row.quarterTurns !== expectedBoardTurns)) {
      failures.push(`${part} painted-board grain does not run along its long axis`);
    }
  }
  for (const part of Object.keys(table)) if (!expected.has(part)) failures.push(`${part} is not a built object part`);
  return failures;
}

function rotateUvs(mesh: Mesh, quarterTurns: number): void {
  const turns = ((quarterTurns % 4) + 4) % 4;
  if (turns === 0) return;
  const uvs = mesh.getVerticesData(VertexBuffer.UVKind);
  if (!uvs) return;
  const rotated = [...uvs];
  for (let i = 0; i < rotated.length; i += 2) {
    let u = uvs[i] - 0.5;
    let v = uvs[i + 1] - 0.5;
    for (let turn = 0; turn < turns; turn += 1) [u, v] = [v, -u];
    rotated[i] = u + 0.5;
    rotated[i + 1] = v + 0.5;
  }
  mesh.setVerticesData(VertexBuffer.UVKind, rotated, false, 2);
}

/** Apply one table row without creating meshes, bodies, shapes or materials. */
export function applyObjectSurface(
  mesh: Mesh,
  part: ObjectPart,
  materials: ObjectMaterials,
): void {
  const assignment = OBJECT_PART_SURFACES[part];
  rotateUvs(mesh, assignment.quarterTurns);
  mesh.material = materials[assignment.family];
  mesh.metadata = { ...(mesh.metadata ?? {}), objectSurfacePart: part };
}

/** Carried objects borrow arena materials, so their root must never dispose them. */
export function disposeCarriedRoot(root: TransformNode): void {
  root.dispose(false, false);
}
