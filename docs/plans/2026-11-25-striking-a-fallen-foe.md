# Striking a foe who is down

**Begun 2026-11-25, by the owner's order**, relayed through the reviewing session, after modelling
the foe (read in [the approaches](../approaches.md#minds): the game's Mind's play does not move
with how it models its foe; `option-lean` thinks half as much and plays as well).

## The goal, in the owner's words

On 2026-11-24, on a fight with the kick: "i do like that the rate of falls increases, because it
sets us up to work on the ability to hit an opponent that's not upright (the current stomp doesn't
really work but we needed more falls to be able to work on that, and i think the new kick does get
us there)". On its place: "i think we can do that after the modelling. the modelling will make
thinking cheaper which will speed up the rest of the work that follows." On the strike: "Re the low
attack, it doesn't have to be a stomp, it can be like kicking a football or anything".

So the game's Mind takes life from a foe lying down, by whatever strike lands on a body there and
wounds it (a stomp, a low swinging kick like a football kick, or another), chosen as the push kick
was chosen for falls, and a new skill or variation enters pickable, as the kick did.

## What is known before it starts

- **The stomp is the man's only strike at a body lying down**: a chamber, a braced stroke and a
  square-up step (`src/skills/strikes/stomp/`, `41c828d4`), landing 2.60 s from the order at a
  body lying, against the punch's 0.22 s and the push kick's 1.03 s at a man standing
  ([the skill recipe](../recipes/skill.md), the kick).
- **The game's Mind prices it far over what it gives**: a stomp at a downed foe was priced 12
  times what followed (17 choices in 72 mirror bouts; the approaches' Minds).
- **The foe is down often, and the kick cost bar 2**: the push kick's kicker is down after about
  two kicks in three. On the scorecard (warrior-drawn, at 3a7341cb5, `research/runs/low/`) the
  game's Mind knocks out within 60 s in 34.8 % (26.7 to 43.9) of its mirror bouts, with 4.17
  downs a bout, against 80.8 % (72.9 to 86.9) and 0.96 for the same Mind with the kick's Option
  taken out (115 and 120 bouts, the budget's share of 216). Of its 17,521 choices, 6,305 were
  made with the foe down, and 206 of them dealt.
- **It lands on other bodies**: against the Rat, four stomps on its trunk took 0.80 of its bar,
  the stomp that misses a man lying down meeting the rat's back at its height
  ([the Rat's plan](2026-11-24-rat.md)).

## Steps

1. **What the stomp does at a man lying down**: in the game's Mind's bouts, each time the foe is
   down, what the Mind does, how often it stomps, where the stomp's foot lands against the lying
   body, and what life it takes; and on a drill of a man lying in the falls the bouts give.
   *Read* (`research/runs/low/`, at 0408c68ee). In the game's Mind's 144 warrior-drawn bouts a
   side's foe was down 7,169 s (523 stretches, a median 6.9 s, 1.5 m apart at their start); the
   side was down itself in 54 % of it, and standing it lay flat or braced more than it struck:
   stomping 13 % of the time, kicking 2 %. Of its 243 stomps 117 swung, 45 gave up at the
   square-up step and 40 at the chamber; the first came a median 4.8 s into a stretch. What the
   foe lost while down was 80 hp in all, 0.67 hp a minute: stomps' swings 41 (0.38 hp a blow),
   kicks' drives 17, the rest contacts in falls and braces. On the drill the stomp lands on a
   man lying still in 61 % of trials, 2.6 s from the order at 4.8 m/s and 28 J; at a foe laid
   down that fights back (`sparring-laid`) it is begun in 56 %, lands in 15 % at 3 J, and its
   striker falls in 28 %. The stomp is slow and the foe does not wait for it. The push kick's
   record aimed down at a man lying still, its window's height band lowered and nothing
   searched, reaches him 1.1 s from the order at 5.3 m/s but lands on the mark in 5 % and falls
   in 61 %.
2. **The strike chosen**: the stomp mended where step 1 shows it fails, or a low kick at a lying
   body, read on the same drill by life taken a second; the one that does most enters pickable.
3. **Into the game's Mind**: its price against what it gives, then a match of the Mind with it
   against the game's Mind, and its knockouts within 60 s.

## After it

The order, the owner's, 2026-11-24: the kicker's own falls after kicking, then the game's Mind's
knockouts within 60 s (80.1 % against the bar's 90 %) if they are still short. Numbers and the
testbed's rest stay parked. Each gets its own plan when begun.

### The kicker's falls after kicking

The owner, 2026-11-24: "Re the excessive falls after kicking, I do want that addressed, but only
after modelling and better low attack (stomp)". Where it starts: in fights the push kick's kicker
is down after about two kicks in three, a kick that misses as often as one that lands; the
standing foot leaves the ground late in the drive as the leg is braked onto its goal, and a softer
brake fell less but reached less and lost the match (the skill recipe's kick findings,
`a5fff57da`). The stance's catch does not reach what the drive sets going (the approaches'
Travel).

### The knockouts within 60 s, by the skills

The owner, 2026-11-24: "for the pace bar, i think we might need to iterate on the stand-up skills
and maybe other skills to get there, because right now they are spending most of their time
tangled on the ground. in other words, i think it will take more than just hyperparameter tuning,
it wmight require significant skill iteration (which is fine)." So the bar is reached by iterating
the skills, the way up first, not by tuning the Mind's settings. The readings so far agree: of 536
falls without a blow in the Option Mind's bouts, 183 came during a way up, and the way-up cells
replayed for the man read worse on shoved falls (the skill recipe's way-up section).
