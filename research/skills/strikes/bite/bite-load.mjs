import { mouthOf } from "../../../../src/skills/strikes/bite/jaw.ts";
import { pawReader } from "../../../../src/control/quadruped/paws.ts";
import { lifeTaken } from "../../../../src/combat/blows.ts";
import { channelName } from "../../../../src/core/bodies/muscle/driver.ts";

/** A fighter's bite, as its mind's skills hold it: the bite executor's state. */
const biteOf = (f) => f.minded.state.skills.actions.executors.find((executor) => executor && 'launched' in executor);

/** Physical bite cycles and their actual piercing-load wounds, including loaded withdrawal. */
export function biteMeter(world, fighters) {
  const cycles = fighters.map(() => []), pending = fighters.map(() => null);
  const jaws = fighters.map(f => mouthOf(f.body.built).lower);
  const channels = fighters.map((f, i) => f.body.muscles.channel(channelName(mouthOf(f.body.built).hinge, 0)));
  return { cycles, end() { pending.forEach((cycle, i) => { if (cycle) { cycle.ended = world.time; pending[i] = null; } }); },
    before() { return Object.fromEntries(fighters.map((f, i) => {
      const bite = biteOf(f);
      return [f.id, { rate: f.body.muscles.rate(channels[i]), phase: bite.live?.cycle.phase ?? null,
        launched: bite.launched, returned: bite.returned, failed: bite.failed, aborted: bite.aborted,
        target: structuredClone(bite.live?.target ?? null), support: pawReader(f.body.built).state.endpoints.filter(e => e.contact).length }];
    })); },
    after(before, blows) {
      fighters.forEach((f, i) => {
        const bite = biteOf(f), was = before[f.id];
        if (bite.launched > was.launched) {
          pending[i] = { launch: world.time, release: null, target: was.target, support: was.support, damage: 0, regions: [] };
          cycles[i].push(pending[i]);
        }
        const cycle = pending[i];
        if (!cycle) return;
        for (const blow of blows) {
          if (blow.kind !== 'load') continue;
          const tooth = blow.sides.find(s => s.fighter === f.id && s.segment === jaws[i].spec.name);
          const victim = blow.sides.find(s => s.fighter !== f.id);
          if (tooth && victim?.mechanism === 'point') {
            cycle.damage += lifeTaken(victim);
            if (tooth.region && !cycle.regions.includes(tooth.region)) cycle.regions.push(tooth.region);
          }
        }
        if (bite.aborted > was.aborted) cycle.aborted = true;
        if (bite.returned > was.returned) { cycle.release = world.time; pending[i] = null; }
        if (bite.failed > was.failed) { cycle.failed = true; pending[i] = null; }
      });
    }
  };
}
