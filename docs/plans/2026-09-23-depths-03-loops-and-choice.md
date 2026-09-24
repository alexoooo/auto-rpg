# Session 03: loops, and the best of several levels

## Goal

This session fixes the two things Diablo does worst.

1. **Loops.** Session 02's levels are trees, as Diablo's are, so every dead end is a walk back.
   This session adds Brogue's rule, on blocks and before carving: where a room is a short run of
   rock away from a different room it is not already joined to, and the walk between the two is
   long, open a corridor there.
2. **Choice.** Diablo keeps the first level that is big enough. From here we draw
   `LEVEL.candidates` levels per seed, score each, and keep the best. The score and each of its
   terms are printed, so the owner can say which level they prefer and why, and the weights move
   to match.

Still nothing a player sees changes.

## Files

| File | Change |
|---|---|
| `src/dungeon/level.ts` | `addLoops`, `deadEnds`, `levelScore`, `levelCandidates`; `generateLevel` keeps the best. |
| `scripts/dungeon/print-level.mjs` | Prints the new metrics. |
| `tests/dungeon-level.test.mjs` | Five tests. |

## `LEVEL` additions

```ts
  /** Brogue's loops: at most this many per level, each cutting at least `loopMinDetour` blocks of walking. */
  loops: 3,
  loopMinDetour: 6,
  /** A level needs at least one loop, or it is drawn again. */
  minLoops: 1,
  /** Levels drawn per seed; the best by `levelScore` is kept. */
  candidates: 12,
  /**
   * `levelScore`'s weights. Starting values, to be judged by eye with the print script: a loop is
   * worth three dead ends, and 20 m more between start and exit is worth one loop.
   */
  score: Object.freeze({ loop: 3, deadEnd: 1, exitMetre: 0.15, room: 0.5 }),
```

`Object.freeze` on the outer table does not freeze `score`, which is why `score` gets its own.

## `RoomLink` and `LevelMetrics`

- `RoomLink` gains `loop: boolean`. It is false for every link `layRooms` makes and true for every
  link `addLoops` makes. Set `loop: false` in `layRooms`'s `links.push`.
- `LevelMetrics` gains `loops: number` (the cycle rank, `links - rooms + 1`), `deadEnds: number`
  and `score: number`. The cycle rank counts real loops only because session 02's `linksHold`
  keeps every link a way through and `addLoops` never joins two rooms twice. The draft of this
  plan had neither, and the reviewer measured a claimed rank of 69 over 24 levels against 46 that
  could be walked.

## `addLoops`

It runs in `drawLevel` straight after `layRooms`, before `carve`. Dividers and doors then see loop
corridors exactly as they see grown ones, and `linksHold` guards them the same way.

```ts
/**
 * Brogue's loop rule, on blocks. For each room block, look along +x and +z: if a run of one to
 * `corridorMax` rock blocks, with rock either side of it, ends in a block of a different room that
 * this room has no link to yet, that run is a candidate. Its worth is how many open blocks the
 * walk between its two ends takes now. The candidate saving the most walking is opened, the walks
 * are measured again (the new corridor shortens them), and this repeats up to `LEVEL.loops` times
 * while the best saves at least `LEVEL.loopMinDetour` blocks. No randomness: which loops a layout
 * gets follows from the layout.
 */
function addLoops(layout: Layout): void {
  const B = LEVEL.blocks, owner = new Int16Array(B * B).fill(-1);
  layout.rooms.forEach((r, i) => {
    for (let z = r.z; z < r.z + r.d; z++) for (let x = r.x; x < r.x + r.w; x++) owner[z * B + x] = i;
  });
  const solid = (x: number, z: number) => x >= 0 && z >= 0 && x < B && z < B && layout.open[z * B + x] === 0;
  const linked = (a: number, b: number) => layout.links.some((l) => l.a === a && l.b === b || l.a === b && l.b === a);
  const walk = (from: number, to: number): number => {
    const steps = new Int16Array(B * B).fill(-1), queue = [from];
    steps[from] = 0;
    for (let head = 0; head < queue.length; head++) {
      const at = queue[head];
      if (at === to) return steps[at];
      for (const [dx, dz] of STEP) {
        const x = at % B + dx, z = Math.floor(at / B) + dz, next = z * B + x;
        if (solid(x, z) || steps[next] >= 0) continue;
        steps[next] = steps[at] + 1; queue.push(next);
      }
    }
    return Infinity;
  };
  for (let added = 0; added < LEVEL.loops; added++) {
    let best: { from: number; to: number; gap: BlockRect; heading: Heading; saves: number } | null = null;
    for (let from = 0; from < B * B; from++) {
      if (owner[from] < 0) continue;
      const x0 = from % B, z0 = Math.floor(from / B);
      for (const heading of [0, 2] as const) {
        const [dx, dz] = STEP[heading];
        let length = 0;
        while (length < LEVEL.corridorMax && solid(x0 + dx * (length + 1), z0 + dz * (length + 1))) length++;
        if (length === 0) continue;
        const ex = x0 + dx * (length + 1), ez = z0 + dz * (length + 1);
        if (ex >= B || ez >= B) continue;
        const to = ez * B + ex;
        if (owner[to] < 0 || owner[to] === owner[from] || linked(owner[from], owner[to])) continue;
        const gap: BlockRect = dx ? { x: x0 + 1, z: z0, w: length, d: 1 } : { x: x0, z: z0 + 1, w: 1, d: length };
        let flanked = true;
        for (let t = 1; t <= length && flanked; t++) {
          const gx = x0 + dx * t, gz = z0 + dz * t;
          flanked = dx ? solid(gx, gz - 1) && solid(gx, gz + 1) : solid(gx - 1, gz) && solid(gx + 1, gz);
        }
        if (!flanked) continue;
        const saves = walk(from, to) - (length + 1);
        if (saves >= LEVEL.loopMinDetour && (!best || saves > best.saves)) best = { from, to, gap, heading, saves };
      }
    }
    if (!best) return;
    for (let z = best.gap.z; z < best.gap.z + best.gap.d; z++)
      for (let x = best.gap.x; x < best.gap.x + best.gap.w; x++) layout.open[z * B + x] = 2;
    layout.links.push({ a: owner[best.from], b: owner[best.to], corridor: best.gap, heading: best.heading,
      door: null, loop: true });
  }
}
```

- `walk` measures in blocks over every open block, rooms and corridors alike, so it is the walk a
  body takes at block resolution. A candidate in rock next to the grid's edge cannot occur,
  because `within` keeps every room off the border ring.
- A loop link's `a` is the room at the low end (`from`), so its corridor runs from the block just
  before `corridor` to the block just after it, along +x for heading 0 and +z for heading 2. The
  loop test reads the ends that way.
- **`linked`** stops a loop joining two rooms that are already joined, which the draft allowed in
  8 levels of 100 (prototype: 5 in 24). A second corridor between the same two rooms is a wider
  way through, not a loop, and it inflated the cycle rank.
- **`flanked`** changed nothing in 100 levels when the reviewer removed it: rooms keep a block of
  rock round them and a corridor never runs alongside anything, so a run of rock between two rooms
  is already flanked. It stays as a guard on that construction and is pinned by nothing, which the
  commit should say.

## `deadEnds` and `levelScore`

```ts
/** Rooms a body can only leave the way it came in, other than the start and the exit. */
export function deadEnds(links: readonly RoomLink[], rooms: number, start: number, exit: number): number {
  let count = 0;
  for (let room = 0; room < rooms; room++) {
    if (room === start || room === exit) continue;
    if (links.filter((l) => l.a === room || l.b === room).length === 1) count++;
  }
  return count;
}

/** More loops, fewer dead ends, a longer way to the exit and more rooms score higher. */
export function levelScore(m: Pick<LevelMetrics, "loops" | "deadEnds" | "exitPath" | "rooms">): number {
  const w = LEVEL.score;
  return w.loop * Math.min(m.loops, LEVEL.loops) - w.deadEnd * m.deadEnds + w.exitMetre * m.exitPath + w.room * m.rooms;
}
```

The reviewer found that across candidates this score is decided mostly by `exitPath`: loops sit at
the cap of three in most candidates and dead ends vary by one or two. The weights are starting
values and stay until the owner has played the levels (session 05's checklist, item 7); a
preference for a layout is not something to ask for from a printout.

## `drawLevel`, `levelCandidates`, `generateLevel`

- In `drawLevel`:
  - Call `addLoops(layout)` after the `minRooms` check.
  - Return null when the cycle rank `layout.links.length - layout.rooms.length + 1` is under
    `LEVEL.minLoops`.
  - The exit loop already records `exitRoom`. The metrics gain `loops`,
    `deadEnds: deadEnds(layout.links, map.rooms.length, startRoom.id, exitRoom)` and
    `score: levelScore(...)`.
- The start room stays a leaf when there is one. A leaf start is not a dead end, because the start
  room is excluded.

```ts
/** Every candidate a seed draws, in the order drawn. `generateLevel` keeps the best of these. */
export function levelCandidates(seed: number): Level[] {
  const random = mulberry32(seed), out: Level[] = [];
  for (let attempt = 0; attempt < LEVEL.tries * LEVEL.candidates && out.length < LEVEL.candidates; attempt++) {
    const level = drawLevel(seed, random);
    if (level) out.push(level);
  }
  return out;
}

/** The level for a seed: the best-scoring of its candidates, the first of them on a tie. */
export function generateLevel(seed: number): Level {
  const candidates = levelCandidates(seed);
  if (candidates.length === 0) throw new Error(`no level for seed ${seed >>> 0}`);
  return candidates.reduce((best, level) => level.metrics.score > best.metrics.score ? level : best);
}
```

`generateLevel` now draws twelve levels. On the scratch prototype that is 14 ms per seed (the
reviewer measured 124 ms on the draft, whose exit was chosen by `findPath` per room and whose
checks swept every step). Generation happens once per run start, on the page's Enter button, so
anything under about 50 ms is invisible there.

## `scripts/dungeon/print-level.mjs`

Print the header as it is (it already prints every metric), and add `--all`, which prints every
candidate's metrics line (not its map) above the chosen map:

```js
const all = process.argv.includes("--all");
const seeds = process.argv.slice(2).filter((a) => a !== "--all").map(Number);
// ... inside the loop, before the chosen level:
if (all) for (const c of levelCandidates(seed)) console.log(`  candidate  ${Object.entries(c.metrics).map(([k, v]) => `${k} ${Math.round(v * 10) / 10}`).join("  ")}`);
```

## Tests (append to `tests/dungeon-level.test.mjs`)

`every_link_is_a_way_through` from session 02 now covers loop corridors too, with no change.

```js
import { deadEnds, levelCandidates, levelScore, standingNear } from "../src/dungeon/level.ts";

test("every_level_loops_and_each_loop_saves_a_real_walk", () => {
  const k = LEVEL.block;
  let loops = 0;
  for (const { map, links, metrics } of LEVELS) {
    assert.ok(metrics.loops >= LEVEL.minLoops, `seed ${map.seed}`);
    assert.equal(metrics.loops, links.length - map.rooms.length + 1);
    const loopLinks = links.filter((l) => l.loop);
    // Every loop shut at once, so no loop is measured against another's shortcut. `addLoops`
    // added them greedily, each against the ones before it; with all of them shut, each one's
    // saving is at least what it was when it was chosen.
    const shut = { ...map, floor: map.floor.slice() };
    for (const { corridor: c } of loopLinks)
      for (let z = c.z * k; z < (c.z + c.d) * k; z++) for (let x = c.x * k; x < (c.x + c.w) * k; x++) shut.floor[z * map.size + x] = 0;
    assert.equal(standingComponents(shut), 1, `seed ${map.seed}: the level without its loops is still one region`);
    for (const l of loopLinks) {
      loops++;
      const c = l.corridor, alongX = l.heading === 0;
      const ends = [
        [map.rooms[l.a], alongX ? { x: c.x - 1, z: c.z } : { x: c.x, z: c.z - 1 }],
        [map.rooms[l.b], alongX ? { x: c.x + c.w, z: c.z } : { x: c.x, z: c.z + c.d }],
      ].map(([room, block]) => standingNear(map, room, { x: block.x * k + 1, z: block.z * k + 1 }));
      const key = ends[1].z * map.size + ends[1].x;
      const through = walkField(map, ends[0])[key], around = walkField(shut, ends[0])[key];
      // 18 m, the rule's own floor, is the least measured on the prototype; one block of slack for
      // an end moved off its block's middle by a wall.
      assert.ok(around - through >= (LEVEL.loopMinDetour - 1) * k, `seed ${map.seed}: the loop saves ${around - through} m`);
    }
  }
  assert.ok(loops >= 60, `${loops} loops over ${SEEDS.length} levels`); // 69 on the prototype
});

test("no_two_links_join_the_same_two_rooms", () => {
  for (const { map, links } of LEVELS) {
    const pairs = links.map((l) => `${Math.min(l.a, l.b)}-${Math.max(l.a, l.b)}`);
    assert.equal(new Set(pairs).size, pairs.length, `seed ${map.seed}: ${pairs}`);
  }
});

test("dead_ends_are_rooms_with_one_way_out_other_than_the_start_and_exit", () => {
  // 0 - 1 - 2, and 1 - 3: rooms 0, 2 and 3 have one link each.
  const link = (a, b) => ({ a, b, corridor: { x: 0, z: 0, w: 1, d: 1 }, heading: 0, door: null, loop: false });
  const links = [link(0, 1), link(1, 2), link(1, 3)];
  assert.equal(deadEnds(links, 4, 0, 2), 1, "room 3");
  assert.equal(deadEnds(links, 4, 0, 3), 1, "room 2");
  assert.equal(deadEnds([...links, link(2, 3)], 4, 0, 2), 0, "a loop through 2 and 3 leaves none");
});

test("a_seed_keeps_the_best_scoring_of_its_candidates", () => {
  for (const seed of [3, 11, 19]) {
    const candidates = levelCandidates(seed);
    assert.equal(candidates.length, LEVEL.candidates);
    const best = Math.max(...candidates.map((c) => c.metrics.score));
    assert.equal(generateLevel(seed).metrics.score, best);
    for (const c of candidates) assert.equal(c.metrics.score, levelScore(c.metrics));
  }
});

test("the_score_rewards_loops_and_punishes_dead_ends", () => {
  const base = { loops: 1, deadEnds: 2, exitPath: 40, rooms: 8 };
  assert.ok(levelScore({ ...base, loops: 2 }) > levelScore(base));
  assert.ok(levelScore({ ...base, deadEnds: 3 }) < levelScore(base));
  assert.equal(levelScore({ ...base, loops: LEVEL.loops + 5 }), levelScore({ ...base, loops: LEVEL.loops }), "loops beyond the cap are not rewarded");
});
```

The draft's loop test measured one loop at a time, centre to centre, with the others open. It
failed on seed 0 (7.2 m), for two reasons: another loop gave the walk a way round, and a room's
centre can be most of a room away from where its loop leaves. Both are fixed above: every loop is
shut at once, and the walk is measured between the loop's own ends. Centre to centre, the same
prototype levels read a least saving of 4 m; end to end, 18.

**Mutations.** Each was run against the scratch prototype with these exact tests, and went red
or stayed green as written:

- Drop `linked` from the candidate filter: `no_two_links_join...` goes red (prototype: 5 repeated
  pairs in 24 levels).
- `addLoops` opens the candidate that saves the *least* walking (flip `>` to `<` in the `best`
  comparison, keeping the `loopMinDetour` floor): `every_level_loops...` stays green, because
  every opened loop still saves at least the floor. The test pins the floor and not the choice.
  Say so in the commit, and accept it: which loop is best is the owner's judgement from prints.
- Let `addLoops` take a loop that saves four blocks less than its floor (`saves + 4 >=` in the
  candidate test): `every_level_loops...` goes red on the saving. Lowering `loopMinDetour` itself
  would not, because the test's floor is read from it.
- Drop `flanked`: nothing goes red, and nothing changes in 100 levels (see above).
- `generateLevel` returns `candidates[0]`: `a_seed_keeps_the_best...` goes red.
- Count the start room in `deadEnds`: `dead_ends_are_rooms...` goes red.
- Remove the `Math.min` cap: `the_score_rewards...` goes red.

## Verification

- `npm test`, `npm run check`, `npm run build`.
- `node scripts/dungeon/print-level.mjs 1 2 3 4 5 6 --all`. Paste two chosen maps into the commit
  message and check by eye that the loops sit where the metrics say. Ask the owner nothing about
  them yet: whether a loop helps and which level is better are judged in play, in session 05.
- Test file timing, in the commit message. The draft's file took 16.3 s, 7.3 s of it the door
  test regenerating every level; session 02's door test reuses `LEVELS`. If the file takes more
  than about 5 s now, find what is slow before landing.

## What landed

The code above landed as written, with one change to the loop test. As planned, the
`saves + 4` mutation stayed **green**: it admits loops saving two or four blocks, and the score
passed over the candidates that had them. By the test's own measure (every loop shut, end to end)
13 of the 719 loops in 288 candidates fell under the floor, and none of the 68 in the 24 chosen
levels. The chosen levels were a fixture that could not show the defect, so the saving is now
checked on every candidate of every seed (`SEEDS.flatMap(levelCandidates)`), and the count of 60
stays on the chosen levels (69 there, as on the prototype). Every other mutation went red or
stayed green as listed.

The adversarial review found no defect over 39,552 candidates (seeds 0-1999 and the top of the
32-bit range), and seven assertions missing, all added: `metrics.deadEnds` against the level's own
links, with the unit test's loop link marked `loop`; the exit-path and room terms of the score and
a third loop outscoring a second; at most `LEVEL.loops` loops; a loop corridor one block wide and
at most `corridorMax` long; the first of tied candidates kept (seed 55); a level with only
`minLoops` loops kept; and a door on some loop corridor. It also corrected `LEVEL.tries`'s doc,
which predated `levelCandidates`. The review observed that the score favours levels with fewer
loops, because a loop shortens the way to the exit: 45 of 500 chosen levels have fewer than three,
and 197 of 500 are their seed's longest exit path. That is a weight question for the owner's play
(session 05, item 7). The file takes 2 to 2.8 s.

`generateLevel` measures 23 ms a seed warm and 50 to 70 ms for the first call in a process (Node),
against the prototype's 14 (the review: 20 to 25 warm, 58 to 82 cold). The page draws a level once, on Enter, so it pays the cold figure once.
