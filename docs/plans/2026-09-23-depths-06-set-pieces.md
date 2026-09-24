# Session 06: authored rooms

## Goal

Diablo's levels are remembered for their hand-made rooms: the Butcher's room, the Skeleton King's
lair. This session adds the mechanism, a room drawn as text and stamped into a generated room of
the right size, and three pieces that change how a fight goes:

1. **Pillared hall** (4 x 3 blocks): four one-cell pillars to fight around.
2. **Pier** (3 x 3 blocks): a solid block in the middle, and a ring 3 m wide to circle it.
3. **Four chambers** (4 x 4 blocks): two crossing walls with four arches, so four rooms in one.

A stamped room gets no divider. A stamp is taken back unless session 02's `linksHold` holds for
its room: every corridor into it is still a way through. The draft of this plan checked only that
the level stayed one region, and four chambers then cut corridor mouths in 18 levels of 100, 29
dead links, with the level still connected the long way round.

This session is written last because it is the one most likely to change after the owner has
played session 05. If the arches of session 02 already give the fights the owner wants, it may
shrink to one piece.

## Files

| File | Change |
|---|---|
| `src/dungeon/set-pieces.ts` | New. Node-loadable. The pieces as text, and `pieceCells`. |
| `src/dungeon/level.ts` | `stampPieces`, run before `divide`; `Room.piece`; `LEVEL.setPieces`, `LEVEL.setPieceChance`; `metrics.setPieces`. |
| `src/dungeon/map.ts` | `Room` gains `piece?: string`. |
| `scripts/dungeon/print-level.mjs` | Names the pieces in the header. |
| `tests/dungeon-level.test.mjs` | Three tests. |

## `src/dungeon/set-pieces.ts`

```ts
/**
 * Rooms drawn by hand and stamped into generated rooms of their size. `.` is floor and `#` is rock,
 * one character per fine cell, row 0 at the room's lowest z. A piece fits a room of exactly
 * `w` x `d` blocks, or `d` x `w` turned a quarter.
 *
 * The rules a piece must keep, which `tests/dungeon-level.test.mjs` checks:
 * - It is `w * LEVEL.block` characters by `d * LEVEL.block` rows.
 * - Alone in rock, what the widest hero can stand on is one region.
 * - Its edge ring is floor except where a wall meets the room's own wall. Where that wall end lands
 *   in a corridor mouth, `linksHold` in `src/dungeon/level.ts` refuses the stamp.
 */
export interface SetPiece { name: string; w: number; d: number; rows: readonly string[] }

export const SET_PIECES: readonly SetPiece[] = Object.freeze([
  { name: "pillared hall", w: 4, d: 3, rows: [
    "............",
    "............",
    "...#....#...",
    "............",
    "............",
    "............",
    "...#....#...",
    "............",
    "............",
  ] },
  { name: "pier", w: 3, d: 3, rows: [
    ".........",
    ".........",
    ".........",
    "...###...",
    "...###...",
    "...###...",
    ".........",
    ".........",
    ".........",
  ] },
  { name: "four chambers", w: 4, d: 4, rows: [
    "......#.....",
    "............",
    "............",
    "............",
    "......#.....",
    "......#.....",
    "#...####...#",
    "......#.....",
    "............",
    "............",
    "............",
    "......#.....",
  ] },
]);

/** The piece's rock cells as offsets from the room's lowest corner, turned if `turned`. */
export function pieceCells(piece: SetPiece, turned: boolean): { x: number; z: number }[] {
  const cells: { x: number; z: number }[] = [];
  piece.rows.forEach((row, z) => [...row].forEach((c, x) => {
    if (c === "#") cells.push(turned ? { x: z, z: x } : { x, z });
  }));
  return cells;
}
```

Check the pieces by hand before trusting the tests.

- **Pier:** the ring around the 3 x 3 block is three cells wide on every side. Its middle cells
  stand 1.5 m from rock on each side, against a clearance of 0.65.
- **Four chambers:** the vertical wall is column 6. It is rock in rows 0, 4-7 and 11, with arches
  at rows 1-3 and 8-10. The horizontal wall is row 6. It is rock at columns 0, 4-7 and 11, with
  arches at columns 1-3 and 8-10. A one-cell wall cannot halve twelve cells, so the quadrants are
  6 x 6, 5 x 6, 6 x 5 and 5 x 5 (columns 0-5 or 7-11, rows 0-5 or 7-11). Each reaches two
  neighbours through an arch, so one arch closed still leaves every quadrant reachable.
- **Pillared hall:** the gaps between pillars and walls are 3, 4 and 3 cells across and 2, 3 and 2
  down. The 2-cell rows are not standable, and do not need to be: the hall is one region through
  its middle.

Turning a piece transposes it, which mirrors it as well as turning it. All three are symmetric
enough that the difference cannot be seen.

## `src/dungeon/level.ts`

```ts
import { pieceCells, SET_PIECES } from "./set-pieces.ts";

// LEVEL gains:
  /** At most this many authored rooms per level, each fitting room taking one at this chance. */
  setPieces: 2,
  setPieceChance: 0.35,

/**
 * Authored rooms, before `divide`. A room takes a piece whose size it is, turned if need be, at
 * `setPieceChance`, up to `setPieces` per level. The stamp is taken back unless `linksHold`.
 * Returns the piece name per room, or undefined.
 */
function stampPieces(layout: Layout, map: DungeonMap, random: () => number): (string | undefined)[] {
  const k = LEVEL.block, n = map.size, names: (string | undefined)[] = layout.rooms.map(() => undefined);
  let stamped = 0;
  for (const [index, r] of layout.rooms.entries()) {
    if (stamped >= LEVEL.setPieces) break;
    const fits = SET_PIECES.flatMap((piece) =>
      piece.w === r.w && piece.d === r.d ? [{ piece, turned: false }]
        : piece.w === r.d && piece.d === r.w ? [{ piece, turned: true }] : []);
    if (fits.length === 0 || random() >= LEVEL.setPieceChance) continue;
    const { piece, turned } = fits[Math.floor(random() * fits.length)];
    const cells = pieceCells(piece, turned).map(({ x, z }) => (r.z * k + z) * n + r.x * k + x);
    for (const cell of cells) map.floor[cell] = 0;
    if (!linksHold(layout, map, index)) { for (const cell of cells) map.floor[cell] = 1; continue; }
    names[index] = piece.name; stamped++;
  }
  return names;
}
```

- In `drawLevel`: `const pieces = stampPieces(layout, map, random);` goes straight before
  `divide`.
- `divide` skips any room with `pieces[index]` set. It takes `pieces` as a fourth parameter.
- `roomsOf` sets `piece: pieces[id]` when defined.
- The metrics gain `setPieces`, counted as `pieces.filter(Boolean).length`.
- Session 02's `every_link_is_a_way_through` and `every_floor_cell_is_next_to_a_place_to_stand`
  now cover stamped rooms too, with no change. On the scratch prototype both hold over 100 levels
  with pieces in them.
- `walls_cross_the_long_rooms_and_the_count_is_the_walls_that_stand` counts rooms with rock inside
  their bounds, which now includes stamped rooms. Change its filter to rooms with no `piece`.

## Tests (append to `tests/dungeon-level.test.mjs`)

```js
import { pieceCells, SET_PIECES } from "../src/dungeon/set-pieces.ts";

test("every_set_piece_is_the_size_it_says_in_floor_and_rock", () => {
  for (const piece of SET_PIECES) {
    assert.equal(piece.rows.length, piece.d * LEVEL.block, piece.name);
    for (const row of piece.rows) {
      assert.equal(row.length, piece.w * LEVEL.block, piece.name);
      assert.match(row, /^[.#]+$/, piece.name);
    }
  }
});

test("every_set_piece_alone_in_rock_is_one_place_to_stand_either_way_round", () => {
  for (const piece of SET_PIECES) for (const turned of [false, true]) {
    const w = (turned ? piece.d : piece.w) * LEVEL.block, d = (turned ? piece.w : piece.d) * LEVEL.block;
    const size = Math.max(w, d) + 6, floor = new Uint8Array(size * size);
    for (let z = 0; z < d; z++) for (let x = 0; x < w; x++) floor[(z + 3) * size + x + 3] = 1;
    for (const { x, z } of pieceCells(piece, turned)) floor[(z + 3) * size + x + 3] = 0;
    const map = { seed: 0, size, floor, rooms: [], doors: [], start: { x: 3, z: 3 }, exit: { x: 3, z: 3 }, spawns: [] };
    assert.equal(standingComponents(map), 1, `${piece.name}${turned ? ", turned" : ""}`);
  }
});

test("set_pieces_appear_in_levels_and_are_where_they_say", () => {
  let stamped = 0;
  for (const { map, metrics } of LEVELS) {
    const named = map.rooms.filter((r) => r.piece);
    assert.equal(named.length, metrics.setPieces, `seed ${map.seed}`);
    assert.ok(named.length <= LEVEL.setPieces);
    for (const room of named) {
      const piece = SET_PIECES.find((p) => p.name === room.piece);
      const turned = room.max.x - room.min.x + 1 !== piece.w * LEVEL.block;
      for (const { x, z } of pieceCells(piece, turned)) {
        assert.equal(isFloor(map, room.min.x + x, room.min.z + z), false, `seed ${map.seed}: ${room.piece}`);
      }
    }
    stamped += named.length;
  }
  assert.ok(stamped >= 14, `${stamped} set pieces over 24 levels`); // 19, in 12 levels, on the prototype
});
```

On the scratch prototype, 24 levels carry 19 pieces in 12 levels, and 100 levels carry 103 in 73:
56 pillared halls, 33 piers and 14 four chambers. Four chambers is the rarest twice over: a 4 x 4
room is one room in nine, and 154 stamps were refused over those 100 seeds' candidates, most of
them for a wall end in a corridor mouth. If a piece is too rare to be seen in play, raise
`setPieceChance` rather than bias the room sizes.

**Mutations, each must go red.** All but the pier's were run against the scratch prototype with
these exact tests, and went red as written:

- Close both arches into four chambers' low quadrant to two cells (make row 3 of column 6 and
  column 3 of row 6 rock): `every_set_piece_alone_in_rock_is_one_place...` goes red. Closing one
  arch does not, and should not: the quadrant is still reached through the other. The draft's
  mutation closed one, and stayed green.
- Make `stampPieces` keep a stamp without asking `linksHold`: `every_link_is_a_way_through` goes
  red.
- Drop a character from one row of the pier: `every_set_piece_is_the_size...` goes red.
- Stamp at `r.x * k + 1`: `set_pieces_appear_in_levels...` goes red, and so does
  `every_floor_cell_is_next_to_a_place_to_stand`.
- Let `divide` ignore `pieces`: `walls_cross...` goes red, since its count of walls then disagrees
  with `metrics.dividers`, and on the prototype `set_pieces_appear...` did too.

## Verification

- `npm test`, `npm run check`, `npm run build`.
- `node scripts/dungeon/print-level.mjs` with seeds that contain each piece. Show the owner.
- The owner plays a seed with each piece. Is a pillar or the pier something to fight around, or
  only in the way? Does the automatic hero use it, or get stuck on it? `avoidCrowd` and `findPath`
  in `src/dungeon/run.ts` and `src/dungeon/map.ts` are the suspects if it gets stuck.
