import type { BodySpec } from "../../spec/body.ts";
import type { PartLookup } from "../lookup.ts";
import type { KeysOf, Part, PartConfig } from "../parts.ts";
import type { Cover, Intent } from "../intent.ts";
import type { Situation } from "./option.ts";

/** What a reflex writes on the command for the limbs it takes: each hand's cover, by the hand's segment. */
export interface ReflexPatch {
  readonly guard: Readonly<Partial<Record<string, Cover>>>;
}

/**
 * **A reflex**: a response with no weighing, on a few limbs, for a short time. Its trigger is read
 * from the senses every control step and gives its patch, or null when it is not set off. It takes
 * the hands it may (`limbs`) that no reflex before it has; a hand a blow holds it takes only where it
 * `seizes`, ending that blow as interrupted. It holds them at most `longest` s, then lets go until its
 * trigger has gone.
 */
export interface Reflex {
  readonly name: string;
  /** The hands it may take, by segment. */
  readonly limbs: readonly string[];
  readonly seizes: boolean;
  readonly longest: number;
  trigger(now: Situation): ReflexPatch | null;
  /** Its memory, if it keeps any (`src/core/state.ts`), held in the layer's. */
  readonly state?: object;
}

/**
 * **Reflexes under an option**, in rank order: each control step they patch the option's intent
 * (`apply`). A hand a reflex takes is the reflex's: the blow that held it, where it seizes, is
 * interrupted, and the option's requests on it are dropped; when the reflex lets go, the hand is the
 * option's again. Its memory is, per reflex, when it took its hands, whether it has held them its
 * longest, and which it holds, and each reflex's own (`Reflex.state`).
 */
export function reflexLayer(reflexes: readonly Reflex[]) {
  const state = { reflexes: reflexes.map(() => ({ since: null as number | null, spent: false, hands: [] as string[] })), own: reflexes.map((reflex) => reflex.state ?? null) };
  return {
    state,
    apply(now: Situation, intent: Intent): Intent {
      const guard = { ...intent.guard }, taken: string[] = [], interrupt: number[] = [];
      reflexes.forEach((reflex, i) => {
        const memory = state.reflexes[i]!, patch = reflex.trigger(now);
        memory.hands.length = 0;
        if (!patch) { memory.since = null; memory.spent = false; return; }
        if (memory.spent) return;
        memory.since ??= now.time;
        if (now.time - memory.since >= reflex.longest) { memory.spent = true; return; }
        for (const hand of reflex.limbs) {
          const cover = patch.guard[hand];
          if (cover === undefined || taken.includes(hand)) continue;
          const holder = now.sight.report.actions.find((action) => action.holds.includes(hand));
          const asked = intent.actions.some((request) => request.effector === hand);
          if ((holder || asked) && !reflex.seizes) continue;
          if (holder) interrupt.push(holder.id);
          taken.push(hand); memory.hands.push(hand); guard[hand] = cover;
        }
      });
      if (!taken.length) return intent;
      const actions = intent.actions.filter((request) => !interrupt.includes(request.id) && !taken.includes(request.effector));
      return { ...intent, guard, actions, ...(interrupt.length ? { interrupt } : {}) };
    },
  };
}

/** **A kind of reflex**: a part of role `reflex` that owns its config's keys and faults, and makes the reflex for a body of `spec`. */
export interface ReflexPart<C extends PartConfig = PartConfig> extends Part<C> {
  readonly role: "reflex";
  readonly keys: KeysOf<C>;
  make(config: C, spec?: BodySpec): Reflex;
}

/** The reflex `config` names, as `parts` finds it, for a body of `spec`. */
export const reflexOf = (parts: PartLookup, config: PartConfig, spec?: BodySpec): Reflex => parts.of("reflex", config).make(config, spec);
