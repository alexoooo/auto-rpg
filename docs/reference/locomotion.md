# Locomotion: the gaits, what they hold, and what was tried

What each gait does, read on the Node stand, Rapier, 120 Hz unless a line says otherwise, and what
was tried and not kept. A figure is read at the commit it was written at; read it again before
comparing against it. The gaits themselves are in the [architecture](../architecture.md#skills).

- **Walking.** The fastest walk held every way is 0.5 m/s for the Warrior and 0.4 for the Rogue
  and the skeleton (`assets/core/stance-envelope.json`), where a person's preferred walk is near
  1.4 m/s (`PERSON_PACE`, `src/core/human/gait.ts`). A dash, a roll, a crouch and turning on the
  spot are not built ([orders](orders.md)).
  - **The stride** (experimental) plans its own steps on the capture point and holds 0.7 m/s
    every way for the Warrior, and 0.5 for the Rogue and the skeleton
    (`assets/core/stride-envelope.json`). On the Lab's lines (`research/locomotion-run.mjs`,
    Node, Rapier, 120 Hz, 20 N gusts) the Warrior holds 1.2 m/s asked forward, 0.95 along the
    line, and 0.7 the other ways; the Rogue 1 forward (0.75 along). Its defaults are the best of a
    search over its settings (`research/locomotion-search.mjs`); against the stance's own step
    they fell 364 times against 425 in 640 paired runs on the lines, and 41 against 62 in 120 on
    the turns.
  - **The stance's own walk is no faster.** Asked 1.2 m/s forward it goes 0.80 along; the other
    ways it holds 0.5.
  - **What caps the walk is where the body bears.** Through each swing the realised centre of
    pressure stays about 3 cm ahead of the bearing sole's middle whatever the stance asks, a
    braking that costs about the fifth of the pace the walk falls short of; asking the pivot
    further back moves the place asked, not the one realised. Stripping one limit at a time (the
    bed's `--probe`), twice the strength lifts the forward walk's speed about 16 %, and an assist
    with it 1.4 m/s; the yaw given alone, lighter legs, stronger ankles, 240 Hz and more friction
    hold no more. What lifted the pace is the swing's share of the step: a longer swing and a
    shorter double support. The joints reach every pose the walk asks; the ankle gives 4 to 7 %
    of the stride's positive work, where a person's gives about half (`research/gait-audit.mjs`).
  - **Tried and not kept:**
    - a shoe's sole (`withSoles`): it falls less under gusts, but the stride holds less;
    - a sole that rolls from heel to toe (`--probe '{"rocker": 0.3}'`): the solver touches one
      flat piece of it at a time, and every rocker walked slower than the box;
    - the trunk cancelling the swing's yaw: not built, since the yaw given free held less;
    - a person's cadence forward (`paced`), landing on contact (`lands`) and lengthening a short
      swing (`lengthen`), each a setting left off;
    - the plan yielding to what the soles miss;
    - soles narrowed to where the ankle holds the whole weight (the Rogue falls at 0.5 m/s);
    - the pelvis turning with the stride, either way;
    - the yaw weighed less in the share;
    - a straighter knee;
    - the push-off as a torque (`launch`, `lead`) and a swing from its launch (`momentum`): settings
      left off. A swing's missed moment weighed at its own lever (`lever` 0.3) falls less and
      walks no faster, so it is left off too;
    - a search's best settings (a 0.31 s swing, `lengthen` and `lever` on): on the forward line
      under gusts (10 seeds, 20 s) the Warrior holds 1.2 m/s asked and reaches 1.01, against the
      defaults' 1.0 asked and 0.88 reached, and the Rogue 1.0 asked and 0.79 reached, against 0.7
      and 0.64. But the Warrior falls walking back with the club at 0.7 m/s, so its envelope every
      way is 0.5 against 0.7, and the game asks every walk at that figure;
    - a second figure of the envelope, the fastest walk straight ahead that turns no slower than
      the walk every way. Straight ahead the stride reaches what it is asked to 1 m/s and stays
      up to 1.4, but at 1 m/s it turns half as fast, and nothing slows a walk for a bend. The
      stance's walk gained the same figure, 0.7 m/s, and its faster approach felled the Rogue in
      the smoke bout;
    - a tendon in series with the ankle's plantar flexors (`MuscleSpec.tendonPositive`), as stiff
      as a person's Achilles tendon: the Warrior's stride falls 3 times in 10 at 1 m/s and every
      time at 1.2, and twice and four times as stiff do not help, which points at the stance's
      torque control rather than the tendon; a stride searched with it is not tried. On the spot
      it keeps the run up 8 times in 8, against 3 rigid. The mechanism is in the core; no body
      has one.
  - **The run** (experimental, `run.ts`) flies between steps, its feet placed as a hopping
    machine places them and the capture point asked where a steady run's is as each foot lands,
    its arms swinging against each other. On the spot it stays up; forward it holds 10 s at about
    1 m/s whatever pace is asked (a search over its settings reached 0.9 m/s held, 0.76 for the
    Rogue, by giving up the flight). Each step the pelvis yaws some 0.8 rad: the swing's yaw is
    more than the bearing sole's twist gives at the ground's friction (0.5), and the bearing hip
    turns to its stop. A foot landed behind its neutral point, to speed up, falls within about
    2 s. A run at 2 m/s needs the swing's yaw cancelled, or more twist at the sole.
  - **The SIMBICON walk** (`simbicon.ts`, the walk every fighter travels by) drives the legs
    itself, with no stance goal. Told it may not run, it walks forward to 1.31 m/s. Its envelope
    (`assets/core/simbicon-envelope.json`: Node stand, Rapier, 120 Hz, calm and in four seeds of
    5 N gusts, with each thing held) is every way 1.4 m/s for the Warrior, 1 for the Rogue and 0.7
    for the skeleton, and forward 1.5, 1.2 and 1.5. It is measured from 0.3, since slower a step's
    pendulum carries the body on past the pace asked or short of it. Each way changes the walk
    asked at its own rates: forward 1.16 m/s² faster and 0.47 slower, the side and back ways 0.5.
    - **Its run** tracks a person's run cycle past 1.31 m/s (`runCycle`, `cycle-run.ts`), three
      clips' (2.75, 3.94 and 4.38 m/s), its pace held no more than `ahead` past the body's own,
      its settings searched on the three bodies bare-handed in the guard, calm and in gusts, at
      haste 0 and +50 % (`research/run-cycle-search.mjs`). Asked 4 or 5 m/s, each body settles
      at its own pace, cadence times step: 3.50 m/s for the Warrior, 2.65 for the Rogue and 2.98
      for the skeleton (calm, empty-handed and with the club). Its stride falls short of the
      clips' at the cadence it runs, and no leg muscle but the ankles is at its ceiling there. Its envelope
      (`assets/core/simbicon-run-envelope.json`, each walk set off 10 s and resting 10 s after)
      holds forward by the rule to 4 m/s for the Warrior, and only to 1.2 for the Rogue and the
      skeleton, since a few of their trials at every pace fall. Forward at 3 m/s the Warrior held
      10 of its 10 trials, the Rogue 7 and the skeleton 10; at 4, 10, 3 and 10. So whether a body
      runs is its mind's choice of risk: the envelope keeps
      each way's trials (`StanceEnvelope.tried`), the gait takes any pace that held a fifth of
      them (`REACH`), an order to run or a destination the fastest that held 0.6 (`RUN`,
      `ordered.ts`), and the options fighter closing on a place 0.8 (`SPACE.share`, `walk.ts`).
      In an Arena bout opened at 12 m (`research/bout.mjs`, 8 s), two skeletons close at up to
      2.1 and 1.25 m/s and two Rogues at 1.9 and 2.0, and two Warriors run from 5.25 s, stop from
      about 1.3 m/s and close; all stay up, the Warriors empty-handed and with the club.
    - **Its feet land narrow.** The run places each swinging foot across from the hip's
      abduction in the reference pose, which stands the humans' legs apart, and its lateral
      settings were searched with a cut past a step width of 0.3 of the leg. Its median step
      width at 3 to 5 m/s is 0.31 m on the Warrior, 0.21 on the Rogue and 0.22 on the skeleton,
      against 0.53, 0.40 and 0.33 before. Eye gate: the owner's look at the Warrior's run.
    - **The club is what throws the run.** Scored on gust seeds the search never saw (5 to 8; Node
      stand, Rapier, 120 Hz, asked 1.4 to 5, three stops and two turns, balance 0 %), the trials
      that fell, of 50 each:

      | Body | Empty-handed | With the club |
      |---|---|---|
      | Warrior | 1 | 1 |
      | Rogue | 0 | 16 |
      | skeleton | 0 | 1 |

      The Rogue with the club falls in nearly every trial asked 3.5 m/s or more, 15 to 21 s in: it
      gains speed past what it holds empty-handed, and at about 3.3 m/s its hips sink and its
      trunk goes over. **Open:** a run that does not ask a body past what its legs hold.
    - **A stop soon after the run begins.** A run gives way only from its second landing
      (`RUN_SWITCH.landings`); late in a swing the thigh leans no farther than the straight leg
      reaches the ground, and a landing asked farther bends the stance knee. Asked 1.4 to 3.5 m/s
      and to stop at 2.5 to 8 s (Node stand, Rapier, 120 Hz, calm, balance 0 %), empty and with the
      club, 6 of 96 trials fall: the Rogue with the club (3), and the skeleton as it slows to a
      halt (3), its walk drifting sideways. In an
      Arena bout opened at 8 m the Warrior asked 1.4 runs, stops and stays up, but changes gait
      3.3 s after the Rogue comes near (`tests/move.test.mjs`, a `todo` against 3 s). **Open:** braking faster than the
      planners' 0.3 m/s². A stop from 3.5 m/s takes 7.6 s and 15 m, at the walk's `slowdown`
      (0.47 m/s²); at 0.7 the stop takes 5.5 s and 14 of the 96 fall, the skeleton 10, since its
      guard walk does not take a quicker slowing.
    - **With balance** the gait asks the assist to right the pelvis (`gaitAssist`,
      [assist](assist.md#a-gaits-assist)): on that battery at 25 % the runs that fall go
      from 19 of 150 to 2, the turns from 20 of 60 to 2 and the stops from 18 of 90 to 1. The
      Warrior runs faster for it (3.59 m/s against 3.38), the Rogue and the skeleton slower (2.83
      against 3.15, 3.09 against 3.47). **Open:** what it costs the Rogue's and the skeleton's pace.
    - **Tried and not kept** (that battery): a search with the club in hand (`--holds empty,club`,
      13 generations) found nothing past its start; a run that begins only while the body goes
      across its heading slower than 0.15 or 0.25 m/s, which never runs for the Warrior and the
      Rogue; the club's arm kept in the guard as the other swings (Warrior 4 run falls of 20
      against 6, Rogue no better); a jog clip (CMU 141_34, 2.13 m/s) as the slowest of three clips,
      which scored lower; the run braked at its own rates (`brake`, 1.17 m/s²), which fell 26 of 45
      stops against 16 at the walk's 0.47; and guard arms in the walk after a run.
    - **Departures from the paper:** the late swing lands by the inverted pendulum (Coros 2010)
      in place of the paper's feedback on distance; there is no gravity term through the stance
      leg; gains are a settling time and shares of strength, not N m/rad.
    - **Open:** in about a fifth of steps the pelvis and lumbar alternate from step to step
      (about 2 mrad), traced to the stance hip's spin term; without it the chatter goes and the
      1 m/s walk falls. The skeleton falls on the square and the diamond, its sides and back the
      weakest of the three: 21 of its 80 runs there at Max. Its run turns no faster than
      0.25 rad/s.
    - **Tried and not kept** (the Lab's three tracks, three bodies, seeds 1 to 6, Node stand,
      Rapier, 120 Hz, on the wider gait before it was narrowed):
      - the stance leg's servo on the side way (`vfSide` 2): it speeds the Warrior's and the
        Rogue's square and throws the skeleton's (0.51 to 0.39 of the pace, 19 falls against
        10), capped or not;
      - the landing's trim to the side, which oscillates; forward it brings a slow walk from 1.4
        to 1 of the pace asked, and is a wash on the tracks;
      - the stance ankle's share set per way, and its inversion against the side error
        (`cvAnkleSide`): under 0.01 of the pace on the tracks;
      - more or less lead on the side walk (`leadSide`, `leadOut`): more brings its pace made
        from 0.75 to about 1 of asked, and falls at paces it holds now; less makes it slower;
      - a cadence quickened with the pace (the first state shortened as the walk asked rises):
        worse for every body;
      - a side way searched on the square: its envelope certified side walks the skeleton could
        not hold there.
    - **Later variants of a gait**, each one a character unlocks:
      - **Haste, "more fast":** a faster muscle, not a push. Its knob is Hill's unloaded speed of
        shortening (`ForceVelocityCurve.unloadedSpeed`), which `Physique.speed` already scales;
        strength, mass and gravity stay as they are, so a hasted body cannot float or look
        fast-forwarded. A forward force on the root is rejected: it is an assist, and reads as
        sliding.
        - Built as the attribute (`AttributeSpec.haste`, `jointSpeed`; `&haste=` in the Lab and
          the Arena; [assist](assist.md#haste)). The gait's timing could go with it
          (`SimbiconSettings.hasted`: the gait's times, its run cycle's, and its envelope's speeds
          as the haste to a power, `scaledGait`, `quickened`); measured, the power is 0, since a
          quickened gait steps faster than gravity lets the body fall onto its feet. At +50 % with
          the run as it is, searched at 0 and +50 % together, the Warrior holds 3.67 m/s asked
          5 against 3.38 and the skeleton 3.49 against 3.47; the Rogue goes past 3.5 and falls.
          With balance 25 % as well, nothing of that battery falls but 15 of 300 trials, and the
          three hold 3.68, 2.99 and 3.21. **Open:** a pace past about 3.7 m/s, which no body holds
          at either haste: past it the cycle's stride makes no more speed.
        - **Decided by the owner:** Haste is the legs' muscles alone (the hip's, knee's and
          ankle's exertions in `jointSpeed`), a per cent over the human baseline, 0 by default,
          in `AttributeSpec` as `balance` is, with an `owner-haste` source; strength or the upper
          body join it only where they help locomotion. The Lab and the Arena take `&haste=` beside
          `&balance=`, and a figure on a hasted body names each side's haste. Its range and each
          character's value are the owner's.
      - **Motion capture, "more smooth":** human joint trajectories by phase as the gait's
        targets, with SIMBICON's landing, balance feedback and stance hip on top (Lee, Kim and Lee
        2010, "Data-driven biped control"). The physics drives the body throughout.
        - **The data:** the CMU Graphics Lab database (mocap.cs.cmu.edu), which places no
          restriction on use; cgspeed's BVH conversion (github.com/Shriinivas/cmubvh) adds none.
          Subjects 111, 113, 141 and 143 each walk forward, back and to the side and run in one
          session; 132 walks slow (45 to 50), fast (17 to 22) and back (13); 83 sidesteps; 127
          runs sidesteps (13, 14); 16, 69, 104 and 127 turn. The list is cgspeed's, to be checked
          against CMU's index. Raw clips stay outside the repo as untrusted data; only derived
          tables are committed.
        - **The import:** `research/mocap-import.mjs` reads a clip into what a SIMBICON walk asks
          of the legs, step by step. Five clips read: forward 141_25, 1.08 m/s at 1.84 steps a
          second; 132_17, 1.83 m/s at 2.03; back 141_31, 0.97 m/s at 1.97; side 141_33, 0.58 m/s
          at 1.6 to 1.9; the run 141_34, 2.05 m/s at 2.42. The side and back walks already match a
          person's speeds; forward a person goes faster by longer steps.
        - **Built for the run:** the run tracks three run clips' cycles (16_35 at 2.75 m/s, 16_45 at
          3.94, 102_05 at 4.38; `assets/core/run-cycle.json`, `research/run-cycle.mjs`), its phase running from
          landing to landing, blended by the pace and scaled by Froude (`runCycle`, `cycle-run.ts`).
        - **Left:** the walk's ways: an asset of angles by phase per way and speed, read as the
          joints' limits read them (`jointAngles`); a `SOURCES` entry per clip; a check that the
          reference posed on each body keeps the soles off the floor in swing and on it in stance;
          a tracking walk; and a comparison on the bed and in the Lab, after which the owner
          chooses the default.
  - **Move** (`move.ts`) walks by the first gait whose rule matches (`MOVE`): braced, in the
    stance's guard, while it stands or a standing foe is within 5 m; otherwise by the SIMBICON
    walk free to run, which runs where the pace asked is past its walk's. A rule lets go of its
    gait half a metre past its distance. The Scrapper gets about by the stride. Classic and the
    options fighter get about by it; an Arena bout opens at 4 m, so it fights braced from its
    first step. The options fighter closes on a place as fast as held 0.8 of its gait's trials and
    it stops from before it (`walker`); Classic's tactics close at the walk. The Crypt's and the Lab's orders
    give a destination, and a person in the Arena runs with Shift (`Orders.run`): each is asked
    the fastest pace forward that held 0.6 of its trials (`orderedIntent`), the Crypt's slowed for its route's corners
    (`CORNER`, `src/dungeon/run.ts`). The walk and the run are one machine and change at once; a
    gait that drives the legs is asked to stand before it changes to another.
  - **The stride does not help a fight**, so a fight is in the stance's walk. In the
    empty-hand league (Node, Rapier, 120 Hz, 66 bouts a striding entrant, at the stride's
    earlier settings: a 0.3 s swing after 0.08 s on both feet), each preset on the stride rates
    under itself on the stance's walk:

    | Preset | Stance's walk | Stride |
    |---|---|---|
    | Puncher | 1546 | 1412 |
    | Scrapper | 1204 | 1126 |
    | Classic | 400 | 312 |

    The Puncher on the stride falls 1.74 times a bout against 0.11; its straight punch drives as
    soon as its foe is in the band, mid-step. Waiting for both feet as the drive begins
    (`landed`) brings that to 1.45; waiting 0.1 s on both feet (`settle`) cures the falls but
    loses every bout to today's Puncher, and no `EDGE` helps.
- **A half turn at the next rate past the envelope's still now and then runs away sideways and
  falls**, one to three of 56 in four cells: after the turn the walk's plan outruns the pace asked
  ([human and strikes](human-and-strikes.md#turning)).
