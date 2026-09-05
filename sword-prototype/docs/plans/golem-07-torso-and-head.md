# Session 07 -- torso and head modules

**Status (2026-09-04): implemented, human gate not yet asked.** All four options are registered
and appear on the bench; every threshold below is provisional and pinned from the Node torso
bench, as Sessions 02 and 03 marked theirs.

- **`torso.plain`** — 139 kg core on a shared soft waist, 24 degrees of lean and 32 of twist, 10 %
  armour on the core, effectors held at 0.34 m and the neck at 0.54 m above the waist; measured
  0.708 s to arrive at a full lean carrying 0.035 rad past it, 0.533 s to arrive at a full twist,
  61.7 mm of peak lag and no stuck steps.
- **`torso.plated`** — the same waist motor against 236 kg, 16 degrees of lean and 19 of twist,
  34 % armour, effectors 40 mm wider and 20 mm higher; measured 0.508 s and 0.013 rad of carry, and
  it takes 0.660 of a scored blow where the plain torso takes 0.900, through `armouredDamage` in
  `src/scoring.ts` at the `Combatant.applyDamage` seam and no special case anywhere.
- **`head.plain`** — a fatal 81 kg block on a two-axis neck, no striker and no lunge; measured
  0.308 s to reach its guard, 0.40 mm of tip wander at rest, and a shove of 84 N·s moves it 37.9 mm
  and is a tenth of that within 0.958 s.
- **`head.ram`** — the same neck and block with a 21 kg bronze plate and a lunge fired from
  `Intent.natural.thrust`; measured 3.36 m/s at the plate's point with 1.008 rad of the stroke's
  1.454 bought by momentum, landing 0.42 to 0.73 damage on a post through the real `Combat`, while
  the plain head files nothing on the same fixture.

Two things the gate should know before driving it. The lunge goes **down**, not across — the
forward half of it is the waist, which a person supplies with the arrow keys — and the ram needed
its own row in the bite table, because the club's 2.2 m/s floor is a statement about 3.4 kg on the
end of an arm and a head on a hinge arrives at 1.3 to 1.8 m/s.

## Outcome

The torso slot and the head slot filled: a plain torso and a plated one, a plain head and a ram.
The torso is the part that carries the three upper sockets and the vitality core; the head is the
fatal part and, in the ram, the one attack that puts the fatal part into the contact.

## Frozen choices

- **The torso sits on the locomotion root through a soft motorised waist** with lean and twist
  from `Intent.posture`, rate-limited as the Warrior's posture is, torque-capped so a hit rocks
  it. It carries the two effector socket frames and the neck socket frame. Socket placement is a
  torso property, so a broader torso holds its effectors wider and a taller one higher; those are
  the only geometry differences between options, and they change reach and cover honestly.
- **Torso options are mechanical, not cosmetic.** `plain`: lighter, wider waist range, lower
  armour. `plated`: heavier, narrower waist range, armour on the core so the same blow does less.
  Silhouette choices that change nothing physical are a shell, not a module, and are out of this
  plan.
- **The head is on a soft neck** and is fatal. `plain` cannot attack. `ram` carries a striker on
  the head part (an antler or ram plate) and reads `Intent.natural.thrust` as a lunge: a
  velocity event through the neck and waist that puts the head forward and down. The centipede's
  bite is the precedent for a body that attacks through the natural channel and publishes
  `naturalAttacks` in its view; the risk is the design, not a side effect.
- Neither torso nor head collides with any other part of its own golem.

## Implement

1. **Torso.** `src/golem/torso/plain.ts` and `plated.ts` over a shared `src/golem/torso/torso.ts`:
   the core body, the waist joint to whatever root the locomotion module gives it (the bench
   stand, or a real root in Session 08), the three socket frames, per-part health and vitality
   weight, armour. `Command` is `{trunkLean, trunkTwist}`.
2. **Head.** `src/golem/head/plain.ts` and `ram.ts` over `src/golem/head/head.ts`: the head body
   on a two-axis neck with soft motors that hold it up and let it bob and recoil; fatal flag;
   the ram's striker through `Striking` with `hand` null and a stable `effectorId`, which the
   recorder already routes to the body-neutral channel. `Command` is `NaturalIntent`.
3. **Bench.** A mode with a torso option on the stand's root and a head on it, effectors
   optional; arrow keys drive lean and twist as the page does, a key runs the ram lunge at a
   target post. Readout: waist angle versus target, head bob after a shove, lunge tip speed.
4. **Headless.** `tests/golem-torso-head.test.mjs`: build and dispose every combination, the
   waist holds under a shove below the fall threshold, the plated torso takes less damage from
   the same scored contact than the plain one (through `src/scoring.ts` and the armour rule, not
   a special case), the ram's lunge registers a scored contact on a post and the plain head
   registers none.
5. **Shell.** Stone plates and a bronze collar for the torso, a carved block with a rune inlay
   for the head, antlers or a ram plate in bronze.

## Human gate

Lean and twist with the keys, take a shove, run the lunge. The questions: does the trunk read as
heavy; does the head bob and recoil rather than sit rigid; does the ram lunge look committed.
Verdicts per option go into this file's status line.

## Verification

```powershell
npm run check
node --test tests/golem-torso-head.test.mjs
npm test
npm run build
git diff --check -- .
```
