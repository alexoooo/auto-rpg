import { mouthOf } from '../src/core/reptile/bite.ts';
import { channelName } from '../src/core/muscle/driver.ts';

/** Physical bite cycles and their actual piercing-load wounds, including loaded withdrawal. */
export function biteMeter(world, fighters) {
  const cycles = fighters.map(() => []), pending = fighters.map(() => null);
  const jaws = fighters.map(f => mouthOf(f.body.built).lower);
  const channels = fighters.map((f, i) => f.body.muscles.channel(channelName(mouthOf(f.body.built).hinge, 0)));
  return { cycles, end() { pending.forEach((cycle, i) => { if (cycle) { cycle.ended = world.time; pending[i] = null; } }); },
    before() { return Object.fromEntries(fighters.map((f, i) => {
      const host = f.body.state.mind.host, bite = host.bite;
      return [f.id, { rate: f.body.muscles.rate(channels[i]), phase: bite.cycle.phase,
        launched: bite.launched, returned: bite.returned, failed: bite.failed, aborted: bite.aborted,
        target: structuredClone(host.tactics.target), support: host.motor.endpoints.filter(e => e.contact).length }];
    })); },
    after(before, blows) {
      fighters.forEach((f, i) => {
        const bite = f.body.state.mind.host.bite, was = before[f.id];
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
            cycle.damage += (victim.wound?.taken.reduce((sum, p) => sum + p.hp, 0) ?? 0) + (victim.wound?.lost ?? 0);
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
