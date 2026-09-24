import type { CarrierProposal, HorizontalMove, StandableWorldRegistry } from "../supported-locomotion-runtime.ts";
import type { PhysicalSupportedLocomotionPort } from "../supported-locomotion-production.ts";

/** A common conservative time fraction prevents any pair crossing during the step. */
export function resolveGroupMoves(proposals: readonly CarrierProposal[], blocks: readonly boolean[],
  registry: StandableWorldRegistry): HorizontalMove[] {
  const moves = proposals.map(p => {
    const f = registry.allowedFraction(p.prior, p.next, p.footprint, p.ownerPartIds);
    let x = p.displacement.x * f, z = p.displacement.z * f;
    // Rock is axis-aligned cells, so the stopped remainder of an oblique move is offered back one
    // axis at a time: the component along a wall slides, the component into it stays refused.
    // Without this a move a few degrees into a wall is refused whole, the carrier's velocity is
    // zeroed, and it asks again from rest forever. A single-axis move has nothing to slide along.
    if (f < 1 && p.displacement.x !== 0 && p.displacement.z !== 0) for (const axis of ["x", "z"] as const) {
      const rest = p.displacement[axis] * (1 - f);
      const from = { x: p.prior.x + x, y: p.prior.y, z: p.prior.z + z };
      const to = axis === "x" ? { ...from, x: from.x + rest } : { ...from, z: from.z + rest };
      const g = registry.allowedFraction(from, to, p.footprint, p.ownerPartIds);
      if (axis === "x") x += rest * g; else z += rest * g;
    }
    return { x, z, yaw: p.displacement.yaw };
  });
  // Each constraint only shortens a displacement. Recheck because shortening one actor can
  // make the actor behind it collide. At the bounded limit, stop the still-conflicting group.
  for (let pass = 0; pass <= proposals.length * 2; pass++) {
    let changed = false;
    for (let a = 0; a < proposals.length; a++) for (let b = a + 1; b < proposals.length; b++) {
      if (!blocks[a] || !blocks[b]) continue;
      const pa = proposals[a], pb = proposals[b];
      const x = pa.prior.x - pb.prior.x, z = pa.prior.z - pb.prior.z;
      const dx = moves[a].x - moves[b].x, dz = moves[a].z - moves[b].z;
      const radius = pa.footprint.radiusM + pb.footprint.radiusM;
      const c = x * x + z * z - radius * radius, dot = x * dx + z * dz;
      if (dot >= 0) continue; // Existing overlaps may separate, never deepen.
      const speed2 = dx * dx + dz * dz;
      const discriminant = dot * dot - speed2 * c;
      if (speed2 < 1e-16 || discriminant < 0) continue;
      const at = c <= 0 ? 0 : (-dot - Math.sqrt(discriminant)) / speed2;
      if (at >= 1 || at < 0) continue;
      const fraction = pass === proposals.length * 2 ? 0 : Math.max(0, at - 1e-5);
      moves[a].x *= fraction; moves[a].z *= fraction;
      moves[b].x *= fraction; moves[b].z *= fraction;
      changed = true;
    }
    if (!changed) break;
  }
  return moves;
}

export function resolveDungeonLocomotion(ports: readonly PhysicalSupportedLocomotionPort[], dt: number): void {
  if (!ports.length) return;
  const registry = ports[0].registry;
  if (ports.some(p => p.registry !== registry)) throw new Error("Dungeon actors must share the world registry");
  const proposals = ports.map(p => p.proposal(dt));
  ports.forEach(p => p.updateGroupOccupancy(ports.filter(other => other !== p)));
  const moves = resolveGroupMoves(proposals, ports.map(p => p.blocksOpponentFootprint()), registry);
  ports.forEach((p, i) => p.commitPhysical(proposals[i], moves[i], dt));
}
