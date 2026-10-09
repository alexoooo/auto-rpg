import { mouthOf } from '../src/core/reptile/bite.ts';
import { channelName } from '../src/core/muscle/driver.ts';

/** Node bite qualification: only closing-stroke work is credited; subsequent unloading is subtracted. */
export function biteMeter(world, fighters, others = {}) {
  const known = new Map([...fighters.map(f => [f.id, f.body.built]), ...Object.entries(others)]);
  const cycles = fighters.map(() => []), pending = fighters.map(() => null), episodes = new Map();
  const jaws = fighters.map(f => mouthOf(f.body.built).lower);
  const channels = fighters.map((f, i) => f.body.muscles.channel(channelName(mouthOf(f.body.built).hinge, 0)));
  const point = (episode, pair, i) => {
    const jaw = jaws[i], shape = episode.first === jaw.body.id ? pair.mine : episode.second === jaw.body.id ? pair.theirs : -1;
    const owner = jaw.rigid.owners[shape];
    return owner?.kind === 'region' && !!owner.region.surface.point;
  };
  const state = i => fighters[i].body.state.mind.host.bite;
  return { cycles, before() {
    return Object.fromEntries(fighters.map((f, i) => {
      const host = f.body.state.mind.host, bite = host.bite;
      return [f.id, { rate: f.body.muscles.rate(channels[i]), phase: bite.cycle.phase,
        launched: bite.launched, returned: bite.returned, failed: bite.failed, aborted: bite.aborted,
        target: structuredClone(host.tactics.target), support: host.motor.endpoints.filter(e => e.contact).length }];
    }));
  }, after(before, blows) {
    fighters.forEach((f, i) => {
      const bite = state(i), was = before[f.id];
      if (bite.launched > was.launched) {
        pending[i] = { launch: world.time, release: null, target: was.target, support: was.support, damage: 0, energy: 0, regions: [] };
        cycles[i].push(pending[i]);
      }
      if (bite.aborted > was.aborted && pending[i]) pending[i].aborted = true;
      if (bite.returned > was.returned && pending[i]) { pending[i].release = world.time; pending[i] = null; }
      if (bite.failed > was.failed && pending[i]) { pending[i].failed = true; pending[i] = null; }
    });
    for (const [key, episode] of world.contactWork.active) {
      const records = episodes.get(key) ?? new Map();
      for (const [pairKey, pair] of episode.pairs) fighters.forEach((f, i) => {
        if (!point(episode, pair, i)) return;
        const id = `${i}:${pairKey}`, r = records.get(id) ?? { side: i, previous: 0, active: null, cycles: new Map() };
        const closing = before[f.id].phase === 'swing' && before[f.id].rate < 0;
        if (closing && pending[i]) r.active = pending[i];
        const delta = pair.work - r.previous;
        if (r.active && (delta < 0 || closing)) r.cycles.set(r.active, (r.cycles.get(r.active) ?? 0) + delta);
        r.previous = pair.work; records.set(id, r);
      });
      episodes.set(key, records);
    }
    for (const blow of blows) fighters.forEach((f, i) => {
      const tooth = blow.sides.find(s => s.fighter === f.id && s.segment === jaws[i].spec.name && s.region?.startsWith('tooth'));
      const victim = blow.sides.find(s => s.fighter !== f.id);
      if (!tooth || victim?.mechanism !== 'point') return;
      const taken = victim.wound?.taken.reduce((sum, p) => sum + p.hp, 0) ?? 0;
      if (blow.work === undefined) {
        if (pending[i] && before[f.id].phase === 'swing' && before[f.id].rate < 0) {
          pending[i].energy += blow.energy; pending[i].damage += taken; pending[i].regions.push(tooth.region);
        }
        return;
      }
      const ids = blow.sides.map(s => known.get(s.fighter)?.segments.get(s.segment)?.body.id);
      const released = world.contactWork.released.find(e => e.first === ids[0] && e.second === ids[1]
        || e.second === ids[0] && e.first === ids[1]);
      if (!released) return;
      const records = [...(episodes.get(`${released.first}:${released.second}`)?.values() ?? [])].filter(r => r.side === i);
      const ownWork = records.reduce((sum, r) => sum + r.previous, 0);
      if (!(ownWork > 0)) return;
      const driven = new Map();
      for (const r of records) for (const [cycle, work] of r.cycles) driven.set(cycle, (driven.get(cycle) ?? 0) + work);
      const totalDriven = [...driven.values()].reduce((sum, work) => sum + Math.max(0, work), 0);
      const scale = totalDriven > ownWork ? ownWork / totalDriven : 1;
      const pointFraction = victim.damage > 0 ? (victim.pointDamage ?? 0) / victim.damage : 0;
      for (const [cycle, work] of driven) if (!cycle.failed && work > 0) {
        const fraction = work * scale / ownWork;
        cycle.energy += ownWork * fraction; cycle.damage += taken * fraction * pointFraction; cycle.regions.push(tooth.region);
      }
    });
    for (const e of world.contactWork.released) episodes.delete(`${e.first}:${e.second}`);
  } };
}
