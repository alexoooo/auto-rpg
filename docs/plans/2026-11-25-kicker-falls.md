# The kicker's falls

**Begun 2026-11-25, by the owner's order**, relayed through the reviewing session, ahead of more
work on the low attack ([the approaches](../approaches.md#unarmed-strikes), the kick's findings: the low
kick is pickable under Stomp and the Warrior does not hold it).

## The goal, in the owner's words

On 2026-11-24: "Re the excessive falls after kicking, I do want that addressed, but only after
modelling and better low attack (stomp)". On 2026-11-25: "re the kicks, yeah reducing falls of the
kicker should be the main priority now they basically work".

Later on 2026-11-25, having looked at the push kick: "it looks extremeyl uncoordinated, basically
the warrior is flinging himself into the ground"; "our standard approach is to make the movement
using authored code, to make it work some of the time, and then to ttune that with machine
learning. did you follow the standard procedure?"; "i want *you* to develop the skills, not me";
"i don't want to waste multiple days again, how do we change teh skill development process to force
you to follow the instructions?"; and, on staying up as the score's rule, "what if the skill
requires being on the ground, liek grappling?".

So the kick is rebuilt by [the procedure](../recipes/skill.md#the-procedure): authored, looked at,
made to work some of the time by hand, and only then tuned over its timings and gains.

So the kicker stays up after a kick, the push kick's and the low kick's alike (both are the kick's
executor, `src/skills/strikes/shared/kick.ts`), without losing what the kick lands, and the game's
Mind's knockouts within 60 s come back toward what they were before the kick.

## What is known before it starts

- **The kick costs the game's Mind bar 2 by its falls**: on the scorecard (warrior-drawn) the
  game's Mind knocks out within 60 s in 34.8 % (26.7 to 43.9) of its mirror bouts with 4.17 downs
  a bout, against 80.8 % and 0.96 for the same Mind without the kick (`research/runs/low/`);
  `option-lean`, the game's Mind since `fcb0b9401`, reads 34.7 % and 3.88.
- **The push kick's kicker is down after about two kicks in three**, a kick that misses as often
  as one that lands; the standing foot leaves the ground late in the drive as the leg is braked
  onto its goal. A softer brake (100 rad/s² against 365) fell after 57 % of kicks against 68 % but
  reached less and lost the match 0.347 (`a5fff57da`). The centre held 0.1 m ahead of the standing
  sole fell after 44 of 94 against 68 of 103 and lost 0.469 (the skill recipe's kick findings).
- **The low kick falls in 31.5 % of its trials at a foe laid down** (27.7 % for the stomp) and in
  41 % at one lying still; tuning its schedule at a foe that fights back read flat
  (`research/runs/low/`).
- **No catch spares these falls**: at the set-down's start the capture point is already past the
  standing heel by more than the longest catch reaches (the approaches' Travel).
- **Untried before it**: the stance on the standing leg bracing for the jolt of the braked leg, so
  the standing foot stays down through the brake. The whole-body solve already carries the drive's
  pushes, so the stance braces as far as its strength lets it; a faster pose (0.05 s) stalls the
  transfer, a slower one (0.3 s) fell in 21 of 32.

## Where it stands

- **Step 1, where the standing foot leaves the ground: read.** On the drill's middle rung every
  push kick throws the pelvis back as the hip drives and puts the standing hip on its extension
  stop, kicks that end down and kicks that stay up alike. Leaning forward in the drive cut the
  drill's falls from 10 of 32 to 2, and changed nothing in fights: the drill's falls are not the
  fights'. In fights 97 % of the game's Mind's kicks meet the foe, from 0.8 m centre to centre,
  and the kicker was down after 77.6 % of those that drove, in the set-down, a third after a blow
  (`research/runs/falls/`).
- **Step 2, the set-down: landed.** The set-down's step back to where the foot stood is gone; the
  stance's own standing catches the body, as in the recentre: down after 65.7 % of kicks, the
  scorecard's knockouts within 60 s 38.9 % against 34.7 %, level in the match; at `b207cee32`
  the game's Mind reads 45.1 % (35.8 to 54.8) and 3.59 downs a bout, `option-truer` 38.6 % and 4.01. A step aimed at the
  capture point read flat; a re-chamber under the pose before the step fell more.
- **Leaning 0.45 in the drive, on the new set-down**: down after 54.6 % of driven kicks in fights
  against 65.7 %; its match and scorecard were stopped unread, the movement itself to be rebuilt.
- **The push kick's look: not the motion.** Its frames (`research/looks/man/kick-push/`) show no
  chamber, extension or retraction: as the hip drives the leg up, the trunk is thrown back like a
  seesaw, and the folded leg is jammed into the foe. On its drill it lands 7 of 14 and ends standing
  in 11. The flat-out pushes at the hip and knee toward a goal in the root's frame make the
  reaction, and the one-foot pose cannot hold it. Its searches are refused (`requireLook`).
- **The authored kick, `kick/front`: looks like the motion, lands nothing yet.** Pickable beside
  `kick/push`, in no Mind. The kicking leg is carried along timed joint paths (`frontKickExecutor`,
  its own settings `FRONT_KICK_PATH`), through a chamber with the knee brought up at the target, an extension along
  the line at it and a retraction, the stance on the standing leg solving for what the paths ask,
  and the stance's own set-down. Its look (`research/looks/man/kick-front/`): a push kick, the
  pelvis and trunk leaning back against the leg as a person's do, the standing foot down; on the
  drill it ends standing in 13 of 14 and lands none, the foot meeting the foe's lower trunk, under
  the mark, or its arms. Found by hand on the way: at the motor's own response the stance's solve
  holds a leg reaching forward short of its path (the knee stopped at 0.7 rad), at 0.03 s it
  straightens (`pathSeconds`); the window 0.7 to 1.0 m put the foe inside the leg's reach and 0.95
  to 1.15 beyond it, 0.8 to 1.0 holds it.
- **The front kick's mark is the base.** A person's push kick goes to the belly and hips, and the
  rules take a blow there as from any of the trunk (life ×1 on a man). Aimed at the middle mark,
  the front kick struck the lower trunk in 6 of 14 (three 0.43 to 0.47 of a life) and the guard in
  6. So the base (the body's `marks.base`, its lower trunk) is a mark, and the kick's cell reads it
  beside the middle (the `base` rung); the kick Option offers it after the middle, so a Mind
  without orders aims as it did. Aimed at the base's centre, the front kick lands 2 of 14 there
  (light blows) and falls in 4, against 1 aimed at the middle: the leg's line has to be aimed
  above where the foot meets, which bends under it. A chamber and extension solved to put the foot
  at the middle mark's height tucked the kicker and laid the trunk back about 45°: reverted.
- **The front kick works some of the time, and trades far less than the push kick.** Its leg's
  line aimed 0.17 m over the mark (`aimAbove`), on the base rung it lands 3 of 14 (two of them
  0.37 and 0.45 of a life), is down after 1 and trades 0.018 a second; the push kick there lands 11
  and trades 0.577, by throwing its trunk back and driving its folded leg into the foe, who steps
  back. The front kick is guarded in 12 of 28, its foot meeting the foe's low hands before its
  belly, and touches more than drives where it meets (`research/looks/man/kick-front/`).
- **What a kick strikes is its height band, one source.** The owner: "what if the opponent is very
  short or tall, or not even humanoid -- how does that work in a simple and general way?" A kick
  strikes a target from `low` to `high` over its kicking sole as shares of its own leg's reach, and
  refuses one outside it as `beyond` (`Readiness`); a strike Option takes its regions in order at
  the first its skill does not refuse so, and a drill does not count a trial so refused
  (`strikeOffered`). Its window is in shares of the leg's reach too. The front kick's band, 0.9 to
  1.15 of the man's leg, holds his base and not his middle; set by hand from where its foot meets.
- **The front kick, from closer, stands every time.** Its window 0.7 to 0.9 m ahead (from 0.8 to
  1.0): landed 7 of 14 (one 0.77 of a life, most 0.04 to 0.15), guarded 5, down after none, value
  0.035; at the old window it went down after 5 of 14 at the middle. Its neighbours, 0.6 to 0.85
  and 0.75 to 0.95, landed 5 and 6 and fell once each; `aimAbove` 0.12 and 0.22 there landed 4
  and 3. The hips driven through behind the foot (the centre 0.1 and 0.2 m further ahead through
  the extension) landed 4 and 3, lighter, and fell 2 and 3: not kept. The push kick on that rung:
  landed 11, down after 2, value 0.577 (`research/looks/man/`).
- **A search found a kick that stands only at 120 Hz.** The front kick's timings, gains and window
  searched at 120 Hz on its empty-handed base trials: its best by generation 35, 0.368 (no falls),
  a faster kick (chamber 0.106 s, extension 0.071 s, path response 0.013 s); on the cells' cases,
  0.332 and 1 fall in 32 at 120 Hz, 0.054 and 21 falls at 480. Its response raised to 25 ms: 0.119
  (3 falls) and 0.185 (1); its brake back at the record's as well: the same. A response within two
  steps is softened by a 120 Hz step alone: its search's response starts at three (25 ms), and a
  search reads its rising best at 480 Hz as it goes. The same floor on every freedom's response
  (`servoAsk`) moved only the reptile's righting, which drives its placing leg at 8 ms: with it, its
  longest time down in the fingerprint's reptile bouts went from 0.1 to 1.7 s to 3.7 to 16.8 s at
  120 Hz, and to 24.5 s at 480. That floor waits on the reptile's righting working at 25 ms.
- **Next**: step 4 again, searched at 120 Hz from 25 ms; then step 5, as the owner asked:
  confirmed at 120 and 480 Hz, its look at the best's code, its profiles, and the match and
  scorecard against the push kick as the Warrior's kick. It lands as the kick the Warrior holds
  only if it measures no worse, and stays pickable either way.

## After it

The owner's order: the low attack in the game's Mind (the low kick's own profile, so the Mind
prices it by measurement, and whether, its falls fewer, it takes bar 2 back), then the game's
Mind's knockouts within 60 s by the skills, the way up first (the owner, 2026-11-24: "it will take
more than just hyperparameter tuning, it wmight require significant skill iteration (which is
fine)"). Numbers and the testbed's rest stay parked. Each gets its own plan when begun.

A floor on every freedom's response is held back: in `servoAsk` (`src/control/servo.ts`),
`n = 1 / Math.max(FASTEST_RESPONSE, feed?.seconds?.(i) ?? seconds)` with `FASTEST_RESPONSE = 3 / 120`
s, three steps of the game's rate, the same at every rate. It moved only the reptile's two arena
bouts in the fingerprint: its righting (`righting-routes/tuning.ts`, `placementServo: .008`) drives
its placing leg at one 120 Hz step and rights it at both rates (its longest time down 1.7 and 0.1 s
against the reptile, 1.5 s against the man at 120 Hz; 1.5, 2.1 and 3.9 s at 480); with the floor,
3.7, 16.8 and 8.1 s at 120 Hz and about 24.5 s never rising at 480. It lands only with that
righting made to work at 25 ms, its waits (`foldWait`, `pressWait`) and arrival test
(`placementError`) timed for a one-step drive.

A decision still lands in the one step it is made in (the approaches' Minds,
`research/runs/lean-time/`): spreading it over the steps until the next one is the lever, not yet
asked for.
