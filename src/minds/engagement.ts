import type { Estimate } from "../skills/framework/estimate.ts";
import type { Readiness, TargetRef } from "../skills/framework/action.ts";
import type { Read, Source } from "../skills/framework/profile/source.ts";

/**
 * **The six answers of an offer's price**, each with what it asks in words: how long it runs, the
 * life it deals, the life it takes, where it leaves the body, where the foe goes meanwhile, and
 * what the place its line ends in is worth.
 */
export const ANSWERS = Object.freeze({
  duration: "how long it takes", dealt: "what it deals", taken: "what it takes", leaves: "where it leaves the body",
  foe: "where the foe goes meanwhile", end: "what its line's end is worth",
});

/**
 * **Where each answer of an offer's price comes from** (`ANSWERS`, `Source`). Each of the six
 * is always said: one the Mind does not price says so (a source of kind `none`).
 */
export type OfferSources = Readonly<Record<keyof typeof ANSWERS, Source>>;

/**
 * What an offer was weighed from, as a readout shows it, each in life (a share of a body's full
 * life) or its own unit: how long it runs, s; the life it deals and takes; the metres of the orders
 * it carries out; where it leaves the body, the range head to head, m, and the chance it is down;
 * and where each answer of its price comes from (`from`).
 */
export interface OfferTerms {
  /** Whether it runs as long as it is held (`Option.open`): its duration the seconds it was priced to be held, not one run's. */
  readonly open: boolean;
  readonly duration: number;
  readonly dealt: number;
  readonly taken: number;
  readonly orders: number;
  readonly exit: { readonly range: number; readonly down: number };
  readonly from: OfferSources;
}

/**
 * **An option's worth at a decision** (`Engagement.offers`): the terms it was weighed from
 * (`OfferTerms`), how much it changes the position and what letting it go costs, running; no
 * terms for a fixed worth, which costs nothing to let go.
 */
export interface Offer {
  readonly name: string;
  /** Its option's kind (a strike, a walk, a hold, …). */
  readonly kind: string;
  readonly worth: number;
  readonly terms: OfferTerms | null;
  readonly moves: number | null;
  readonly letGo: number;
}

/**
 * **A candidate action a mind weighed** (`Engagement.candidates`): its key, the action, the limb
 * and the body region it would strike, whether the skills would admit it now (`Readiness`), what it
 * was estimated at, and whether it was eligible to be chosen.
 */
interface EngagementCandidate {
  readonly key: string;
  readonly action: string;
  readonly effector: string;
  readonly target: Extract<TargetRef, { kind: "body" }>;
  readonly readiness: Readiness;
  readonly estimate?: Estimate;
  readonly eligible: boolean;
}

/** The candidate a mind pursues (`Engagement.pending`): its key, and since when, s. */
interface EngagementPending {
  readonly key: string;
  readonly since: number;
}

/** A mind's own fact, which a readout shows as it is: a label and its value, in words. */
export interface EngagementDetail {
  readonly label: string;
  readonly value: string;
}

/**
 * **What a mind reports doing** (`MindReport.engagement`): what every mind may say, its phase
 * (its own words for what it does now, shown as they are), its focus and whether it lost it, and its own
 * details, which any mind publishes as it likes and a readout shows as they are (`details`).
 * A mind adds what is its own to show: a chooser over options the offers it chose among
 * (`offers`), an action controller its candidates and the one it pursues (`candidates`,
 * `pending`).
 */
export interface Engagement {
  readonly phase: string;
  /** What kind of course its phase is (a chooser's: the running option's, `Offer.kind`), where it says. */
  readonly kind?: string;
  readonly focus?: string | null;
  /** What the focus is doing as the mind last read it (an Option Mind's `FoePhase`), where it reads so. */
  readonly foe?: string;
  readonly lost?: boolean;
  readonly details?: readonly EngagementDetail[];
  /** What its last decision read to price the fight, and where each reading comes from (`Read`), where it reads any: an Option Mind's Options' readings, then its focus's, named as the foe's. */
  readonly reads?: readonly Read[];
  readonly offers?: readonly Offer[];
  readonly candidates?: readonly EngagementCandidate[];
  readonly pending?: EngagementPending | null;
}
