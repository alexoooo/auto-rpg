/**
 * **What a strike's profile is found by and came from**, one way for the rows of the Strike drill's
 * sparring (`strike-profiles.mjs`) and of a bout's strikes (`strike-bouts.mjs`, `bout-profiles.mjs`).
 */
import { skillsOf } from "../../../src/minds/option/assembly/skills.ts";
import { optionsOf } from "../../../src/minds/option/assembly/config.ts";
import { partLookup } from "../../../src/app/catalog.ts";
import { limbAction } from "../../../src/minds/option/options/strike-kinds.ts";
import { measuredOn, strikeSkill } from "../../../src/skills/framework/profile/lookup.ts";
import { skillDigest, specDigest } from "../profile-origin.mjs";
import { everyOf } from "../../../src/minds/option/assembly/pace.ts";

/**
 * **The strikes a record's `mind` throws on a body of `spec`**, its executors and their actions: as
 * its Options name them (`skillsOf`), or, in a record whose mind lists its executors and actions,
 * those the body can use, each on the limbs its executor strikes with as the body holds what it holds.
 */
export function strikesOf(spec, mind) {
  if (mind.kind === "option") return skillsOf(partLookup, spec, optionsOf(mind, partLookup));
  const executors = mind.executors.filter((executor) => partLookup.of("executor", executor).fits(spec, executor, partLookup) === null);
  const has = (limb) => spec.effectors?.some((one) => one.segment === limb) ?? false;
  return { executors, actions: (mind.actions ?? []).flatMap((action) => {
    const executor = executors.find((one) => one.name === action.executor);
    if (!executor) return [];
    const part = partLookup.of("executor", executor), effectors = action.effectors.filter((limb) => has(limb) && (part.strikesWith?.(spec, executor, limb) ?? true));
    return effectors.length === action.effectors.length ? [action] : effectors.length ? [{ ...action, effectors }] : [];
  }) };
}

/** The marks `action` aims at, or null where it aims at other regions too. */
export const marksOf = (action) => (action.regions ?? []).every((region) => region.kind === "mark") ? action.regions.map((region) => region.mark) : null;

/**
 * **A strike's profile key and origin**: `action` (one of `executors`') thrown with `effector` by a
 * body of `spec` whose mind is `mind`, in a world at `hz` whose commands land `delay` steps late,
 * its senses `reaction` s late. What it is measured as (`measuredOn`) and the digests of its body
 * and its skill (`Origin`). A strike's profile is measured against a foe, whose numbers each trial
 * records (`Start.struck`).
 */
export function strikeKey(spec, mind, executors, action, effector, hz, reaction, delay) {
  const limbed = limbAction(action, effector);
  return { measured: measuredOn(spec, { skill: strikeSkill(spec, executors, limbed), limb: effector }, { hz, reaction, rate: hz / everyOf(mind.rate, hz), delay }),
    digests: { spec: specDigest(spec), skill: skillDigest(partLookup, spec, executors, limbed) } };
}
