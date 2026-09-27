/** Optional research observer. Forward the exact existing callback once, then copy scalar
 * report evidence. No bounded Combat.log sampling and no changes to scoring or the recorder.
 * The caller must stop in finally before returning a fork to its pool.
 */
export function reportEvidence(side, event) {
  const r = event.report;
  return { side, hand: event.hand, effectorId: event.effectorId, blocked: event.blocked,
    guarded: event.guarded === true, at: r.at, weapon: r.weapon, key: r.key, kind: r.kind,
    speed: r.speed, closingSpeed: r.closingSpeed, energyJ: r.energyJ,
    edgeAlignment: r.edgeAlignment, bladeAlignment: r.bladeAlignment, tipDistanceM: r.tipDistanceM,
    preArmourDamage: r.preArmourDamage, postArmourDamage: r.postArmourDamage, damage: r.damage };
}

export function captureCombatReports(world) {
  const roots = world.forkWorld().roots;
  const reports = [], restores = [];
  for (const side of ["left", "right"]) {
    const combat = roots[`${side}Combat`];
    const original = combat.onReport;
    // onReport is a TypeScript-private field, reachable in this Node-only diagnostic.
    // Preserve the receiver as well as the callback's order and arguments.
    combat.onReport = function (event) {
      original?.call(this, event);
      reports.push(reportEvidence(side, event));
    };
    restores.push(() => { combat.onReport = original; });
  }
  return { reports, stop() { for (const restore of restores) restore(); } };
}
