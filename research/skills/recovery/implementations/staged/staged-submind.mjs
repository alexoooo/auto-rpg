import { stagedRise } from "../../../../../src/skills/recovery/implementations/staged/staged.ts";
import { pendingControl } from "../../../../minds/pending-control.mjs";

/** A research sub-mind that plays the staged rise in its decision phase. */
export function stagedSubMind(own, view, recipe) {
  const player = stagedRise(own, view, recipe);
  const pending = pendingControl(own.muscles.channels.length);
  const mind = {
    state: { rise: player.state, pending: pending.state },
    wants: player.wants,
    begin: player.begin,
    end: player.end,
    think(senses) { pending.think(); player.step(senses, pending.control, own.dt); },
    act: pending.act,
    interrupt() { pending.interrupt(); player.end(); },
  };
  return { mind, name: "staged-rise", has: () => "staged-rise", dispose() {} };
}
