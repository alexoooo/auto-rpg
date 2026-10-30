# Drills by orders, and the choices a body has

## Why

A drill that takes a mind's body over by a decider of its own needs a hook in every kind of mind
for it, and one more for the mind's own fight before a fight rung's moment: every new mind must
learn every drill, and Option Mind ran a second copy of its own chooser inside one.

Every game mind already obeys orders (`Orders`, `src/core/mind/orders.ts`): a person's in the
Arena, a Commander's in the Crypt. A drill is then a Commander leading the subject's side as a
team of one, giving orders; the mind carries them out as it would anyone's, and no mind knows a
drill exists. Orders are graded from general to specific (no `foe`, the mind picks whom; a `foe`
with no `region`, it picks where); they gain an action and a limb the same way, so a drill asks
for one skill with one hand and a Commander for as little as it likes.

What a body can choose at a moment, its menu, is the body's and the same for every mind: each
action it has, with each limb it can use now, at each foe and region, and whether it could start
from where it stands. A Commander reads it to know what to order and why an order is not carried
out; a person reads it beside what the mind weighed (`Engagement`) to see what is happening, and
plays turn by turn by pausing where the menu changes and giving an order from it.

**The owner's decisions** (2026-10-30): drills are driven by orders, not by taking the mind over;
orders may name the action and the limb, each optional; the menu of a body's choices is shown in
the Arena, which can pause on a choice and play turn by turn; one plan for all of it.

**Decided here, which the owner may reverse**: the drill Commander walks the body into the
action's window itself with a move order, as the drill decider does now, so the rungs read the
skill from the same approach for every mind (a rung that leaves the approach to the mind is a
protocol of its own, not built here); the menu reads each action as from a neutral stance (the
heading, support and footing the body has, no walk), as the drills read readiness now; an order's
region is a `Region` (`src/core/skills/action.ts`), a mark or a segment.

**What must not move**: every fingerprint case through step 6 (`scripts/fingerprint.mjs`: no
recipe names a Commander and no order names an action today); the Mind and Commander contracts'
boundaries (`tests/core-boundary.test.mjs`). The drills' readings move from step 7, each a new
protocol, read paired against the records before it.

**With the other plans**: this replaces the [layering plan](2026-10-29-layering.md)'s step 7 for
drills (no drill decider is left to make a `Decider`; the Lab's scripts stay its own). Step 2 here
adds to the mind's report (`MindReport`, `skillsReport`) what the layering plan's step 2 then has
the mind assemble; either may land first. The [Commander plan](2026-10-29-commander.md)'s team
reads the member's view this plan widens.

## Steps

Each lands green on its own: `npm run check`, `npm test`, `npm run build` where browser code moves.
A step that touches the toolkit and an entrant lands as two commits, the toolkit's first
(`node scripts/entrant-check.mjs`), each toolkit commit read with the fingerprint.

### 1. A bout hosts a Commander per side

A bout's recipe names a Commander for a side (`DuelRecipe.commanders`, a `CommanderConfig` by
side), which the duel hosts as the Arena leads a side now (`teamOfOne`, `src/arena/team.ts`):
asked each step in the sensing phase, its orders given to the side (`Duel.order`) and so on the
tape; its memory in the duel's state, so a bout forks with it. A side the page leads and the
recipe names one for is refused. A recipe that names none plays as before.

Check: the gate; the fingerprint unchanged.

### 2. The menu, and what a body reports of its actions

The mind's report (`MindReport`, made for every mind from its skills by `skillsReport`) gains,
from the skills, for every mind alike:

- **its kit**: each action it has now, by its name, its executor's kind (`recipe-strike`,
  `straight-punch`, `front-kick`: what the skill is, named alike across minds), the limbs it can
  use now (what the hands hold counts: `armedActions`) and the regions it aims at;
- **what is under way** (`SkillReport.actions`: each action's id, name, limb and phase) and **what
  ended** (`SkillReport.ledger`);
- **the menu**, computed when read: for each action of the kit, each limb, each foe sensed and
  each region the action aims at (an action with no target once), its readiness from a neutral
  stance (`Readiness`: ready; out of position, with the window; waiting; refused, with the reason).

Reading the report changes nothing: a test in `tests/mind-contract.test.mjs` plays each game
preset's bout reading the whole report, menu and all, every step, and one reading none, and holds
the two equal to the bit. The step-cost test reads no menu, so its time does not move.

Check: the gate, with the new case and a control that a menu read which moved the body is seen;
the fingerprint unchanged.

### 3. A Commander sees its member's kit, actions and menu

A member's view (`MemberView`, `src/core/command/team.ts`) gains its kit, what is under way, what
ended and its menu, from its mind's report; null where its mind reports none. The Arena's team of
one, the Crypt's and the duel's (step 1) fill them.

Check: the gate; the fingerprint unchanged.

### 4. Orders name an action, a limb, and a region by mark

- `Orders` gains `action` (a name of the mind's kit) and `limb` (an effector: `hand.right`,
  `foot.left`), each optional and each, as `region`, only with a `foe`; `region` becomes a
  `Region`. `isOrders` checks them; the persisted order format's version moves
  (`ORDERS_PROTOCOL`); the Arena's strike from the pointer gives its segment as a region.
- **One rule** in `orders.ts` says what an order allows: of a foe, an action, a limb, the regions
  to aim at (the order's, else the action's). Every reader that carries out an order calls it,
  where each now copies the region's line: the fighter's action tactics
  (`src/core/mind/action-tactics.ts`), Vanguard's exchange (`entrants/vanguard/exchange.ts`) and
  Option Mind's orders and strike options (`entrants/option/options/orders.ts`, `strike.ts`). An
  action the order names is a candidate even where the mind's own rules would not choose it now,
  as an ordered foe is its focus.
- A test in `tests/mind-contract.test.mjs`: each game preset that obeys, ordered to strike a still
  foe with one of its actions and one of its limbs, begins no other action with no other limb.

Check: the gate, with the new case; the fingerprint unchanged; a toolkit commit, then each
entrant's.

### 5. The drill Commander

`src/core/command/drill.ts`, a Commander kind: the target (the nearest foe), and the action, the
limb and the region, each optional (one left out is the first menu entry that fits the rest and
could start or be walked to, kept once taken; a region the menu does not offer for the action is
refused), how long the body stands first, the pace, whether it asks while walking, and the moment
(absent, from the start; n, from the step the mind begins its nth action of its kit with a region,
the order taking that one's place). From its moment it orders the body to stand for its settle,
walks it into the action's window at the pace, braking as it arrives (a move order to the window's
middle: the menu's spot, `MenuEntry.spot`, which beside a body lying carries the way round it), and once it has stood settled there a moment (or walking, where it asks so) orders the
attack with the action, limb and region, kept until the action ends; with a let-go time, it orders
a stand that long after the action began. Every order is firm (`Orders.firm`: carry them out
first). Before its moment it orders nothing, and the mind fights. It reports its phase and the
ordered entry's readiness (`MemberReport.task`).

Check: the gate; the Commander contract's boundary.

### 6. The Strike drill on it

The Strike drill's cases name the drill Commander for the striker's side and leave the subject's
mind as given (`StrikeSubject`). The reader reads the striker's report and the Commander's: the
outcomes keep their names, `outside`, `waiting` and `refused` read from the ordered entry's
readiness when the patience runs out. Every protocol is new.

Check: the gate; the still and fight rungs of `option/club-blow@buckler,club` and
`option/straight-punch`, and the fight rung of `duellist/swing high`, read paired against their
records before (`npm run compare`); each moved figure named; the reels watched.

### 7. The Gait and Cover drills on it

- The Gait drill goes at its foe at a speed by a gait: orders gain `gait` (a gait's name,
  `GaitName`), narrowing the legs as `action` narrows the skill, honoured by the minds whose legs
  go by gaits (Option Mind's walk options, Move's rules); the drill Commander goes at the speed by
  the gait, stops where the menu says the action would start but for its speed, and orders it.
- The Cover drill's subject stands facing the striker (the stand Commander, `stand.ts`: a firm
  stand order with a face); the mind covers by itself.

Check: the gate; each drill's rungs read paired against their records before; the reels watched.

### 8. The takeover deleted

`drill-tactics.ts`, `drill-gait.ts`, Option Mind's `drill-cover.ts` and `fight.ts`
(`option-fight`), its `scripted` option, `Controller.drilled` and `Controller.fight`, `drilledBy`
and `fightOf`, and the planners' `drill` and `drill-gait` entries. The architecture says how a
drill drives a body; the layering plan's step 7 keeps the Lab's scripts alone.

Check: the gate; the fingerprint unchanged; every drill's rungs play.

### 9. The menu in the Arena, and play turn by turn

- The Arena's readout of a side shows its menu beside what its mind weighed (`Engagement`): each
  entry's action, limb, foe, region and readiness.
- **Pause on choice**, a setting: the page pauses where the led side's menu changes in what it
  could do (an entry turns ready and holds so for a moment, an action ends, a foe is newly sensed,
  the body goes down or gets up). Paused, the person picks an entry, given as an order with its
  action, limb, foe and region (the lead's strike gains the action and the limb), or lets the mind
  go on. The orders are on the tape, so a bout played so plays again.

Check: the build; in a browser, a bout played turn by turn and played again from its tape; the
owner plays one.

## Done when

Every drill drives its subject by a Commander's orders and no mind holds anything of a drill; a
Commander reads its members' kits, actions and menus; orders name an action, a limb, a gait and a
region by mark, each mind honouring them by one rule; the drills' rungs read paired against their
records before; the Arena shows a side's menu and plays turn by turn, and the owner has played a
bout so.
