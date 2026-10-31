import type { BodyHost } from "../mind/host.ts";
import type { MindWiring } from "../mind/minds.ts";
import type { MindReport } from "../mind/report.ts";
import { hosting, type HostMind } from "../mind/sub-mind.ts";
import type { Senses } from "../mind/senses.ts";
import type { QuadrupedTacticsMaking } from "./parts.ts";
import { navigatorOf } from "../navigation/navigator.ts";
import type { QuadrupedConfig } from "./config.ts";
import { QUADRUPED_PARTS, quadrupedLayers } from "./layers.ts";

/**
 * A quadruped mind drives its own body through its layers (`quadrupedLayers`: its motor, its gaits
 * to travel and to crawl, its bite), deciding by its tactics (`QuadrupedConfig.tactics`), and hands
 * the body to its righting while it is down (`hosting`); each part is the one its config names,
 * found by its host (`BodyHost.parts`), or the stock one (`QUADRUPED_PARTS`). It travels where it
 * is ordered by the navigation its config names.
 */
export function quadrupedMind(host: BodyHost, wiring: Partial<MindWiring> & { readonly biteTarget?: QuadrupedTacticsMaking["biteTarget"] }, config: QuadrupedConfig) {
  const orders = wiring.orders ?? ((): null => null), parts = host.parts;
  // What it publishes of itself (`MindReport`), read from its tactics once its host has made them.
  let published: MindReport | null = null;
  host.take((own) => {
    const layers = quadrupedLayers(own, parts, config), { view, gait } = layers;
    const tacticsConfig = config.tactics ?? QUADRUPED_PARTS.tactics;
    const tactics = parts.of("quadruped-tactics", tacticsConfig).make({ own, orders: view => orders(view.senses), navigation: navigatorOf(parts, own.built.spec, config.navigation ?? null), bite: layers.biteTuning,
      ...(wiring.biteTarget ? { biteTarget: wiring.biteTarget } : {}) }, tacticsConfig);
    const sight = { view, bite: layers.bite.state.cycle };
    published = {
      get engagement() { return { phase: tactics.state.phase ?? (tactics.state.target ? "stalk" : "wait"), focus: tactics.state.target?.foe ?? null, details: [{ label: "Gait", value: gait.kind }] }; },
      prospects: null, get heading() { return view.yaw; }, gait: null, navigation: null, kit: null, actions: null, ended: null, menu: null,
    };
    layers.begin();
    const forget = () => { tactics.state.target = null; tactics.state.pending = 0; tactics.state.phase = null; };
    const { motor, travel, crawl, bite, tracker, feedback, look } = layers.state;
    const mind: HostMind = { name: "crawl", state: { motor, travel, crawl, gait, bite, tactics: tactics.state, tracker, feedback, look }, look: layers.read,
      step(s: Senses, dt: number) { layers.read(s); this.act(dt); },
      act(dt: number) { layers.act(tactics.decide(sight, dt), tactics.state.target, dt); },
      release() { forget(); layers.release(); },
      resume() { forget(); layers.resume(); } };
    return hosting(mind, [layers.righting()]);
  });
  return { state: {}, report: { get engagement() { return published?.engagement ?? null; }, get prospects() { return published?.prospects ?? null; }, get heading() { return published?.heading ?? null; }, gait: null, navigation: null,
    kit: null, actions: null, ended: null, menu: null } satisfies MindReport };
}
