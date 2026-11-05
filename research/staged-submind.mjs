import { stagedRise } from "../src/core/recovery/implementations/staged/staged.ts";

/** A research sub-mind that plays the staged rise in its decision phase. */
export function stagedSubMind(own, view, recipe) {
  const player = stagedRise(own, view, recipe);
  const mind = {
    state: player.state,
    wants: player.wants,
    begin: player.begin,
    end: player.end,
    think(senses) { player.step(senses, own.dt); },
    act() {},
    interrupt() { player.end(); },
  };
  return { mind, name: "staged-rise", has: () => "staged-rise", dispose() {} };
}
