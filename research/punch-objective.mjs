/**
 * **What a punch is worth in the game**: a fist that reaches a target is priced as the arena prices
 * a blow on a standing foe's head (`watchBlows`, `src/core/rules/blows.ts`). The fist meets what
 * its body gives along its approach with its muscles holding at the bounds they had that step;
 * the head, what a Warrior standing in guard gives with its own. The two meet over the time their
 * surfaces in series take (`contactGive`), their energy is the closing speed's over the two masses,
 * the surfaces share it by compliance (`energyShares`), and each side's share is damage by the
 * rulebook, the fist's less its threshold (`Rulebook.fist`).
 *
 * The score is the exchange: the hit points the head loses less the ones the fist loses. A blow
 * that brings the fist past its threshold costs it more than it gives the head, so the exchange
 * peaks where the fist's share meets the threshold: what a better punch buys is to reach that,
 * not to pass it.
 *
 * Harness: Node, the core's world on Rapier (`DEFAULT_ENGINE`), the struck body built in its guard
 * and held there by the combat skills for `SETTLE` s at the rate asked.
 */
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { createBody, SERVO_SECONDS } from "../src/core/body.ts";
import { contactGive, contactMass } from "../src/core/build/contact-mass.ts";
import { centreOfToRef } from "../src/core/control/support.ts";
import { DEFAULT_ENGINE } from "../src/core/engine/engines.ts";
import { NO_COVER } from "../src/core/mind/intent.ts";
import { modelSpec } from "../src/core/models.ts";
import { holdsOf, seriesStiffness } from "../src/core/rules/blows.ts";
import { impactEnergy } from "../src/core/rules/impact.ts";
import { blowDamage, rulebook } from "../src/core/rules/rulebook.ts";
import { energyShares } from "../src/core/rules/share.ts";
import { combatSkills } from "../src/core/skills/combat.ts";
import { guardPosture } from "../src/core/skills/guard.ts";
import { coreStand } from "../tests/harness/core-stand.mjs";

/** How long the struck body stands in guard before it is read, s. */
const SETTLE = 1;

/**
 * The struck head of a `model` standing in guard: how it gives to a push into its face through its
 * centre (backward, along -z: it faces +z), with its muscles holding at the guard's bounds; its free
 * mass there, and its surface's stiffness, N/m. The yield is plain numbers, read once.
 */
export async function referenceHead({ model = "workshop-fighter", physique, part = "head", hz = 120 } = {}) {
  const spec = modelSpec(model, physique), s = await coreStand(spec, { engine: DEFAULT_ENGINE, hz, posture: guardPosture(spec) });
  const body = createBody(s.built, s.world, { servoSeconds: SERVO_SECONDS, feedback: true }), skills = combatSkills(body, {});
  body.drive((view, dt) => skills.command(view, { move: null, face: 0, guard: NO_COVER, attack: null }, dt));
  try {
    for (let i = 0; i < Math.round(SETTLE * hz); i++) s.world.step();
    if (body.view.down) throw new Error(`${model} did not stand in guard for ${SETTLE} s`);
    const head = s.built.segments.get(part), masses = contactMass(s.built), point = centreOfToRef(head, new Vector3()).asArray();
    masses.update();
    const give = masses.yielding(head, point, [0, 0, -1], holdsOf(body.muscles));
    return { model, part, freeKg: masses.along(head, point, [0, 0, -1]), stiffness: head.spec.surface.stiffness.value,
      give: { impulse: [...give.impulse], change: [...give.change], slope: give.slope } };
  } finally { body.dispose?.(); s.dispose(); }
}

/**
 * A fist's blow on `head` (`referenceHead`) at `closing` m/s: `fist` is its yield
 * (`ContactMass.yielding` with its body's holds) and `fistStiffness` its surface's. The masses each
 * side met, the energy, each side's share and hit points lost, and the exchange.
 */
export function pricePunch({ fist, fistStiffness, head, closing, rules = rulebook("arena") }) {
  const give = contactGive(fist, head.give, closing, seriesStiffness([fistStiffness, head.stiffness]));
  const energy = impactEnergy(give.aKg, give.bKg, closing), [fistShare, headShare] = energyShares([fistStiffness, head.stiffness]);
  const headHp = blowDamage(rules, "blunt", headShare * energy), fistHp = blowDamage(rules, "blunt", Math.max(0, fistShare * energy - rules.fist.value));
  return { fistKg: give.aKg, headKg: give.bKg, energy, fistShare, headHp, fistHp, exchange: headHp - fistHp };
}
