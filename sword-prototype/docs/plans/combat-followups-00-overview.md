# Sword prototype -- combat follow-ups

## Outcome

Close the playtest defects reported on 2026-08-24, make the existing human controller able
to own every anatomical command, add real arena boundaries and camera gestures, replace the
rough armour silhouette with adapted freely licensed art, and establish a unit architecture
that can support Warrior, Broot and a non-humanoid Centipede without turning `Fighter` into a
branch for every body.

The preceding whole-body topic is closed. Its vitality, wrist, posture, fists, materials,
action options, NEAT experiment and integration evidence live in `../design.md` and
`../measurements.md`; its plan files were deleted rather than retained as a second authority.

## Observations this plan accepts as its input

- A pause curtain can cover a world whose physics still advances, most visibly after a
  verdict.
- `Restart this bout` is a no-op after a verdict because `restart()` accepts only `fight`.
- A winning archer's free hand can continue moving outside the body envelope.
- Spent arrows can collide as general debris and form floating piles.
- Shield and buckler defence is not visibly effective against arrows.
- Two unarmed Duelists orbit without reaching a punch exchange; fist attack and block are
  not legible in ordinary AI play.
- The room walls are cosmetic and fighters can leave the arena.
- Middle-button drag should move the camera. `L` remains sufficient for target lock.
- Human play needs an explicit way to own crouch, lean, twist, roll and bend instead of
  always donating those channels to the policy.
- The current procedural armour is too crude; imported art must remain cosmetic, segmented
  and severable through the existing physics bones.
- Broot is larger and stronger than Warrior. Centipede is short, long, segmented and can
  bite. The unfinished phrase after "bite or" is not permission to invent a second natural
  attack; that decision remains open until the user names it.

## Sessions and order

| session | result | depends on |
| --- | --- | --- |
| [01](combat-followups-01-pause-and-restart.md) | a pause freezes the complete world; restart works from live and decided bouts | current build |
| [02](combat-followups-02-verdict-settles-survivors.md) | surviving arms settle at the verdict; existing projectiles finish safely | 01 |
| [03](combat-followups-03-spent-arrow-collisions.md) | spent arrows land on the world but never stack on one another | 02 |
| [04](combat-followups-04-shields-against-archers.md) | shields physically intercept arrows and policies present them to the shot line | 03 |
| [05](combat-followups-05-bare-duelist-combat.md) | unarmed Duelists close, punch and cover instead of orbiting forever | 04 |
| [06](combat-followups-06-authoritative-arena-walls.md) | four visible room edges have matching WORLD colliders | 03 |
| [07](combat-followups-07-middle-mouse-camera.md) | middle drag orbits; Shift+middle pans; camera remains non-authoritative | 06 |
| [08](combat-followups-08-full-human-body-control.md) | a human can own every selected-hand and posture channel | 07 |
| [09](combat-followups-09-unit-registry.md) | setup builds typed, compatible Combatants instead of ignoring the unit string | 08 |
| [10](combat-followups-10-licensed-armour-adaptation.md) | pinned CC0 armour is adapted to the rigid severable costume contract | 09 |
| [11](combat-followups-11-broot-body.md) | Broot is a larger, stronger humanoid with explicit tradeoffs | 09 |
| [12](combat-followups-12-centipede-body.md) | Centipede is a separate segmented, biting Combatant | 09 |
| [13](combat-followups-13-integration-and-playtest.md) | adversarial review, full lifecycle/play matrix and durable close-out | 10--12 |

Sessions 01--05 are deliberately small correctness/balance changes. Sessions 06--08 alter
host controls. Session 09 is the architectural gate for every additional body; neither new
unit may land by copying `Fighter` or by silently ignoring an incompatible loadout.

## Declared contracts and initial values

These are starting contracts, not numbers authorized by taste:

```ts
type CameraGesture = "none" | "orbit" | "pan";

interface HumanOwnership {
  posture: boolean;
  drivenWrist: boolean;
}

interface Combatant {
  readonly kind: UnitKind;
  readonly limbs: readonly PartState[];
  readonly strikers: readonly Striking[];
  readonly alive: boolean;
  observe(opponent: Combatant, clock: number): void;
  update(dt: number): void;
  stopFighting(): void;
  dispose(): void;
}
```

- A spent arrow uses one new collision bit and collides with `WORLD` only.
- Room-wall collider thickness begins at 0.24 m and is derived from the same `ROOM` placement
  used by the visible wall; the session must sweep corner escape, not merely accept 0.24.
- Broot's exact scale, mass, health, speed and strength multipliers are measured and written
  in session 11. "Bigger and stronger" does not imply faster or universally better.
- Centipede begins with one natural striker, `bite`; segment count, death rule and human
  mapping are declared in session 12 before bodies are built.

## Expected movement and protected surfaces

This standalone prototype has no golden hashes. It does have pinned asset digests and
reproducible fight records:

- 01, 02, 07 and 08 must not change an uninterrupted AI-vs-AI fight record.
- 03 intentionally changes collision masks and the spent-projectile contact tail, not a
  clean arrow's first-hit damage or arrival speed.
- 04 and 05 intentionally move shield/archer and unarmed outcome tables. Ordinary
  sword-vs-sword rows must remain stable.
- 06 intentionally adds four physics bodies and changes escape/projectile-wall behaviour.
- 09 may bump the experimental feature/checkpoint version if unlike-body facts become new
  feature columns. It must continue to reject the unpromoted checkpoint rather than revive
  `learned-v1`.
- 10 alone may move `public/assets/warrior.glb` and its digest pin. Imported art must not move
  any fight record.
- 11 and 12 add new corpus rows. Warrior-vs-Warrior baselines remain controls.

## Invariants across every session

- Policies and humans produce the same `Intent`; camera state and cosmetics carry no combat
  authority.
- Physics advances only through Babylon's fixed-step accumulator.
- A pause freezes physics; an unpaused `over` world may still settle corpses, blood and
  already-fired projectiles.
- Every union/registry dispatch is total and unknown or incompatible input is refused by name.
- No mesh, material, texture, body, constraint, observer, trail or pointer listener grows
  across restart or disposal.
- New view fields need real readers and updates to the two handwritten fixtures named in
  `AGENTS.md`.
- Match each edited file's existing line endings. Do not normalize `src/style.css`.
- Every new test is mutation-checked against the exact line it claims to guard.

## Per-session and final verification

Every session runs from `sword-prototype/`:

```powershell
npm test
npm run check
npm run build
```

Mechanics sessions also run the named focused measurement. Asset sessions run
`npm run texture:verify` and `npm run asset:verify`. Browser work uses an attached
`npm run dev` on port 5180; its owner stops it and verifies that the port is free.

Session 13 deletes this plan set only after its results are folded into `README.md`,
`../design.md`, `../measurements.md`, asset provenance and any reusable `AGENTS.md` trap.
