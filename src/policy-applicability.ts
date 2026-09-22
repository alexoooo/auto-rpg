import type { GolemSetup } from "./bout.ts";
import type { BodyView, Policy } from "./mind.ts";
import { hasPoint } from "./hands.ts";
import { golemEffector, golemSetupRefusal } from "./golem/build.ts";
import { EFFECTOR_CHAINS } from "./golem/registry.ts";

export type PolicyRequirement = "independent-hands" | "point-primary";
export type Applicability = { status: "applicable" | "fallback-only" | "incompatible"; reason: string };
export interface PolicyBody {
  pairedHands: boolean;
  primary: { thrust: boolean; aiming: boolean; pointed: boolean; lost: boolean };
  secondary: { thrust: boolean; aiming: boolean; pointed: boolean; lost: boolean };
}

/** Read declarations owned by the chains; no physics world is needed by setup. */
export function policyBodyForSetup(build: GolemSetup): PolicyBody {
  const refusal = golemSetupRefusal(build);
  if (refusal) throw new Error(refusal);
  const hand = (slot: "primary" | "secondary") => {
    const pick = build[slot], option = golemEffector(pick.chain, pick.terminal)!;
    const chain = EFFECTOR_CHAINS[option.chain];
    return { thrust: chain.strokes.includes("thrust"), aiming: chain.pointTarget,
      pointed: hasPoint(option.weapon), lost: false };
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
    pointed: hasPoint(self.hands[slot].weapon), lost: self.hands[slot].lost,
  });
  return { pairedHands: caps.pairedHands, primary: hand("primary"), secondary: hand("secondary") };
}

export function assessRequirement(requirement: PolicyRequirement | undefined, body: PolicyBody | null): Applicability {
  if (!requirement) return { status: "applicable", reason: "" };
  if (!body) return { status: "incompatible", reason: "This policy requires golem body capabilities." };
  let reason: string;
  switch (requirement) {
    case "independent-hands":
      if (!body.pairedHands && !body.primary.lost && !body.secondary.lost
        && body.primary.thrust && body.secondary.thrust) return { status: "applicable", reason: "" };
      reason = "Requires two independent, present hands that support thrust commands.";
      break;
    case "point-primary":
      if (!body.pairedHands && !body.primary.lost && body.primary.thrust
        && body.primary.aiming && body.primary.pointed) return { status: "applicable", reason: "" };
      reason = "Requires an aimable, pointed primary weapon with thrust control and an independent grip.";
      break;
  }
  return { status: "fallback-only", reason: `${reason} Otherwise uses Duelist behavior.` };
}

/** Unit admission is supplied by the existing registry, never approximated here. */
export function assessPolicy(policy: Pick<Policy, "requirement"> | undefined, admitted: boolean,
  build: GolemSetup | undefined): Applicability {
  if (!policy || !admitted) return { status: "incompatible", reason: "This body's control interface does not support the policy." };
  const refusal = build ? golemSetupRefusal(build) : null;
  if (refusal) return { status: "incompatible", reason: refusal };
  return assessRequirement(policy.requirement, build ? policyBodyForSetup(build) : null);
}

export function policyPickerRows<T extends { name: string; label: string; assessment: Applicability }>(
  rows: readonly T[], selected: string, showAll: boolean,
): T[] {
  return rows.filter((row) => showAll || row.name === selected || row.assessment.status === "applicable");
}
