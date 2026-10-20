import { cos, sin } from "../../math/real.ts";
import type { BodySpec, Side } from "../../spec/body.ts";
import { deepFreeze } from "../../state.ts";
import type { ReflexConfig } from "../config.ts";
import type { Part } from "../parts.ts";
import type { Cover, Intent } from "../intent.ts";
import type { Situation } from "./option.ts";
import { coveringHand } from "../cover-hand.ts";

/** What a reflex writes on the command for the limbs it takes: each hand's cover. */
interface ReflexPatch {
  readonly guard: Readonly<Partial<Record<Side, Cover>>>;
}

/**
 * **A reflex**: a response with no weighing, on a few limbs, for a short time. Its trigger is read
 * from the senses every control step and gives its patch, or null when it is not set off. It takes
 * the hands it may (`limbs`) that no reflex before it has; a hand a blow holds it takes only where it
 * `seizes`, ending that blow as interrupted. It holds them at most `longest` s, then lets go until its
 * trigger has gone.
 */
interface Reflex {
  readonly name: string;
  readonly limbs: readonly Side[];
  readonly seizes: boolean;
  readonly longest: number;
  trigger(now: Situation): ReflexPatch | null;
}

/**
 * **Reflexes under an option**, in rank order: each control step they patch the option's intent
 * (`apply`). A hand a reflex takes is the reflex's: the blow that held it, where it seizes, is
 * interrupted, and the option's requests on it are dropped; when the reflex lets go, the hand is the
 * option's again. Its memory is, per reflex, when it took its hands, whether it has held them its
 * longest, and which it holds.
 */
export function reflexLayer(reflexes: readonly Reflex[]) {
  const state = { reflexes: reflexes.map(() => ({ since: null as number | null, spent: false, hands: [] as Side[] })) };
  return {
    state,
    apply(now: Situation, intent: Intent): Intent {
      const guard = { ...intent.guard }, taken: Side[] = [], interrupt: number[] = [];
      reflexes.forEach((reflex, i) => {
        const memory = state.reflexes[i]!, patch = reflex.trigger(now);
        memory.hands.length = 0;
        if (!patch) { memory.since = null; memory.spent = false; return; }
        if (memory.spent) return;
        memory.since ??= now.time;
        if (now.time - memory.since >= reflex.longest) { memory.spent = true; return; }
        for (const side of reflex.limbs) {
          const cover = patch.guard[side];
          if (cover === undefined || taken.includes(side)) continue;
          const holder = now.sight.report.actions.find((action) => action.holds.includes(`hand.${side}`));
          const asked = intent.actions.some((request) => request.effector === `hand.${side}`);
          if ((holder || asked) && !reflex.seizes) continue;
          if (holder) interrupt.push(holder.id);
          taken.push(side); memory.hands.push(side); guard[side] = cover;
        }
      });
      if (!taken.length) return intent;
      const actions = intent.actions.filter((request) => !interrupt.includes(request.id) && !taken.some((side) => request.effector === `hand.${side}`));
      return { ...intent, guard, actions, ...(interrupt.length ? { interrupt } : {}) };
    },
  };
}

/**
 * **Cover**: the hand on the side a foe's blow closes on the head from (`Situation.threat`), where
 * it is free, between the two, for at most `longest` s at a time.
 */
export function cover(longest: number, spec?: BodySpec): Reflex {
  return {
    name: "cover", limbs: ["left", "right"], seizes: false, longest,
    trigger(now) {
      const threat = now.threat;
      if (!threat) return null;
      const h = now.sight.report.heading, dx = threat.threat[0] - threat.guarded[0], dz = threat.threat[2] - threat.guarded[2];
      const preferred = dx * cos(h) - dz * sin(h) >= 0 ? "right" : "left", hand = spec ? coveringHand(spec, preferred) : preferred;
      return { guard: { [hand]: threat } };
    },
  };
}

/** The longest its cover holds a hand up against one run of blows, s. */
const COVER_LONGEST = 1;

/** **Every reflex, by its kind**, as a part (`Part`) of role `reflex`. A kind without an entry does not compile. */
export const REFLEX_PARTS: { readonly [K in ReflexConfig["kind"]]: Part<Extract<ReflexConfig, { kind: K }>> } = deepFreeze({
  "cover-reflex": { role: "reflex", label: "Cover", stage: "game", fields: [], slots: [], defaults: { kind: "cover-reflex" }, fits: () => true, faults: () => [] },
});

/** The reflex `config` names. */
export function reflexOf(config: ReflexConfig, spec?: BodySpec): Reflex {
  switch (config.kind) {
    case "cover-reflex": return cover(COVER_LONGEST, spec);
    default: { const never: never = config.kind; throw new Error(`no reflex of kind ${JSON.stringify(never)}`); }
  }
}
