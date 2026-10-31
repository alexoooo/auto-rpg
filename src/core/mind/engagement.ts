import type { Readiness, TargetRef } from "../skills/framework/action.ts";

/**
 * What an offer was weighed from, as a readout shows it, each in life (a share of a body's full
 * life) or its own unit: how long it runs, s; the life it deals and takes; the metres of the orders
 * it carries out; and where it leaves the body, the range head to head, m, and the chance it is down.
 */
interface OfferTerms {
  readonly duration: number;
  readonly dealt: number;
  readonly taken: number;
  readonly orders: number;
  readonly exit: { readonly range: number; readonly down: number };
}

/**
 * **An option's worth at a decision** (`Engagement.offers`), the terms it was weighed from, how
 * much it changes the position and what letting it go costs, running; no terms for a fixed worth,
 * which costs nothing to let go.
 */
export interface Offer {
  readonly name: string;
  readonly worth: number;
  readonly terms: OfferTerms | null;
  readonly moves: number | null;
  readonly letGo: number;
}

/**
 * **A candidate action a decider weighed** (`Engagement.candidates`): its key, the action, the limb
 * and the body region it would strike, whether the skills would admit it now (`Readiness`), what it
 * was estimated at, and whether it was eligible to be chosen.
 */
interface EngagementCandidate {
  readonly key: string;
  readonly action: string;
  readonly effector: string;
  readonly target: Extract<TargetRef, { kind: "body" }>;
  readonly readiness: Readiness;
  readonly estimate?: { readonly unit: "opening" | "net"; readonly value: number };
  readonly eligible: boolean;
}

/** The candidate a decider pursues (`Engagement.pending`): its key, and since when, s. */
interface EngagementPending {
  readonly key: string;
  readonly since: number;
}

/** A decider's own fact, which a readout shows as it is: a label and its value, in words. */
export interface EngagementDetail {
  readonly label: string;
  readonly value: string;
}

/**
 * **What a decider reports doing** (`Decider.engagement`): what every decider may say, its phase
 * (shown by its part's label, `Part.phases`), its focus and whether it lost it, and its own
 * details, which any decider publishes as it likes and a readout shows as they are (`details`).
 * A decider adds what is its own to show: a chooser over options the offers it chose among
 * (`offers`), an action controller its candidates and the one it pursues (`candidates`,
 * `pending`).
 */
export interface Engagement {
  readonly phase: string;
  readonly focus?: string | null;
  readonly lost?: boolean;
  readonly details?: readonly EngagementDetail[];
  readonly offers?: readonly Offer[];
  readonly candidates?: readonly EngagementCandidate[];
  readonly pending?: EngagementPending | null;
}

/** A live report with a layer's lazy details appended; reading it changes no decision state. */
export function engagementWithDetails(base: () => Engagement | undefined, details: () => readonly EngagementDetail[]): Engagement {
  return {
    get phase() { return base()?.phase ?? "unreported"; },
    get focus() { return base()?.focus; },
    get lost() { return base()?.lost; },
    get candidates() { return base()?.candidates; },
    get pending() { return base()?.pending; },
    get offers() { return base()?.offers; },
    get details() { return [...base()?.details ?? [], ...details()]; },
  };
}
