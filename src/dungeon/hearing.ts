import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { airOf, hearTouches } from "../audio/body-sounds.ts";
import type { SoundCue, SoundPoint } from "../audio/cues.ts";
import type { BuiltBody } from "../core/build/build-body.ts";
import { cellKey } from "./map.ts";
import type { DungeonActor, DungeonRun } from "./run.ts";

/**
 * **What a crypt run sounds of**: the touches and the air of every body it has built
 * (`src/audio/body-sounds.ts`), where the party sees and nowhere else. A body is heard while the
 * party sees the cell it stands in (`DungeonActor.feet`); a touch of two bodies is the earlier
 * one's. Where the touch itself fell does not say: a touch on a wall lies on the wall's face,
 * which is the edge of a cell nobody sees.
 *
 * A run builds its bodies as the party comes near them (`DungeonRun.wake`), so the listener is
 * made again over the bodies there are whenever there are more, in the step that built them. One
 * made again remembers no touch under way: a segment that is pressing something as it is made
 * sounds once more, if it is still closing on it.
 *
 * This module has no page-only imports, so the Node stand can run it
 * (`tests/dungeon-hearing.test.mjs`). It only reads: a run with it is the same run.
 */
export interface RunHearing {
  /**
   * The air of each body the party sees, now: its key, its fastest point's speed, m/s, and where
   * that point is.
   */
  airs(given: (id: string, speed: number, at: SoundPoint) => void): void;
  dispose(): void;
}

/** Hear `run`: `heard` is given the cue of each touch of a body the party sees. */
export function hearRun(run: DungeonRun, heard: (cue: SoundCue) => void): RunHearing {
  const seen = (point: SoundPoint): boolean => run.visible.has(cellKey(run.map, point));
  let bodies: { readonly id: string; readonly built: BuiltBody; readonly actor: DungeonActor; readonly air: (at: Vector3) => number }[] = [];
  let touches: { dispose(): void } | null = null;
  const listen = (): void => {
    let built = 0;
    for (const actor of run.actors) if (actor.fighter) built++;
    if (built === bodies.length) return;
    touches?.dispose();
    bodies = run.actors.flatMap((actor) => actor.fighter ? [{ id: actor.id, built: actor.fighter.built, actor, air: airOf(actor.fighter.built) }] : []);
    touches = hearTouches(run.world, bodies, (cue, touch) => { if (seen(touch.of.body.actor.feet())) heard(cue); });
  };
  listen();
  // After the run's planning, which builds: a body is heard from the step it is built in.
  const listening = run.world.beforeStep(listen);
  const at = new Vector3();
  return {
    airs(given) {
      for (const { id, actor, air } of bodies) {
        if (!seen(actor.feet())) continue;
        given(id, air(at), at);
      }
    },
    dispose() { listening.dispose(); touches?.dispose(); touches = null; bodies = []; },
  };
}
