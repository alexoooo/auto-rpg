import type { JointKinematics } from "../read-body.ts";
import type { DofSpec, JointSpec } from "../spec/body.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { cross, dot, normalize, orthogonalTo } from "../spec/vec.ts";

/**
 * The constraint frame for a joint's freedoms: X is the first freedom's axis, Y the second's (or
 * any square to X), and Z whatever the engine completes them with. `sign` says whether each
 * freedom's axis runs with its constraint axis or against it.
 *
 * The engine's Z is X cross Y in Babylon's components; `tests/core-build.test.mjs` drives each
 * axis both ways round and reads the turn back.
 */
function constraintAxes(dofs: readonly DofSpec[]): { readonly x: Vec3; readonly y: Vec3; readonly z: Vec3; readonly signs: readonly (1 | -1)[] } {
  if (dofs.length < 1 || dofs.length > 3) throw new Error(`a joint has one to three freedoms, not ${dofs.length}`);
  const x = normalize(dofs[0]!.axis.value);
  const y = dofs[1] ? normalize(dofs[1].axis.value) : orthogonalTo(Math.abs(x[1]) < Math.abs(x[0]) ? [0, 1, 0] : [1, 0, 0], x);
  const z = cross(x, y);
  const along = [x, y, z];
  const signs = dofs.map((dof, k) => {
    const alignment = dot(normalize(dof.axis.value), along[k]!);
    if (Math.abs(Math.abs(alignment) - 1) > 1e-9) throw new Error(`freedom ${dof.positive}'s axis is not square to the others`);
    return alignment > 0 ? 1 : -1;
  });
  return { x, y, z, signs };
}

/** `spec`'s kinematics: its constraint's axes (`constraintAxes`), and each freedom's sense about its axis. */
export function jointKinematics(spec: JointSpec): JointKinematics {
  const { x, y, z, signs } = constraintAxes(spec.dofs);
  return { spec, dofs: spec.dofs.map((dof, k) => ({ spec: dof, sign: signs[k]! })), axes: { x, y, z } };
}
