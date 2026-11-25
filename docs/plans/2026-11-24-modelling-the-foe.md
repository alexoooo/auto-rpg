# Modelling the foe

**Begun 2026-11-24, by the owner's order**, relayed through the reviewing session, after capture
steps (read in [the approaches](../approaches.md#travel): the catch holds shoves, and no catch
tried spared the bouts' falls).

## The goal, in the owner's words

On 2026-11-23: "i do want opponent modelling, but also from what i understand, what we already
have it pretty slow. how could we approach this in a way that's scalable?" On the order: "after the
kick is fine". On its place before striking a fallen foe: "the modelling will make thinking cheaper
which will speed up the rest of the work that follows."

So the game's Mind predicts what its foe will do from what it can see, at no more thinking than it
spends now, and fights at least as well; a cheaper Mind that fights as well is shown to the owner
as one, a stronger one as one.

## What is known before it starts

- **The game's Mind already models its foe twice**: its tree chooser carries the foe on its
  velocity for `carry` s in the states it searches ("Foe keeps moving", 0.5 in `option-truer`), and
  searches one reply of the foe's with the Mind's own Options (`replies` 1, `repliedSearch` in
  `src/minds/option/chooser.ts`). The reply search is the slow part the owner means; its cost and
  its worth have not been read apart.
- **A Mind cannot see its foe's Options** by design (`sensedSpec` drops skills), so a model learns
  from what is seen: the foe's motion, stance and the actions its body shows.
- **The boosted-trees machinery is in hand**: the fitted value (`src/minds/option/fitted-value.ts`,
  `research/minds/fitted-value.mjs`) and the move prior (`research/minds/move-prior.mjs`) collect
  rows from bouts, fit trees and walk them in the search.

## Steps

1. **The baseline.** On recorded warrior-drawn bouts of the game's Mind, how well carrying the foe
   on its velocity predicts where it is over the next second and whether it strikes; what a
   decision costs with the reply search and without; and a match of the Mind with replies against
   it without.
2. **A predictor from what a Mind sees**: the foe's motion over the next second and whether it
   strikes, fitted with boosted trees on rows from those bouts, read against the baseline on bouts
   held out.
3. **Into the search**: the foe's predicted motion in place of carrying it, or one predicted reply
   in place of the reply search, the search's budget unchanged; pickable in the game as its own
   setting before it is judged.
4. **The match**: the Mind with it against the game's Mind, and the thinking each spends.

## After it

The order, the owner's, 2026-11-24: striking a foe who is down (the low attack, the stomp made to
work), then the kicker's own falls after kicking, then the game's Mind's knockouts within 60 s
(80.1 % against the bar's 90 %) if they are still short. Numbers and the testbed's rest stay
parked. Each gets its own plan when begun.

### Striking a foe who is down

The owner, 2026-11-24, on a fight with the kick: "i do like that the rate of falls increases,
because it sets us up to work on the ability to hit an opponent that's not upright (the current
stomp doesn't really work but we needed more falls to be able to work on that, and i think the new
kick does get us there)". On its place: "i think we can do that after the modelling. the modelling
will make thinking cheaper which will speed up the rest of the work that follows." On the strike:
"Re the low attack, it doesn't have to be a stomp, it can be like kicking a football or anything".
So its strike is chosen by what lands and takes life from a body lying down (a stomp, a low
swinging kick like a football kick, or another), as the push kick was chosen for falls, and a new
skill or variation enters pickable, as the kick did.

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
