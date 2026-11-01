import { NO_POSTURE } from "../mind/controller.ts";
import type { OfferTerms } from "../mind/engagement.ts";
import { selectSet, type Selection } from "../mind/choice.ts";
import type { MindWiring } from "../mind/minds.ts";
import type { MindReport } from "../mind/report.ts";
import { hosting, type HostMind } from "../mind/sub-mind.ts";
import type { Senses } from "../mind/senses.ts";
import type { BodyHost } from "../mind/host.ts";
import { GAME_NAVIGATION, navigatorOf } from "../navigation/navigator.ts";
import type { ChooserPart, FramePart, ObjectivePart, OptionDeciding } from "../option/parts.ts";
import type { PartLookup } from "../parts/lookup.ts";
import { anyBody, slotOne, type PartConfig } from "../parts/parts.ts";
import { strikersOf } from "../spec/body.ts";
import { deepFreeze } from "../state.ts";
import { QUADRUPED, type QuadrupedConfig } from "./config.ts";
import { QUADRUPED_PARTS, quadrupedLayers } from "./layers.ts";
import type { QuadrupedAsk, QuadrupedGiven, QuadrupedOption, QuadrupedOptionPart } from "./options.ts";
import { fitsQuadruped } from "./parts.ts";
import { biteWindow, quadrupedReader, type QuadrupedSituation } from "./situation.ts";
import { REPTILE_BITE } from "./tuning.ts";

/** The frame's kind: what its choosers and options name as the frame they are made for (`ForFrame`). */
const FRAME = "quadruped";

/**
 * **What a quadruped prices an option by**: its model's terms (`OfferTerms`) in life, a share of a
 * body's full life, beside holding the position, at the situation now.
 */
interface QuadrupedObjective {
  readonly name: string;
  worth(terms: OfferTerms, now: QuadrupedSituation): number;
}

/**
 * The fight's weights, the owner's to set for the result: what lying costs, life (`down`); how long
 * a place in the bite's window is held, s, over which its bites count (`held`); what a step of the
 * orders is worth, life (`orders`), more than any bite, so a person's orders come first.
 */
const FIGHT = deepFreeze({ down: .5, held: 1, orders: 1 });

/**
 * **What a place is worth** to a quadruped, life: in the bite's window of its focus and on its
 * paws, its bites there over the time it is held (`FIGHT.held`), at the prior rate of a bite
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
function fight(window: number, biting: (now: QuadrupedSituation) => number): QuadrupedObjective {
  return {
    name: "fight",
    worth: (terms, now) => {
      const rate = biting(now), here = { range: now.range, down: now.down ? 1 : 0 };
      return terms.dealt - terms.taken + FIGHT.orders * terms.orders + placeWorth(terms.exit, window, rate) - placeWorth(here, window, rate) + now.pressure * terms.duration;
    },
  };
}

/** What the fight objective is made with: its bite's window, and what a bite in it deals a second. */
interface Fighting { readonly window: number; readonly biting: (now: QuadrupedSituation) => number }

/** **The fight** (`fight`) as a part of role `objective`. */
export const QUADRUPED_FIGHT: ObjectivePart<{ readonly kind: "quadruped-fight" }, (fighting: Fighting) => QuadrupedObjective> = deepFreeze({
  role: "objective", label: "Fight", stage: "game", fields: [], slots: [], defaults: { kind: "quadruped-fight" }, keys: { kind: true },
  fits: anyBody, faults: () => [], make: () => (fighting: Fighting) => fight(fighting.window, fighting.biting),
});

/** A quadruped's chooser: the toolkit's set selection over its options, priced in its terms. */
type QuadrupedChooser = Selection<QuadrupedSituation, OfferTerms, QuadrupedOption>;

/** What a cue of the situation reads: down, the focus, the orders and the bite's window; a change decides afresh. */
const cueOf = (window: number) => (now: QuadrupedSituation): string =>
  `${now.down ? 1 : 0}${now.focus?.id ?? "-"}${now.orders ? 1 : 0}${now.range <= window ? 1 : 0}`;

/** How often it decides afresh with no cue, s. */
const RETHINK = .2;

/** **The valued chooser's config**: the objective it prices options by (the fight unless given). */
interface ValuedConfig { readonly kind: "quadruped-valued"; readonly objective?: PartConfig | null }

/**
 * **By worth**: the toolkit's set selection (`selectSet`) over a quadruped's options, each worth its
 * model by its objective (`QuadrupedObjective`), deciding afresh on its cue's change (`cueOf`) or on
 * its body's phase of each `RETHINK` s (`nextDecision`).
 */
export const QUADRUPED_VALUED: ChooserPart<ValuedConfig, QuadrupedOption, (fighting: Fighting) => QuadrupedChooser> = deepFreeze({
  role: "chooser", label: "By worth", stage: "game", frame: FRAME, fields: [], slots: [slotOne("objective", "Objective", "objective", true, QUADRUPED_FIGHT.defaults)],
  defaults: { kind: "quadruped-valued" }, keys: { kind: true, objective: true }, fits: anyBody, faults: () => [],
  make: (config: ValuedConfig, options: readonly QuadrupedOption[], _seed: number, parts: PartLookup, phase = 0) => (fighting: Fighting) => {
    const given = config.objective ?? QUADRUPED_FIGHT.defaults;
    const objective = (parts.of("objective", given).make(given) as (fighting: Fighting) => QuadrupedObjective)(fighting);
    return selectSet<QuadrupedSituation, OfferTerms, QuadrupedOption>(options, (option, _i, now) => {
      const terms = option.model(now), worth = objective.worth(terms, now);
      if (!Number.isFinite(worth)) throw new Error(`${option.name} is worth ${worth}`);
      return { name: option.name, worth, terms, moves: null, letGo: 0 };
    }, { rethink: RETHINK, phase }, cueOf(fighting.window));
  },
});

/** What is wrong with `config`'s bite tuning, each a sentence: a setting the bite has none of, or out of its range. */
const tuningFaults = (config: QuadrupedConfig): readonly string[] => Object.entries(config.tuning?.bite ?? {}).flatMap(([key, value]) =>
  !(key in REPTILE_BITE) || !Number.isFinite(value) || (key === "closeRate" || key === "biteInset" || key === "contactAt" || key === "biteLead" || key === "neckRetract" ? value < 0 : value <= 0)
  || key === "open" && value > REPTILE_BITE.open || key === "contactAt" && value > 1 || key === "biteSamples" && !Number.isInteger(value)
    ? [`invalid bite setting ${key}`] : []);

/**
 * **The quadruped's frame**: Option Mind over the quadruped's layers (`quadrupedLayers`: its motor,
 * its gaits to travel and to crawl, its bite), its stalk (the quadruped's tactics) and its righting,
 * on its situation (`quadrupedReader`). Each step it reads the body, decides its set, and hands the
 * layers the first chosen's intent; where that is the righting, the righting has the body (released
 * from the layers as a host hands it to a sub-mind, and the layers resumed once it hands it back).
 * It decides every control step, from no measured predictions. Its memory is its layers', its
 * stalk's, its righting's, its chooser's and its options'.
 */
function quadrupedOptionMind(host: BodyHost, deciding: OptionDeciding, config: QuadrupedConfig, wiring: MindWiring) {
  const parts = host.parts;
  let published: MindReport | null = null;
  host.take((own) => {
    const layers = quadrupedLayers(own, parts, config), { view } = layers;
    const tacticsConfig = config.tactics ?? QUADRUPED_PARTS.tactics;
    const stalk = parts.of("quadruped-tactics", tacticsConfig).make({ own, orders: (seen) => wiring.orders(seen.senses),
      navigation: navigatorOf(parts, own.built.spec, config.navigation ?? null), bite: layers.biteTuning }, tacticsConfig);
    const righting = layers.righting(), window = biteWindow(host.spec);
    const given: QuadrupedGiven = { spec: host.spec, rules: host.rules, limb: strikersOf(host.spec)[0]!, layers, stalk, righting, window };
    const options = (deciding.options ?? []).flatMap((option) => (parts.of("option", option) as QuadrupedOptionPart).make(option, given));
    const biteOption = options.find((option) => option.name === "bite");
    const biting = (now: QuadrupedSituation): number => {
      if (!biteOption) return 0;
      const terms = biteOption.model(now);
      return terms.duration > 0 ? terms.dealt / terms.duration : 0;
    };
    const chooser = (parts.of("chooser", deciding.chooser).make(deciding.chooser, options, host.seed, parts, host.phase) as (fighting: Fighting) => QuadrupedChooser)({ window, biting });
    const reader = quadrupedReader(host.spec, host.rules, (seen) => wiring.orders(seen.senses));
    const state = { righting: false, focus: null as string | null };
    const forget = () => { stalk.state.target = null; stalk.state.pending = 0; stalk.state.phase = null; };
    const idle = (now: QuadrupedSituation): QuadrupedAsk => options.find((option) => option.rest && option.entry(now).kind === "ready")?.step(now, 0)
      ?? { intent: null, selection: null };
    published = {
      get engagement() { return { phase: chooser.running[0]?.name ?? "hold", focus: state.focus, offers: chooser.offers, details: [{ label: "Gait", value: layers.gait.kind }] }; },
      prospects: null, get heading() { return view.yaw; }, gait: null, navigation: null, kit: null, actions: null, ended: null, menu: null,
    };
    layers.begin();
    const mind: HostMind = {
      name: "option",
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

/**
 * **The quadruped's frame** (`quadrupedOptionMind`) as a part of role `frame`: four-paw crawling,
 * physical jaw snaps and self-righting through the body's own muscles, each layer the part its
 * config names or the stock one (`QUADRUPED_PARTS`). Its choosers and options are made for it
 * (`QUADRUPED_VALUED`, `QUADRUPED_OPTIONS`); it reads no measured predictions and decides every
 * control step.
 */
export const QUADRUPED_FRAME: FramePart<QuadrupedConfig> = deepFreeze({
  role: "frame", label: "Quadruped", stage: "game", fields: [], defaults: QUADRUPED, tuning: ["bite"],
  slots: [slotOne("motor", "Motor", "support-motor", true, QUADRUPED_PARTS.motor), slotOne("travel", "Travel", "gait", true, QUADRUPED_PARTS.travel),
    slotOne("crawl", "Crawl", "gait", true, QUADRUPED_PARTS.crawl), slotOne("bite", "Bite", "bite", true, QUADRUPED_PARTS.bite),
    slotOne("tactics", "Stalk", "quadruped-tactics", true, QUADRUPED_PARTS.tactics), slotOne("navigation", "Navigation", "navigation", true, GAME_NAVIGATION)],
  keys: { kind: true, motor: true, travel: true, crawl: true, bite: true, tactics: true, navigation: true, tuning: true },
  fits: fitsQuadruped,
  // It strikes with what its bite does (`Part.strikes`): its own where the slot holds none.
  strikes: (spec, config, parts) => parts.of("bite", config.bite ?? QUADRUPED_PARTS.bite).strikes?.(spec, config.bite ?? QUADRUPED_PARTS.bite, parts),
  faults: tuningFaults,
  decidingFaults: (deciding) => [
    ...deciding.rate === undefined ? [] : ["rate: a quadruped decides every control step"],
    ...deciding.predictions == null ? [] : ["predictions: a quadruped prices by its priors, no measured predictions"]],
  builtIn: () => NO_POSTURE,
  create: quadrupedOptionMind,
});
