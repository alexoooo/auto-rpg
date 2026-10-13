# Gaits, Move and the Lab's Locomotion battery

The owner asked for this plan on 2026-10-13, after reviewing the walk/run campaign. It has four
aims:

- The Lab's Run becomes **Locomotion**, a battery that measures any way of moving.
- The legs get **named gaits**: braced, walk, fast walk, jog and run. Each gait declares what it
  supports and how fast it safely goes.
- The player chooses gaits with a short ordered rule list, **Move**, in place of Travel, then
  fight.
- **Jog and run** make long distances quick in the Crypt. The owner names this as the work left
  there: "long distance movement just feels too slow".

Two more parts follow from these: the turn rate becomes the controller's own business, and a
weapon can be put away for a gait that needs empty hands.

Motion capture and Haste stay in [their plan](2026-10-12-virtual-forces-mocap-haste.md). In this
plan's terms, each would be a variant of a gait that a character can unlock: Haste "more fast",
motion capture "more smooth".

## Where things stand

Every figure is from the Node core stand, Rapier, 120 Hz.

- **The walk:** SIMBICON (`src/core/skills/simbicon.ts`), searched to step about as wide as the
  body stands (`SIMBICON`).
  - Calm, it walks within 0.12 m/s of the pace asked up to 1 m/s.
  - Asked 1.4, it makes 1.08 to 1.15. Its top straight-line speed is about 1.15 for the Warrior,
    against 1.34 for the earlier, wider gait, which looked wrong to the owner.
  - The Lab bed (circle, shuttle and square; three bodies; seeds 1 to 6; 5 N gusts) reads 0.767
    with 5 falls.
- **The run** is a mode of the same skill (`SIMBICON_RUN`, `RUN_SWITCH`): a grounded run with no
  flight.
  - It starts only after the walk has been asked 0.5 m/s past 1.4 for 2 s, so in practice almost
    never.
  - Empty-handed, the Warrior runs about 2.2 m/s asked 2, then falls as the run hands back to the
    walk, braking from 1.4 to 0.9 m/s in half a second.
  - With the club it collapses about 1.5 s into the run.
  - The roadmap records why there is no flight: two legs pushing flat out from a crouch lift the
    centre of mass at only 0.88 m/s, because the ankle's 0.35 rad dorsiflexion stop holds the
    crouch to 5 cm.
- **The turn:** SIMBICON's heading turns at up to `turn` 2 rad/s.
  - A heading swung 1.05 rad every 0.65 s at 0.7 m/s fells the Warrior in 11 of 72 trials.
  - `turn` 1.4 cures that, but the turn battery drops from 1.4 to 1 rad/s on every body.
- **Random orders** (`orders` in `research/core-stance-trials.mjs`): the Warrior falls in 23 of 384
  trials (48 seeds, empty-handed and with the club). The falls are mostly at 0.2 to 0.3 m/s asked.
  Each order holds alone (0 of 144 reversals, 0 of 64 turns round). The falls come from
  sequences, such as turning round on the spot at a slow walk and then reversing.
- **Speed limits come from the envelope** (`simbiconEnvelope`,
  `assets/core/simbicon-envelope.json`). It is kept per model, as the slowest over the holds, so
  the Warrior's every-way envelope is 0.7 m/s with or without the club.
- **Travel, then fight** (`travelOrFight`, `src/core/skills/travel.ts`; `TRAVEL`,
  `src/core/mind/config.ts`) is the one way a mind chooses between two walks: SIMBICON until a
  standing foe is within 5 m, the stance's walk after.
- **Orders carry no destination.** `Orders.move`'s length is not read (`src/core/mind/orders.ts`).
- **The Lab's Run** (`src/lab/run-scenario.ts`, `run-mode.ts`, `track.ts`):
  - three tracks: "Big circle", "Back and forth" and "Square, W D S A";
  - a pace slider from 0.2 to 8, 1.4 by default;
  - gust sliders, which already act on every track;
  - the shell's loadout panel, which chooses the character and its hands (`loadout.ts`).
- **The bed:** `research/locomotion-run.mjs`.

## A. The Lab's Locomotion scenario, and its battery

The Run is renamed **Locomotion**: the scenario id `locomotion` and the name "Locomotion"
(`src/lab/scenarios.ts`). Its files are renamed with it: `locomotion-scenario.ts` and
`locomotion-mode.ts`. Old `?play=lab&scenario=run` addresses stop working; no alias is kept.

**Tracks** (`TRACK_IDS`, `TRACKS`, `src/lab/track.ts`):

| Track | What it is | Size slider |
|---|---|---|
| Circle | "Big circle" renamed | Radius, 2 to 20 m |
| Back and forth | as now | Distance, 2 to 30 m; default `SHUTTLE_METRES`, 6 |
| Square | as now, facing +z, W D S A | Side, as now |
| Diamond | the square turned 45°, facing +z: W+D, S+D, S+A, W+A | Side, 2 to 20 m |
| Random commands | scattered destinations, as the Crypt gives them | Area, 4 to 30 m |

- **Diamond:** a corner of π/4 at 0 m (`trackOf` builds every track from the origin facing +z),
  then the square's pieces. `TrackInfo.facing` is 0, as on the square.
- **Random commands** is not a closed track. It needs its own tactics beside `trackTactics`:
  - From the scenario's seed, it draws destinations inside a square of the Area's side about the
    start, each at least 2 m from the last.
  - The body walks to each one facing along its way, as `DungeonRun`'s attack-move does
    (`src/dungeon/run.ts`). It has arrived within `ARRIVAL.point`, 0.4 m.
  - It stands a drawn 0 to 1.5 s, then takes the next destination.
  - The orders say how far away the destination is (part C), so a Move rule can read it.
  - The readout counts destinations reached, the mean speed over the straight-line distances, and
    falls.

**The panel:**

- **Pace:** the slider reads "Max" at its top end, and Max is the default.
  - Max asks each gait for its safe top speed: its envelope's walk that way (`paceToward`) and its
    turns' bound on a bend (`turnAt`, `paceRound`), for this character and this loadout (part B).
  - Below Max, the slider asks a pace as now.
- **Gait:** either "As the mind moves" (its Move rules, part C) or one named gait, so that a
  single style can be measured alone.
- **Gusts:** as now, on every track.
- **Character and loadout:** the shell's loadout panel, as now.

**The battery:** `research/locomotion-run.mjs` takes the two new tracks (`--tracks
diamond,random`), `--distance` for back and forth, `--area` for random commands, `--pace max`, and
`--gait <name>`.

- At max, a run scores its mean speed along the track over the whole trial, so a fall costs the
  rest of the run. Below max it keeps today's share of the pace asked.
- **The bed for this plan:** all five tracks at max, the Warrior, the Rogue and the skeleton,
  empty-handed and with the club, calm and in 5 N gusts, seeds 1 to 6, validated on seeds 7 to 12.
  It replaces the three-track bed.

**Tests:**

- `tests/lab-track.test.mjs`: the diamond's legs run at 45°, 135°, 225° and 315° from +z, and it
  closes on itself.
- `tests/lab-run.test.mjs`, renamed with the scenario, gains a random-commands run on two seeds:
  the body reaches a destination.

## B. Named gaits, each knowing its safe top speed

A **gait** is a named locomotion part with a declaration beside its controller:

- **Pace band, m/s:** the slowest pace it walks as asked, and its top, read from its envelope.
- **Ways:** every way, or straight ahead only (a run).
- **Supports:** guard, blow, kick, and whether it needs empty hands.
- **Envelope:** measured per model and per hold.

The gaits:

| Gait | Controller | Band (Warrior, to be measured) | Supports |
|---|---|---|---|
| Braced | the stance's walk (`stance-walk`) | 0 to about 0.5, every way | guard, blow, kick |
| Walk | SIMBICON as now | about 0.3 to 1.1, every way | guard |
| Fast walk | SIMBICON, settings searched at 1.2 to 1.6 | to be measured | guard |
| Jog / Run | SIMBICON's run, made its own gait (part E) | about 1.6 to 2.5, ahead | to be measured: empty hands? |

- **The envelope by loadout:** `envelopeIn` (`src/core/control/stance-envelope.ts`) reads an
  entry by model and hold where one is measured (the Warrior with the club apart from the Warrior
  empty-handed). It falls back to the model's entry otherwise. `research/core-stance-envelope.mjs`
  measures each loadout the Lab offers.
- **The walk's floor:** the Walk's band starts at about 0.3 m/s, the slowest it has been measured
  to hold. Slower is Braced's band. A rule in part C that asks the Walk slower gets the Walk at its
  floor or a stand, never a pendulum carried past the pace asked.
- **Characters:** a character's gaits are a list in its spec, data the game can add to (unlocks).
  Every humanoid starts with Braced, Walk and Fast walk, and Jog / Run once part E holds.

## C. Move: an ordered rule list in place of Travel, then fight

Move is the player's one locomotion decision: which gait, when.

```
Move
  when nearest foe < 2 m        -> Braced
  when destination < 2 m        -> Walk
  when destination < 6 m        -> Fast walk
  otherwise                     -> Run
```

- **Rules:** a rule reads one distance against one threshold: nearest foe, destination or leader;
  `<` or `>`; metres. The first rule that matches chooses the gait, and the last line is the
  default.
  - A missing distance reads as infinite: an Arena bout has no destination, and a body with no
    leader has no leader.
  - The config is plain data by kind: `MoveConfig { kind: "move"; rules; otherwise }`, in
    `LocomotionConfig` in place of `TravelConfig`.
- **Tactics choose where, Move chooses how.** The tactics' pace asked stays a bound: a stop or an
  arrival asks less. Otherwise each gait goes at its own pace.
- **The destination:** `Orders` gains the distance to the destination, m, which is absent where
  there is none. The Crypt's attack-move fills it, as does the Lab's random commands.
- **Changing gait is the controller's job.**
  - It happens at a landing, as `travelOrFight` changes now, with a dead band of `LEAVING`'s kind
    on each threshold.
  - Each gait resumes from the body as it is (`Skill.resume`).
  - A change between gaits whose bands do not meet goes through the gait between, so a run comes
    down through the fast walk.
- **One default preset** (`GAME_FIGHTER`) reproduces today's behaviour in its first form: foe
  within 5 m, Braced; otherwise Walk. Then, as each gait lands, the preset uses it where the
  battery says it is better. More presets come only if the battery shows a real trade-off between
  them.
- **The mind editor** shows Move as its rule list (`src/ui/mind-editor.ts` draws list slots
  already). Each gait shows no controller numbers: SIMBICON's Cornering, Arm swing and the rest
  go, and so do the straight punch's pace, reach and landing. A gait keeps only a choice that
  changes play, such as arms in guard or swinging.
- `travel.ts` and `TravelConfig` are deleted once Move replaces them. The Scrapper's stride
  becomes a gait in its preset's Move.

## D. Controller internals: the turn

- **Turn quickly, and slow down only where it is needed.** The heading's rate of change gets a
  limit, `turnRate` rad/s² in `SimbiconSettings`. A single turn still reaches `turn` 2 rad/s.
  Only a heading swung back and forth faster than the body follows is damped.
- If that falls short, the fallback is to turn only as fast as the body follows: the turn rate
  falls as the side velocity grows in the heading's frame.
- **Measured on:**
  - the zigzag, which must go from 11 of 72 falls to 0;
  - the turn battery, which must hold 1.4 rad/s;
  - random orders, now 23 of 384;
  - the bed of part A.
- **Corners:** the Lab's braking for corners (`BRAKE`, `LEAD`, `run-mode.ts`) stays with the
  Lab's tactics. It is how a driver of the gait takes a known course, not part of a gait.

## E. Jog and run

The aim is a run the Crypt travels by over long distances, from about 1.6 m/s up, that hands back
to the walk without falling. The owner's eye report on the old forward gait (legs spread, at most
a brisk walk) is the bar for how it looks.

1. **The run as its own gait.** It is drawn out of the walk's mode switch (`RUN_SWITCH`) into a
   locomotion part beside the walk. Move enters it at a landing from the fast walk, at the fast
   walk's top. The run's own band says what it holds.
2. **The hand-back.** The fall comes as the run brakes from 1.4 to 0.9 m/s in half a second, just
   before the walk takes over. The run slows itself to the fast walk's top over steps (its
   landing's gain asks the slower pace), and hands over at a landing with the walk's stance leg
   set to the run's.
   - Measured on the stand by run-to-walk and run-to-stop trials, all three bodies, in gusts.
   - Bar: no falls in 48.
3. **Search the run** with `research/locomotion-search.mjs`, the run's settings at 1.6 to 2.5 m/s
   asked, in a trial that enters and leaves it (random orders with paces up to 2.5).
   - Scored on speed made, falls, and the step's width against the stance's (`--narrow`), so it
     does not straddle.
   - The Rogue and the skeleton by `scaledGait`, as the walk is, with the search over all three.
4. **With the club.** Before any stowing, isolate why it collapses, each probe on its own:
   - the club's mass moved to the torso;
   - the arm in a carry posture (club hanging at the side, the elbow straight) in place of the
     guard;
   - an empty hand.

   If the carry posture holds, the run carries the club that way, and part F waits.
5. **Flight**, if the grounded run tops out short of a run. The body binds flight (the ankle's
   dorsiflexion stop, the push's strength), so whether to change the body is the owner's choice,
   put with its measurement: what changing the ankle's range, or Haste's muscle speed, buys in top
   speed.
6. **The fast walk** is searched the same way at 1.2 to 1.6 m/s asked, with the narrow width held.

**Eye gate:** the owner watches jog and run in the Lab (Back and forth, at a long distance) and
travelling by them in the Crypt.

## F. Putting a weapon away

This part is only needed if part E finds that a running gait needs empty hands.

- **Recommended: a strap on the back.** The club becomes free equipment (`createEquipment`,
  `src/core/equipment.ts`) with two grips:
  - the hand's;
  - a strap's: the torso, at a frame between the shoulder blades, handle up over the shoulder of
    the hand that holds it.
- **Stowing** is a skill:
  1. The arm carries the handle to the strap, within the strap grip's capture tolerance.
  2. The strap grips.
  3. The hand lets go.
- **Drawing** is the same in reverse.
- Both are grip requests through the `EquipmentPort` (`src/core/mind/equipment-port.ts`). So
  nothing moves the club by fiat, and a mind still reaches the world only through its body. The
  grip machinery already runs for the control tasks' two-hand bar.
- **The cost:** a second or so with the guard down, which is play.
- **Who asks:** a gait that needs empty hands declares it. Choosing it makes the body stow first,
  and choosing a gait that guards makes it draw. There is no separate player setting.
- **Alternatives:**
  - A loop at the hip: a shorter reach and a quicker draw, but the club hangs by the swinging
    thigh.
  - Dropping it: a release, free and instant; picking it up needs a reach to the floor.
  - A short item such as a dagger may suit a sheath at the hip.
- **The work underneath:** today a held item is part of the body's spec, welded at build
  (`armedWith`, `src/core/items/held.ts`). The body's dynamics (`bodyDynamics`) and the strike
  recipes assume it is in the hand. A stowed club changes the arm's model, and drawing must
  restore it exactly. That is the bulk of this part, and why it waits on E's finding.

## Sessions

Each session lands in small commits with `npm run check` and `npm test`, plus `npm run build`
where browser code changes. Its touched slow tests run by name.

- **01, the Locomotion scenario (part A):**
  - the rename, the five tracks, the distance and area sliders, Max pace, the gait choice (one
    entry until 03), and the battery's new flags;
  - the new bed read once on the gaits as they are, as the reference for the rest.
- **02, the envelope by loadout (part B):** measured for each Lab loadout, so Max reads the right
  top speed with the club.
- **03, gaits and Move (parts B and C):**
  - the gait declarations, `MoveConfig` with the default preset reproducing Travel, the orders'
    destination, the Crypt's and the Lab's destinations, the mind editor trimmed, and
    `travel.ts` removed;
  - the smoke bout must play as before, since the preset reproduces Travel.
- **04, the turn (part D):** measured as listed there.
- **05, the run (part E, steps 1 to 4):** the hand-back first, then the search, run in the
  background while 06 goes on in other files.
- **06, the fast walk (part E, step 6),** and the default preset using fast walk and run where the
  bed says they win.
- **07, putting a weapon away (part F),** only if 05 finds it is needed.

The flight question (E5) goes to the owner when 05 has its figures.

## The owner's choices

- Flight for the run: whether to change the body, with what each change buys (E5).
- How a weapon is put away, if it must be (F): the back strap is recommended.
- **Decided:**
  - each loadout has its own gait limits;
  - gusts stay at the Lab's 5 N;
  - the narrow walk stays, top speed past 1.1 being the fast walk's and the run's;
  - one default Move preset unless the battery shows a trade-off;
  - party control waits.

## Eye gates

- The Locomotion scenario's five tracks at Max (01).
- Move's rule list in the mind editor (03).
- Jog and run in the Lab and in the Crypt (05, 06).
- Stowing and drawing, if built (07).
