import { controller, NO_POSTURE, type MindPreset } from "../../core/mind/controller.ts";
import type { OfferTerms } from "../../core/mind/engagement.ts";
import { selectSet, type Selection } from "../../core/mind/choice.ts";
import type { MindWiring } from "../../core/mind/minds.ts";
import type { MindReport } from "../../core/mind/report.ts";
import { hosting, type HostMind } from "../../core/mind/sub-mind.ts";
import type { Senses } from "../../core/mind/senses.ts";
import type { BodyHost } from "../../core/mind/host.ts";
import { GAME_NAVIGATION, navigatorOf } from "../../core/navigation/navigator.ts";
import type { ChooserPart, ObjectivePart } from "../../core/option/parts.ts";
import type { PartLookup } from "../../core/parts/lookup.ts";
import { anyBody, slotList, slotOne, type PartConfig } from "../../core/parts/parts.ts";
import { scopeOf } from "../../core/parts/entrant.ts";
import { QUADRUPED_PARTS, quadrupedLayers } from "../../core/reptile/layers.ts";
import { fitsQuadruped } from "../../core/reptile/parts.ts";
import type { QuadrupedConfig } from "../../core/reptile/config.ts";
import { strikersOf } from "../../core/spec/body.ts";
import { deepFreeze } from "../../core/state.ts";
import { REPTILE_OPTIONS, type ReptileAsk, type ReptileGiven, type ReptileOption, type ReptileOptionPart } from "./options.ts";
import { biteWindow, reptileReader, type ReptileSituation } from "./situation.ts";

/** The entrant's name: the scope of every kind it registers. */
const NAME = "option-reptile";

/**
 * **What the Option Reptile prices an option by**: its model's terms (`OfferTerms`) in life, a
 * share of a body's full life, beside holding the position, at the situation now.
 */
interface ReptileObjective {
  readonly name: string;
  worth(terms: OfferTerms, now: ReptileSituation): number;
}

/**
 * The fight's weights, the owner's to set for the result: what lying costs, life (`down`); how long
 * a place in the bite's window is held, s, over which its bites count (`held`); what a step of the
 * orders is worth, life (`orders`), more than any bite, so a person's orders come first.
 */
const FIGHT = deepFreeze({ down: .5, held: 1, orders: 1 });

/**
 * **What a place is worth** to the Option Reptile, life: in the bite's window of its focus and on
 * its paws, its bites there over the time it is held (`FIGHT.held`), at the prior rate of a bite
 * (`model` of the bite at `now`); and lying, what lying costs (`FIGHT.down`).
 */
const placeWorth = (exit: OfferTerms["exit"], window: number, biting: number): number =>
  (1 - exit.down) * (exit.range <= window ? biting * FIGHT.held : 0) - exit.down * FIGHT.down;

/**
 * **The fight**: an option's worth beside holding the position: what it deals less what it takes,
 * the orders it carries out (`FIGHT.orders`), where it leaves the body less where the body is
 * (`placeWorth`), and its time at what holding the position takes a second (`pressure`), so an
 * option is worth what it brings beyond holding as long.
 */
function fight(window: number, biting: (now: ReptileSituation) => number): ReptileObjective {
  return {
    name: "fight",
    worth: (terms, now) => {
      const rate = biting(now), here = { range: now.range, down: now.down ? 1 : 0 };
      return terms.dealt - terms.taken + FIGHT.orders * terms.orders + placeWorth(terms.exit, window, rate) - placeWorth(here, window, rate) + now.pressure * terms.duration;
    },
  };
}

/** What the fight objective is made with: its bite's window, and what a bite in it deals a second. */
interface Fighting { readonly window: number; readonly biting: (now: ReptileSituation) => number }

/** **The fight** (`fight`) as a part of role `objective`. */
export const FIGHT_OBJECTIVE: ObjectivePart<{ readonly kind: "option-reptile:fight" }, (fighting: Fighting) => ReptileObjective> = deepFreeze({
  role: "objective", label: "Fight", stage: "game", fields: [], slots: [], defaults: { kind: "option-reptile:fight" }, keys: { kind: true },
  fits: anyBody, faults: () => [], make: () => (fighting: Fighting) => fight(fighting.window, fighting.biting),
});

/** The Option Reptile's chooser: the toolkit's set selection over its options, priced in its terms. */
type ReptileChooser = Selection<ReptileSituation, OfferTerms, ReptileOption>;

/** What a cue of the situation reads: down, the focus, the orders and the bite's window; a change decides afresh. */
const cueOf = (window: number) => (now: ReptileSituation): string =>
  `${now.down ? 1 : 0}${now.focus?.id ?? "-"}${now.orders ? 1 : 0}${now.range <= window ? 1 : 0}`;

/** How often it decides afresh with no cue, s. */
const RETHINK = .2;

/** **The valued chooser's config**: the objective it prices options by (the fight unless given). */
interface ValuedConfig { readonly kind: "option-reptile:valued"; readonly objective?: PartConfig | null }

/**
 * **By worth**: the toolkit's set selection (`selectSet`) over the Option Reptile's options, each
 * worth its model by its objective (`ReptileObjective`), deciding afresh on its cue's change
 * (`cueOf`) or every `RETHINK` s.
 */
export const VALUED_CHOOSER: ChooserPart<ValuedConfig, ReptileOption, (fighting: Fighting) => ReptileChooser> = deepFreeze({
  role: "chooser", label: "By worth", stage: "game", fields: [], slots: [slotOne("objective", "Objective", "objective", true, FIGHT_OBJECTIVE.defaults)],
  defaults: { kind: "option-reptile:valued" }, keys: { kind: true, objective: true }, fits: anyBody, faults: () => [],
  make: (config: ValuedConfig, options: readonly ReptileOption[], _seed: number, parts: PartLookup) => (fighting: Fighting) => {
    const given = config.objective ?? FIGHT_OBJECTIVE.defaults;
    const objective = (parts.of("objective", given).make(given) as (fighting: Fighting) => ReptileObjective)(fighting);
    return selectSet<ReptileSituation, OfferTerms, ReptileOption>(options, (option, _i, now) => {
      const terms = option.model(now), worth = objective.worth(terms, now);
      if (!Number.isFinite(worth)) throw new Error(`${option.name} is worth ${worth}`);
      return { name: option.name, worth, terms, moves: null, letGo: 0 };
    }, { rethink: RETHINK }, cueOf(fighting.window));
  },
});

/**
 * **The Option Reptile's config**: its chooser, its options (each a part of role `option`, in rank
 * order; `REPTILE_OPTIONS` where none are given), and the quadruped's parts its layers and stalk
 * are made from (`QuadrupedConfig`).
 */
export interface OptionReptileConfig extends Omit<QuadrupedConfig, "kind"> {
  readonly kind: "option-reptile:mind";
  readonly chooser: PartConfig;
  readonly options?: readonly PartConfig[] | null;
}

/** The Option Reptile with every part the stock one: by worth, over its stock options. */
const OPTION_REPTILE: OptionReptileConfig = deepFreeze({ kind: "option-reptile:mind", chooser: VALUED_CHOOSER.defaults, options: REPTILE_OPTIONS });

/** A chooser or an option that is not the entrant's own, as a fault: the toolkit's are made for another mind's situation. */
const ownFaults = (config: OptionReptileConfig): readonly string[] => [
  ...scopeOf(config.chooser.kind) === NAME ? [] : [`chooser: ${config.chooser.kind} is not the Option Reptile's`],
  ...(config.options ?? []).flatMap((option, i) => scopeOf(option.kind) === NAME ? [] : [`options.${i}: ${option.kind} is not the Option Reptile's`]),
];

/**
 * **The Option Reptile**: a chooser over its options (`ReptileOption`) on its situation
 * (`reptileReader`), over the quadruped's layers (`quadrupedLayers`). Each step it reads the body,
 * decides its set, and hands the layers the first chosen's intent; where that is the righting, the
 * righting has the body (released from the layers as a host hands it to a sub-mind, and the layers
 * resumed once it hands it back). Its memory is its layers', its stalk's, its righting's, its
 * chooser's and its options'.
 */
function optionReptile(host: BodyHost, wiring: MindWiring, config: OptionReptileConfig) {
  const parts = host.parts;
  let published: MindReport | null = null;
  host.take((own) => {
    const layers = quadrupedLayers(own, parts, config), { view } = layers;
    const tacticsConfig = config.tactics ?? QUADRUPED_PARTS.tactics;
    const stalk = parts.of("quadruped-tactics", tacticsConfig).make({ own, orders: (seen) => wiring.orders(seen.senses),
      navigation: navigatorOf(parts, own.built.spec, config.navigation ?? null), bite: layers.biteTuning }, tacticsConfig);
    const righting = layers.righting(), window = biteWindow(host.spec);
    const given: ReptileGiven = { spec: host.spec, rules: host.rules, limb: strikersOf(host.spec)[0]!, layers, stalk, righting, window };
    const options = (config.options ?? REPTILE_OPTIONS).flatMap((option) => (parts.of("option", option) as ReptileOptionPart).make(option, given));
    const biteOption = options.find((option) => option.name === "bite");
    const biting = (now: ReptileSituation): number => {
      if (!biteOption) return 0;
      const terms = biteOption.model(now);
      return terms.duration > 0 ? terms.dealt / terms.duration : 0;
    };
    const chooser = (parts.of("chooser", config.chooser).make(config.chooser, options, host.seed, parts) as (fighting: Fighting) => ReptileChooser)({ window, biting });
    const reader = reptileReader(host.spec, host.rules, (seen) => wiring.orders(seen.senses));
    const state = { righting: false, focus: null as string | null };
    const forget = () => { stalk.state.target = null; stalk.state.pending = 0; stalk.state.phase = null; };
    const idle = (now: ReptileSituation): ReptileAsk => options.find((option) => option.rest && option.entry(now).kind === "ready")?.step(now, 0)
      ?? { intent: null, selection: null };
    published = {
      get engagement() { return { phase: chooser.running[0]?.name ?? "hold", focus: state.focus, offers: chooser.offers, details: [{ label: "Gait", value: layers.gait.kind }] }; },
      prospects: null, get heading() { return view.yaw; }, gait: null, navigation: null, kit: null, actions: null, ended: null, menu: null,
    };
    layers.begin();
    const mind: HostMind = {
      name: NAME,
      state: { ...layers.state, stalk: stalk.state, righting: righting.state, chooser: chooser.state, options: options.map((option) => option.state), own: state },
      look: layers.read,
      step(s: Senses, dt: number) { layers.read(s); this.act(dt); },
      act(dt: number) {
        const now = reader.read(view), { set } = chooser.decide(now);
        state.focus = now.focus?.id ?? null;
        const ask = set.length ? set[0]!.step(now, dt) : idle(now);
        if (ask.intent === null) {
          if (!state.righting) { forget(); layers.release(); righting.begin(); state.righting = true; }
          righting.step(view.senses, dt);
          return;
        }
        if (state.righting) { righting.end(); forget(); layers.resume(); state.righting = false; }
        layers.act(ask.intent, ask.selection, dt);
      },
      release() {
        if (state.righting) { righting.end(); state.righting = false; }
        forget(); layers.release();
      },
      resume() { forget(); layers.resume(); },
    };
    return hosting(mind, []);
  });
  return { state: {}, report: { get engagement() { return published?.engagement ?? null; }, get prospects() { return published?.prospects ?? null; }, get heading() { return published?.heading ?? null; },
    gait: null, navigation: null, kit: null, actions: null, ended: null, menu: null } satisfies MindReport };
}

/** **The Option Reptile** as a kind of mind: its chooser, its options and the quadruped's parts. */
export const OPTION_REPTILE_MIND = controller<OptionReptileConfig>({
  role: "mind", label: "Option Reptile", stage: "game", obeys: true, fields: [], defaults: OPTION_REPTILE, tuning: ["bite"],
  slots: [slotOne("chooser", "Chooser", "chooser"), slotList("options", "Options", "option"),
    slotOne("motor", "Motor", "support-motor", true, QUADRUPED_PARTS.motor), slotOne("travel", "Travel", "gait", true, QUADRUPED_PARTS.travel),
    slotOne("crawl", "Crawl", "gait", true, QUADRUPED_PARTS.crawl), slotOne("bite", "Bite", "bite", true, QUADRUPED_PARTS.bite),
    slotOne("tactics", "Stalk", "quadruped-tactics", true, QUADRUPED_PARTS.tactics), slotOne("navigation", "Navigation", "navigation", true, GAME_NAVIGATION)],
  keys: { kind: true, chooser: true, options: true, motor: true, travel: true, crawl: true, bite: true, tactics: true, navigation: true, tuning: true },
  fits: fitsQuadruped,
  // It strikes with what its bite does (`Part.strikes`): its own where the slot holds none.
  strikes: (spec, config, parts) => parts.of("bite", config.bite ?? QUADRUPED_PARTS.bite).strikes?.(spec, config.bite ?? QUADRUPED_PARTS.bite, parts),
  faults: ownFaults,
  builtIn: () => NO_POSTURE,
  create: (host, config, wiring) => optionReptile(host, wiring, config),
});

/** The Option Reptile's presets: its stock config, on the reptile. */
export const OPTION_REPTILE_PRESETS: Readonly<Record<string, MindPreset>> = deepFreeze({
  "option-reptile": { label: "Option Reptile", config: OPTION_REPTILE, models: ["reptile"] },
});
