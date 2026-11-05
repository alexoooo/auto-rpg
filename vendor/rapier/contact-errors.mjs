/** Report a JavaScript contact-material defect after Rust has released its step's borrows. */
export function reportContactErrors(PhysicsPipeline) {
  const step = PhysicsPipeline.prototype.step;
  PhysicsPipeline.prototype.step = function (gravity, parameters, islands, broad, narrow, bodies, colliders, softBodies, joints, multibody, ccd, events, hooks) {
    const layer = hooks?.contactLayer;
    if (!layer) return step.call(this, gravity, parameters, islands, broad, narrow, bodies, colliders, softBodies, joints, multibody, ccd, events, hooks);
    let failed = false, failure;
    const guarded = Object.create(hooks), contact = hooks.filterContactPair, intersection = hooks.filterIntersectionPair;
    Object.defineProperty(guarded, "contactLayer", { value: function (...args) {
      if (failed) return null;
      try { return layer.apply(hooks, args); }
      catch (error) { failed = true; failure = error; return null; }
    } });
    if (contact) Object.defineProperty(guarded, "filterContactPair", { value: (...args) => contact.apply(hooks, args) });
    if (intersection) Object.defineProperty(guarded, "filterIntersectionPair", { value: (...args) => intersection.apply(hooks, args) });
    try { return step.call(this, gravity, parameters, islands, broad, narrow, bodies, colliders, softBodies, joints, multibody, ccd, events, guarded); }
    finally { if (failed) throw failure; }
  };
}
