import type { HostMind } from "./command-layers.ts";
import { constructionScope } from "../core/construction.ts";
import type { Body, BodyView, LayerOptions } from "../control/body.ts";
import type { Clock } from "../core/world/clock.ts";
import { commandLayers } from "./command-layers.ts";
import type { Mind, MindConstruction } from "./mind.ts";
import type { OwnBody } from "../core/bodies/own-body.ts";
import type { Senses } from "../core/bodies/senses.ts";

/** A computation that can take a body from its host. */
interface SubMind extends Mind {
  wants(senses: Senses): boolean;
  begin(): void;
  holds?(): boolean;
  end(): void;
}


/** A sub-mind may observe completed physics through its host's ordered listeners. */
export type SubMindMaker = (own: OwnBody, view: BodyView, clock: Clock, afterPhysics: Body["afterPhysics"]) => MindConstruction<SubMind>;
const HOST = -1, NOBODY = -2;

/** A host and ranked sub-minds, with ownership in the saved state. */
function hosting(host: HostMind & { readonly name: string; dispose(): void }, subs: readonly MindConstruction<SubMind>[]): MindConstruction {
  const state = { has: HOST, host: host.state, subs: subs.map(sub => sub.mind.state) };
  const giveUp = (reason: "takeover" | "idle"): void => {
    if (state.has >= 0) subs[state.has]!.mind.end();
    else if (state.has === HOST) host.release(reason);
  };
  const mind: Mind = {
    state,
    think(senses) {
      host.look(senses);
      const held = state.has >= 0 ? subs[state.has]!.mind : null;
      const holder = held?.holds && held.wants(senses) && held.holds() ? state.has : -1;
      const want = holder >= 0 ? holder : subs.findIndex(sub => sub.mind.wants(senses));
      if (want !== state.has) {
        giveUp("takeover");
        if (want >= 0) subs[want]!.mind.begin();
        else host.resume();
        state.has = want;
      }
      if (want < 0) host.think(senses);
      else subs[want]!.mind.think(senses);
    },
    act(control) {
      host.observe(control);
      if (state.has === HOST) host.act(control);
      else if (state.has >= 0) { host.feel(); subs[state.has]!.mind.act(control); }
    },
    interrupt() { giveUp("idle"); state.has = NOBODY; },
  };
  return { mind, name: host.name,
    has: () => state.has === NOBODY ? "nobody" : state.has === HOST ? host.name : subs[state.has]!.name,
    dispose() { host.dispose(); for (const sub of subs) sub.dispose(); },
  };
}

/** A construction that exposes the command layers to its drivers. */
export interface CommandedMind extends MindConstruction { readonly body: Body }

export function commandedMind(own: OwnBody, options: LayerOptions, clock: Clock, subs: readonly SubMindMaker[] = []): CommandedMind {
  const scope = constructionScope(); let complete = false;
  try {
    const layers = scope.own(commandLayers(own, options, clock));
    const made: MindConstruction<SubMind>[] = [];
    for (const make of subs) made.push(scope.own(make(own, layers.view, clock, layers.body.afterPhysics)));
    layers.firstLook();
    const constructed = { ...hosting(layers, made), body: layers.body };
    complete = true;
    return constructed;
  } finally { if (!complete) scope.dispose(); }
}
