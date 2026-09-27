import type { GolemSetup } from "./bout.ts";
import type { BodyView, Policy } from "./mind.ts";
import { hasPoint, type WeaponKind } from "./hands.ts";
import { golemEffector, golemSetupRefusal } from "./golem/build.ts";
import { EFFECTOR_CHAINS } from "./golem/registry.ts";
import { bodyFamily } from "./golem/family.ts";

/**
 * What a policy needs of the body before the picker offers it. Only `bow` is declared today; the
 * hand and blade requirements of the researched specialists, and the `fallback-only` status they
 * fell back through, went with those minds on 2026-09-27 (tag `pre-next-phase-cleanup`).
 */
export type PolicyRequirement = "bow";
export type Applicability = { status: "applicable" | "incompatible"; reason: string };
export interface PolicyBody {
  pairedHands: boolean;
  primary: { thrust: boolean; aiming: boolean; pointed: boolean; lost: boolean; weapon: WeaponKind };
  secondary: { thrust: boolean; aiming: boolean; pointed: boolean; lost: boolean; weapon: WeaponKind };
}

/** Read declarations owned by the chains; no physics world is needed by setup. */
export function policyBodyForSetup(build: GolemSetup): PolicyBody {
  const refusal = golemSetupRefusal(build);
  if (refusal) throw new Error(refusal);
  const hand = (slot: "primary" | "secondary") => {
    const pick = build[slot], option = golemEffector(pick.chain, pick.terminal)!;
    const chain = EFFECTOR_CHAINS[option.chain];
    return { thrust: option.terminal !== "bow" && chain.strokes.includes("thrust"), aiming: chain.pointTarget,
      pointed: hasPoint(option.weapon), lost: false, weapon: option.weapon };
  };
  return { pairedHands: golemEffector(build.primary.chain, build.primary.terminal)!.sockets === 2,
    primary: hand("primary"), secondary: hand("secondary") };
}

export function policyBodyForView(self: BodyView): PolicyBody | null {
  const caps = self.capabilities;
  if (!caps) return null;
  const hand = (slot: "primary" | "secondary") => ({
    thrust: caps.effectors[slot].strokes.includes("thrust"),
    aiming: caps.effectors[slot].reachable !== null,
    pointed: hasPoint(self.hands[slot].weapon), lost: self.hands[slot].lost, weapon: self.hands[slot].weapon,
  });
  return { pairedHands: caps.pairedHands, primary: hand("primary"), secondary: hand("secondary") };
}

export function assessRequirement(requirement: PolicyRequirement | undefined, body: PolicyBody | null): Applicability {
  if (!requirement) return { status: "applicable", reason: "" };
  if (!body) return { status: "incompatible", reason: "This policy requires golem body capabilities." };
  switch (requirement) {
    case "bow":
      return body.pairedHands && body.primary.weapon === "bow" && !body.primary.lost && !body.secondary.lost
        ? { status: "applicable", reason: "" }
        : { status: "incompatible", reason: "Requires a bow and both arms." };
    default: {
      const unknown: never = requirement;
      throw new Error(`no rule for policy requirement ${String(unknown)}`);
    }
  }
}

/** Unit admission is supplied by the existing registry, never approximated here. */
export function assessPolicy(policy: Pick<Policy, "requirement" | "surface" | "bodyFamily"> | undefined, admitted: boolean,
  build: GolemSetup | undefined): Applicability {
  if (!policy || !admitted) return { status: "incompatible", reason: "This body's control interface does not support the policy." };
  const refusal = build ? golemSetupRefusal(build) : null;
  if (refusal) return { status: "incompatible", reason: refusal };
  // Evidence, not capability: a golem policy can drive a human body, but nothing measured it there.
  if (build && policy.surface !== null) {
    const built = policy.bodyFamily ?? "golem", family = bodyFamily(build);
    if (built !== family) return { status: "incompatible", reason: `Built and measured on ${built} bodies; not evaluated on ${family} bodies.` };
  }
  return assessRequirement(policy.requirement, build ? policyBodyForSetup(build) : null);
}

export function policyPickerRows<T extends { name: string; label: string; assessment: Applicability }>(
  rows: readonly T[], selected: string, showAll: boolean,
): T[] {
  return rows.filter((row) => showAll || row.name === selected || row.assessment.status === "applicable");
}
