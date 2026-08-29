import { canonicalIntegrityJson, integrityDigest, type IntegrityValue } from "./integrity.ts";

export const CONSTRUCT_PLAYTEST_PROTOCOL_VERSION = 1 as const;

/** Frozen before any learned candidate is eligible to appear in the driver picker. */
export const CONSTRUCT_PLAYTEST_PROTOCOL = Object.freeze({
  version: CONSTRUCT_PLAYTEST_PROTOCOL_VERSION,
  assignments: Object.freeze([
    Object.freeze({ id: "build-four-limb", task: "Build a four-limb body from catalog parts and explain what makes each limb a leg." }),
    Object.freeze({ id: "swap-mount", task: "Replace the dorsal launcher with a sword without changing the mount group." }),
    Object.freeze({ id: "author-action", task: "Bind one locomotion action and one mounted attack through compatible groups." }),
    Object.freeze({ id: "repair-mind", task: "Run the weak authored Mind, diagnose one refusal or stuck action, and revise one rule." }),
  ]),
  questions: Object.freeze([
    "Why did these parts become legs or a turret without hidden part types?",
    "What physical consequence did your body change produce?",
    "Where did you find the reason an action was refused or stuck?",
    "Did your hardware, action, or Mind revision improve the auto-battle?",
    "Did the machine appear to think with your design rather than wear it as a skin?",
    "Was construction and programming enjoyable before progression rewards existed?",
  ]),
});

export const CONSTRUCT_PLAYTEST_PROTOCOL_DIGEST = integrityDigest(
  canonicalIntegrityJson(CONSTRUCT_PLAYTEST_PROTOCOL as unknown as IntegrityValue),
);

