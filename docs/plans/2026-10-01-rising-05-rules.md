# Rising 05: a fall no longer takes a body out

## Goal

Every body rises (`FIGHTER` names the staged riser), and the fights stop treating a fall as the
end: a body is out of its fight when its pool ends, and not before. A body that is down may be
struck. Each fight says why a side is out in one function, which is where a context's own rule
goes if it ever has one.

It needs the battery's bar met (`docs/reference/rising.md#staged`), which the staged riser
misses: its rise ends on knees and hands. The standing bout tables are void once this lands and
are measured again in it.

## The owner's answers, 2026-10-01

1. **A body may be struck while it is down.** Nothing is ruled, sensed or held back: a fighter
   that knocks its foe down may walk up and strike it as it tries to rise.
2. **A fall does not take a body out**, "unless there's some other overriding rule in a particular
   context". No context has such a rule today, and this plan builds none. What it builds is the
   one place in each fight such a rule would be a line (Who is out, below).

## Files

| File | Change |
|---|---|
| `src/core/mind/config.ts` | `FIGHTER.subs` is `[{ kind: "staged-rise" }]`. |
| `src/arena/duel.ts` | `Duel.out` in place of `Duelist.standing` and `ending`; `DuelEnding`; the class comment. |
| `src/arena/main.ts` | `fallen` goes from the verdict's words. |
| `src/dungeon/run.ts` | `alive`; `drop`'s comment; the class comment. |
| `src/dungeon/main.ts` | A party member that is down says so. |
| `src/lab/scenarios.ts` | `down` is `"rise"` unless given. |
| `research/core-rise-trials.mjs`, `core-rise.mjs` | `boutFall` with the other side left to itself. |
| `research/bout.mjs`, `bout-baseline.mjs`, `rollouts.mjs` | A bout's row counts its falls; who is out is `Duel.out`. |
| `tests/arena-core.test.mjs`, `arena-fork.test.mjs`, `crypt-core.test.mjs`, `research-rise.test.mjs` | See Tests. |
| `README.md`, `AGENTS.md`, `docs/architecture.md`, `docs/roadmap.md`, `docs/reference/rising.md`, `play.md`, `bouts.md` | See Documents. |

## `FIGHTER`

```ts
export const FIGHTER: FighterMindConfig = deepFreeze({ kind: "fighter", subs: [{ kind: "staged-rise" }] });
```

`LAB_DOWN_IDS` becomes `["rise", "lie"]`: its first is what an address without the key reads as,
so a lab body is the game's body unless the page says otherwise.

## Who is out

### The arena (`duel.ts`)

```ts
/** How a bout ends: by a pool's ending, or by the cap. A rule of the arena's own that takes a side out adds its ending here. */
export type DuelEnding = Ending;
```

```ts
  /**
   * Why `side` is out of the bout, or null while it is in it: its pool has ended. A fall takes
   * nobody out. A rule of the arena's own that does (a count, a ring's edge) is a line here, and
   * its ending a member of `DuelEnding`.
   */
  out(side: Side): Exclude<DuelEnding, "time"> | null {
    const ending = this.duelists[side].pool.ending();
    return ending === "time" ? null : ending;
  }
```

- `Duelist.standing` and the private `ending` go. `decide` reads `this.out(side)` for each side:
  a side is out where it is not null, and the verdict's ending is the loser's. The senses' `out` is
  `() => this.verdict !== null || this.out(side) !== null`.
- The class comment's "A side is out" says a side is out once its pool has ended, that a body
  that is down rises of itself (`FIGHTER`) and may be struck, and that `out` is where the arena
  says so.
- `judge`'s `assist.withdraw()` at the verdict stays.
- `src/arena/main.ts`: `fallen: "by a fall"` goes from `ENDING_TEXT`; the record is over
  `DuelEnding`, so it does not compile until it does.
- A bout with a body that cannot rise runs to `CAP_SECONDS` and is judged on the bars. The
  battery's `--foe stands` table says how often: it is written in `play.md#the-bout`.

### The crypt (`run.ts`)

- An actor's `alive` is the crypt's one place:

  ```ts
        /** Whether it still fights: unbuilt, or built with its pool not ended. A fall takes nobody out; a rule of the crypt's own that does (a pit) is a line here. */
        get alive() { return this.fighter === null || this.fighter.pool.ending() === null; },
  ```

  `drop` is then only for a body out of the fight; a body that is down keeps its mind, which is
  rising. The class comment says so.
- `feet()` and the planner read `body.view`, which is of this step whoever has the body
  (`HostMind.look`): no change. An actor's plan is not carried out while a sub-mind has its body,
  and is taken up from the body as it is when it is handed back (`view.resumed`).
- `hold(false)` makes a mind afresh; if the body was held while down, that mind's riser takes it
  at its first step.
- `src/dungeon/main.ts`: a party member's button reads "· down" while it is alive and
  `member.fighter?.body.view.down`, in place of its order's label; "· fallen" stays for one that
  is not alive.

## The battery under attack

`boutFall({ recipe, mind, foe })`: `foe` is `"stands"` (the other side ordered to
stand, as it is today) or `"fights"` (left to itself). The row gains `struck`: the blows the fallen side took
while down; `pool`: its bar at the watch's end; and `attacker`: whether the other side was on its
feet at the watch's end. `research/core-rise.mjs --foe fights` prints the nine matchups' table.
This is what the first answer costs a fallen body, measured: how many falls end the bout anyway,
by blows on a body that is down.

A strike at a body on the ground aims at a head 0.1 m up, which nothing has tested. If attackers
fell themselves swinging low (the `attacker` column), that is a fault of the strike near the
ground: it is found and fixed in a change of its own before this plan lands, with this table
before and after.

`research/bout.mjs`: a bout's row has `falls`, how many times each side went down over the bout
(`view.down` turning true, counted by an `afterStep` hook), in place of `fallen`, who was down at
the verdict; `bout-baseline.mjs` prints falls a bout. `rollouts.mjs` reads `duel.out(side)`.

## Tests

1. `arena-core`, **`a_side_that_falls_is_still_in_the_fight_and_rises`**: a bout in which the left
   is shoved over at 1 s (an impulse on its upper trunk, the right ordered to stand): no verdict
   at the fall, and `duel.out("left")` is null throughout; `duelists.left.body.has` is
   `"staged-rise"`, then `"command"`; the left's orders are carried out again after (it walks
   where it is ordered).
2. `arena-core`, **`a_side_that_stays_down_is_judged_at_the_cap`**: the left under
   `{ kind: "fighter", subs: [{ kind: "lie" }] }` (`DuelRecipe.minds`), shoved over, the right
   ordered to stand, a cap of 10 s: no verdict before the cap; at it, `ending: "time"`, decided on
   the bars. `a_bout_in_the_arena_runs_to_its_verdict` is of a bout decided by a pool, and its
   check of who is out reads `duel.out`.
3. `arena-core`, **`a_side_that_is_down_may_be_struck`**: the left under `lie`, shoved over within
   reach of the right, which is left to itself: a blow lands on the left while `view.down` is
   true, and its pool's bar is lower for it.
4. `arena-fork`: the fork of a bout across a fall and a rise.
5. `crypt-core`, **`a_crypt_body_that_falls_rises_and_fights_on`**: an enemy shoved over is
   `alive`, not `limp`, and is on its feet and at its target again; a body whose pool ends is
   dropped as before.
6. `tests/research-rise.test.mjs`: `boutFall` with `foe: "fights"`, the row whole.

## Mutations, each must go red

- `out` still reads `view.down`: tests 1 and 2.
- `out` returns null for an ended pool: `a_bout_in_the_arena_runs_to_its_verdict`.
- The senses' `out` reads `view.down`: test 3 (the right stands off a foe it is told is out).
- `FIGHTER` left at `lie`: tests 1 and 5.
- `alive` still reads `view.down`: test 5.
- `boutFall` orders the other side to stand whatever `foe` says: test 6's `struck`.

## Documents

- `README.md`: "rising after a fall (a fallen body is out)" leaves **Not yet**; How to play says a
  body that is knocked down gets up, that it can be struck while it does, and that a fight is lost
  by wounds.
- `AGENTS.md`, in the core's rules: "**A fall takes nobody out.** A body is out of a fight when
  its pool ends. Each fight says why a side is out in one function (`Duel.out`,
  `src/arena/duel.ts`; a crypt actor's `alive`, `src/dungeon/run.ts`); a context's own rule is a
  line there, and no mind or riser knows it."
- `docs/architecture.md`: "A body that is down is out of the fight" becomes what takes a body out
  and where each fight says it; the arena's and the crypt's sections.
- `docs/roadmap.md`: "Rising after a fall" goes; the note that a strike at a fallen body cannot be
  tried in a bout goes, with what the battery under attack found in its place. The open items
  gain what this set left out and where each goes (the design file's How it extends, moved into
  `docs/architecture.md`'s Minds section as what the seams are for).
- `docs/reference/rising.md`: `## Under attack` (the table, the harness, each side's balance);
  `## Rules` (the two answers, with the day and the owner's words).
- `docs/reference/play.md#the-bout`, `#bodies-in-the-step`: the bout's rules; what a rising body
  costs a step.
- `docs/reference/bouts.md`: every standing table measured again (`research/bout-baseline.mjs`),
  the old ones replaced, not kept beside; the trace digests it lists, read again.

The design file and this plan are deleted in the commit that lands it.

## Verification

```powershell
node scripts/fingerprint.mjs > before.txt
npm test
npm run check
npm run build
node scripts/fingerprint.mjs > after.txt
node research/bout-trace.mjs
node research/core-rise.mjs
node research/core-rise.mjs --foe fights
node research/bout-baseline.mjs
```

The fingerprint's arena and crypt lines change wherever a body falls; the commit carries them
before and after, and the new trace digest. The lab's routine and run, where nobody falls, do not
change.

**Eye gate.** An arena bout with a fall in it, watched to its verdict; a crypt fight in which a
party member and an enemy each go down.
