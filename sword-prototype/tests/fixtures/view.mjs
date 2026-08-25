/**
 * What a hand-rolled `FighterView` has to carry, and the check that says so.
 *
 * Every fixture in `minds`, `options` and `learning` is a plain object claiming
 * to be a `FighterView`, and nothing checks that claim: the tests are `.mjs`,
 * `tsc --noEmit` never sees them, and a field a fixture leaves out arrives at the
 * code under test as `undefined`.
 *
 * That is not a theoretical hazard, it is what session 16 cost. Four things the
 * policies now read were absent from every fixture in the directory --
 * `FighterView.projectiles`, `HandView.tipVelocity`, `BodyView.vitalHeight` and
 * `BodyView.collisionRadius` -- and exactly one of them threw. The other three
 * became `NaN`, and `NaN` loses every comparison in `selectThreat` silently and
 * is scrubbed to zero by `clampAction` on its way into a feature column. So the
 * loud one took sixty-six tests red and the quiet ones would have gone on
 * passing while asserting nothing at all, which `AGENTS.md` names as the worst
 * defect this tree produces.
 *
 * Hence one list, here, and a fixture that runs through it at the moment it is
 * built rather than at the moment somebody reads a wrong number. The lists
 * themselves are a hand-maintained copy of a contract, which is the *other*
 * failure this repository has a rule about -- so they are not trusted either:
 * `a_hand_rolled_fixture_carries_every_field_a_real_view_does` in
 * `tests/view.test.mjs` compares them against the key sets a real `Fighter`
 * publishes into a real view, and a field added to `mind.ts` and forgotten here
 * fails there.
 *
 * Deliberately dependency-free. `minds.test.mjs` states that no Babylon, scene,
 * bout or solver appears anywhere in its import graph, and that property is what
 * lets a whole cycle of a policy's cadence be stepped in a fraction of a
 * millisecond; a fixture helper that imported the view it describes would end
 * that.
 */

/** `HandView`. `tipVelocity` is session 16's; the rest predate it. */
export const HAND_FIELDS = Object.freeze(
  ["weapon", "shoulder", "tip", "tipSpeed", "tipVelocity", "reach", "lost", "outboard"].sort(),
);

/** `ProjectileView`. */
export const PROJECTILE_FIELDS = Object.freeze(
  ["kind", "owner", "position", "velocity", "age"].sort(),
);

/** `BodyView`, which `SelfView` is an alias of. */
export const BODY_FIELDS = Object.freeze([
  "unit", "reach", "crownHeight", "vitalHeight", "collisionRadius", "naturalAttacks",
  "ground", "facing", "shoulder", "tip", "tipSpeed", "hands",
  "crouch", "trunkLean", "trunkTwist", "vitality", "health",
].sort());

/** `FighterView`. */
export const VIEW_FIELDS = Object.freeze(
  ["self", "opponent", "projectiles", "measure", "clock"].sort(),
);

const finite = (value, label) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} is ${value}, and a view publishes a finite number there`);
  }
};
const point = (value, label) => {
  if (!value || typeof value !== "object") throw new Error(`${label} is ${value}, not a point`);
  for (const axis of ["x", "y", "z"]) finite(value[axis], `${label}.${axis}`);
};
const flag = (value, label) => {
  if (typeof value !== "boolean") throw new Error(`${label} is ${value}, and a view publishes a boolean there`);
};
/**
 * Exact key equality, both directions.
 *
 * A missing field is the failure this exists for; an unexpected one is worth
 * refusing for the reason `a_combat_intent_contains_no_camera_state` gives about
 * commands. A fixture that carries a field the view does not have is a fixture
 * arguing with the policy over a fact the arena would never hand it.
 */
const exactly = (object, fields, label) => {
  if (!object || typeof object !== "object") throw new Error(`${label} is ${object}, not a record`);
  const present = new Set(Object.keys(object));
  const missing = fields.filter((name) => !present.has(name));
  const extra = [...present].filter((name) => !fields.includes(name));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(`${label} is not a complete view record: missing ${JSON.stringify(missing)}, ` +
      `unexpected ${JSON.stringify(extra)}`);
  }
};

export function assertCompleteHand(hand, label) {
  exactly(hand, HAND_FIELDS, label);
  if (typeof hand.weapon !== "string") throw new Error(`${label}.weapon is ${hand.weapon}`);
  point(hand.shoulder, `${label}.shoulder`);
  point(hand.tip, `${label}.tip`);
  point(hand.tipVelocity, `${label}.tipVelocity`);
  finite(hand.tipSpeed, `${label}.tipSpeed`);
  finite(hand.reach, `${label}.reach`);
  finite(hand.outboard, `${label}.outboard`);
  flag(hand.lost, `${label}.lost`);
}

export function assertCompleteProjectile(shot, label) {
  exactly(shot, PROJECTILE_FIELDS, label);
  if (shot.kind !== "arrow") throw new Error(`${label}.kind is ${shot.kind}`);
  if (shot.owner !== "self" && shot.owner !== "opponent") throw new Error(`${label}.owner is ${shot.owner}`);
  point(shot.position, `${label}.position`);
  point(shot.velocity, `${label}.velocity`);
  finite(shot.age, `${label}.age`);
}

/**
 * `hands` may be empty and that is not incompleteness.
 *
 * A centipede has none, publishes `NO_HANDS`, and every policy in the tree is
 * expected to cope -- so the fixtures that stand in for one say `{}` and mean
 * it. What is refused is a *half* hand: a record with some of the eight fields.
 */
export function assertCompleteBody(body, label) {
  exactly(body, BODY_FIELDS, label);
  if (typeof body.unit !== "string") throw new Error(`${label}.unit is ${body.unit}`);
  for (const key of ["reach", "crownHeight", "vitalHeight", "collisionRadius", "facing",
    "tipSpeed", "crouch", "trunkLean", "trunkTwist", "vitality"]) {
    finite(body[key], `${label}.${key}`);
  }
  point(body.ground, `${label}.ground`);
  point(body.shoulder, `${label}.shoulder`);
  point(body.tip, `${label}.tip`);
  if (!body.naturalAttacks || typeof body.naturalAttacks !== "object") {
    throw new Error(`${label}.naturalAttacks is ${body.naturalAttacks}; a body with no jaws publishes {}`);
  }
  for (const [name, attack] of Object.entries(body.naturalAttacks)) {
    finite(attack?.reach, `${label}.naturalAttacks.${name}.reach`);
    flag(attack.ready, `${label}.naturalAttacks.${name}.ready`);
    flag(attack.active, `${label}.naturalAttacks.${name}.active`);
  }
  if (!body.health || typeof body.health !== "object") throw new Error(`${label}.health is ${body.health}`);
  for (const [name, hand] of Object.entries(body.hands)) assertCompleteHand(hand, `${label}.hands.${name}`);
}

/**
 * A real published view, flattened into something a test can keep and mutate.
 *
 * A view a `Fighter` wrote is a scratch record it overwrites every step, and its
 * points are Babylon `Vector3`s -- which in 9.18.1 store `_x/_y/_z` behind
 * accessors on the prototype. `structuredClone` copies own data properties and
 * nothing else, so a cloned view comes back with every point spelled `_x` and
 * every reader of `.x` gets `undefined`: measured on a real bout, the clone
 * fails `assertCompleteView` at `self.ground.x`, and a fixture that skipped that
 * check would have gone on to compute `NaN` distances in silence. So the points
 * are read through their accessors here and written as plain `{x, y, z}`.
 *
 * The reason to take a fixture from a bout at all rather than writing one out is
 * the reason the schedule/mask test runs Havok: a hand-rolled body is a second
 * claim about what a body publishes, and the defects worth testing for are
 * claims about a body that were wrong. What a test then does to it -- severing a
 * hand, say -- is one stated edit to a real record instead of a whole invented
 * one.
 */
export function publishedFixture(view, label = "published view") {
  const point = (value) => ({ x: value.x, y: value.y, z: value.z });
  const hand = (value) => ({ ...value, shoulder: point(value.shoulder), tip: point(value.tip),
    tipVelocity: point(value.tipVelocity) });
  const body = (value) => ({ ...value, ground: point(value.ground), shoulder: point(value.shoulder),
    tip: point(value.tip), health: { ...value.health },
    naturalAttacks: Object.fromEntries(Object.entries(value.naturalAttacks ?? {}).map(([name, attack]) => [name, { ...attack }])),
    hands: Object.fromEntries(Object.entries(value.hands).map(([name, slot]) => [name, hand(slot)])) });
  return assertCompleteView({ ...view, self: body(view.self), opponent: body(view.opponent),
    projectiles: view.projectiles.map((shot) => ({ ...shot, position: point(shot.position), velocity: point(shot.velocity) })) }, label);
}

/** The whole thing. Returns the view, so a fixture can `return complete(view)`. */
export function assertCompleteView(view, label = "view") {
  exactly(view, VIEW_FIELDS, label);
  assertCompleteBody(view.self, `${label}.self`);
  assertCompleteBody(view.opponent, `${label}.opponent`);
  if (!Array.isArray(view.projectiles)) {
    throw new Error(`${label}.projectiles is ${view.projectiles}; a body with no bow publishes []`);
  }
  view.projectiles.forEach((shot, index) => assertCompleteProjectile(shot, `${label}.projectiles[${index}]`));
  finite(view.measure, `${label}.measure`);
  finite(view.clock, `${label}.clock`);
  return view;
}
