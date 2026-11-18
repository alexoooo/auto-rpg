# Initiative

**Ordered by the owner, next after this pass at [the back step](2026-11-16-back-step.md)**, with
no further word: a setting named Initiative in the Arena Mind's Objective beside Aggression, that a
person sets and watches. Begun once the back step lands, or, if its order (the skill, the pricing,
bars 3 and 4 read again) leaves bars 3 and 4 unmet, then, and the back step's bars read again with
it set. Begun: the back step's order left bar 4 unmet (its plan, item 3).

## The goal, in the owner's words

On 2026-11-18, to the reviewing session: "would the 'cost on delay' be a new Mind configuration
like aggression (something like 'initiative')? how would it work?" and "re having it in the
Chooser vs the Objective, is this an arbitrary choice, or does it have a most natural place to
be?" Later the same day: "was the Initiative setting added? i don't see it in the Arena Mind under
Objective"; and, asked whether now or behind the back step: "queue Initiative behind the back-step
work, if the idea is for me to see it to decide if we want it, then i would need to see it in
order to see it." And: "re theback-step plan, if we're not able to make it work, then do the
Initiative plan, which might unlock the back-step."

## Where it stands

**Built.** Initiative is a setting of the few terms beside Aggression (`SETTINGS`,
`src/minds/option/objective.ts`), a rate a second from 0 to 0.3, none unless set: life the body
deals counts less by that rate the later in a line it comes and more than itself sooner, scaled so
that over the horizon it counts as itself on the mean (`initiativeWeight`); life taken counts as
itself. So a blow now is worth more than as much later, and a line that deals evenly, or deals
nothing, is worth what it was.

**Where it lives, the owner's question.** In the objective, as Aggression is: it is what a body
values, a blow now against one later, and its meaning is the few terms' alone. The objective
interface names nothing of it: an objective may say what life dealt or taken counts for by when in
a line it comes (`Objective.weigh`), and the chooser, which alone knows when, asks as it adds a
line up, knowing nothing of what the weight means. The chooser's own half-life (`halfLife`, a
discount on both sides alike, which won nothing held out, 0.483, and on the back step's mirrors
lowered both, not the gap) is removed: one way to weigh time, the objective's.

**The first mapping, dropped**: life dealt alone fading at 0.2 a second, unscaled, made every
trade worth less than waiting; two Warriors waited out every bout (bar 3's 144 bouts all drained,
the first punch at 85 s, 1.1 HP lost a minute). Scaled, at 0.05 and 0.1 the empty-handed mirror
fights as the game's (standing silence 10% and 8% against 8%, 24 gaps).

## What done is

1. **Initiative is a field of the Objective in the Arena's Mind picker**, beside Aggression, which
   a person sets and watches a Warrior fight by. How it maps to a cost on delay is the worker's;
   where it lives (the Objective or the chooser) answers the owner's question of its natural place,
   with the reason written here.
2. **Off unless set**: the fingerprint unmoved, and the empty-handed mirror plays to the bit.
3. **Read once**, as a kind is (the scorecard and the match), each figure with its spread. It stays
   in the picker whatever it reads: the owner decides by watching.
4. **The back step read with it set**, where the back step had not landed: bars 3 and 4.
