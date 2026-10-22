/**
 * **The stub end rule** (`EndRule`, `src/arena/end-rule.ts`): a side whose body's centre of mass
 * leaves a ring round the stage's centre is out, rung out. Registered from outside `src/` by a
 * line of the end rules list (`ends.mjs`).
 */
export const STUB_RING = Object.freeze({
  label: "Ring out", defaults: Object.freeze({ kind: "stub-ring", radius: 2 }),
  out: (one, config) => {
    let x = 0, z = 0, mass = 0;
    for (const segment of one.built.segments.values()) {
      const { position } = segment.node, m = segment.rigid.mass;
      x += position.x * m; z += position.z * m; mass += m;
    }
    return (x / mass) * (x / mass) + (z / mass) * (z / mass) > config.radius * config.radius ? "rung out" : null;
  },
  endings: Object.freeze({ "rung out": "by leaving the ring" }),
});
