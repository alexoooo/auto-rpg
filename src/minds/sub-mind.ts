import type { Body, BodyView, LayerOptions } from "../control/body.ts";
import type { Clock } from "../core/world/clock.ts";
import { commandLayers } from "./command-layers.ts";
import type { Mind, MindConstruction } from "./mind.ts";
import type { OwnBody } from "../core/bodies/own-body.ts";
import type { Senses } from "../core/bodies/senses.ts";
import type { BodyControl } from "../core/bodies/body-control.ts";

/** A computation that can take a body from its host. */
export interface SubMind extends Mind {
  wants(senses: Senses): boolean;
  begin(): void;
  holds?(): boolean;
  end(): void;
}

/** The host reads its body before deciding who controls it. */
export interface HostMind extends Mind {
  look(senses: Senses): void;
  observe(control: BodyControl): void;
  feel(): void;
  release(reason?: "takeover" | "idle"): void;
  resume(): void;
}

export type SubMindMaker = (own: OwnBody, view: BodyView, clock: Clock) => MindConstruction<SubMind>;
const HOST = -1, NOBODY = -2;

/** A host and ranked sub-minds, with ownership in the saved state. */
export function hosting(host: HostMind & { readonly name: string; dispose(): void }, subs: readonly MindConstruction<SubMind>[]): MindConstruction {
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
  const layers = commandLayers(own, options, clock);
  const made = subs.map(make => make(own, layers.view, clock));
  layers.firstLook();
  return { ...hosting(layers, made), body: layers.body };
}
