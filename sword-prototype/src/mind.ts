import type { Vector3 } from "@babylonjs/core/Maths/math.vector.js";

// Explicit `.ts` extensions, for the reason `fighter.ts` gives at length: Node
// runs a TypeScript file by stripping its types, and Node's ESM resolver insists
// on the extension where Vite does not care. The two `import type` lines erase
// to nothing, which is what keeps `input.ts` -- and through it the DOM -- out of
// the graph a headless harness loads; the two below them are real, and
// everything they reach is `config.ts`, which reaches nothing.
import type { HumanOwnership } from "./input.ts";
// `hands.ts` imports nothing, which is the property that let the kinds move
// there in the first place. It is also why this one can be a real import rather
// than a type-only one and still cost a headless harness nothing: there is no
// graph behind it to pull in.
import { HANDS, otherHand, type HandName, type WeaponKind } from "./hands.ts";
// The mouse adapter's own reach constants. `buttons.ts` imports nothing at all -- which is what
// makes it loadable by a Node test, and what makes this edge safe in a file whose whole value is
// that Babylon and the DOM are not in its graph. The rest intents below need the same neutral a
// person's un-pressed hand asks for, and stating it twice is how two of them would part company.
import { BUTTON_REACH } from "./buttons.ts";
// The dependency on `policies.ts` runs one way only: `policies.ts` takes
// `Intent`, `Mind` and `FighterView` from here and all three of them are types,
// so they erase and there is no module cycle at run time. That is worth the
// small cost it imposes over there -- `policies.ts` writes its own blank intent
// rather than spreading `NEUTRAL` -- because a cycle that happens to work
// because nobody reads the constant during evaluation is a thing that stops
// working when somebody moves a line, and it stops working in the browser rather
// than in a test.
//
// The two cursor inverses come from `policies.ts` rather than being written
// again here, because there are already three copies of that one mapping in the
// tree -- `fighter.ts`'s `spread`, and the two directions in `policies.ts` -- and
// a fourth would be the one that drifts. See `cursorForPose` below for what
// depends on them agreeing.
import {
  cursorForAzimuth,
  cursorForElevation,
  blankIntent,
  postureFor,
  archerMind,
  duelistMind,
  swingerMind,
} from "./policies.ts";
import { CONFIG } from "./config.ts";
import { crawlerMind } from "./bodies/centipede.ts";
// The two surface tags, from the leaf that owns them. Taking either from its own endpoint would
// close a run-time cycle -- both endpoints import this file for values, and `POLICIES` below reads
// the tag while this module is still evaluating. `control-surfaces.ts` imports nothing at all.
import {
  GOLEM_CONTROL_SURFACE as GOLEM_SURFACE,
  HUMANOID_CONTROL_SURFACE as HUMANOID_SURFACE,
} from "./control-surfaces.ts";
// The golem's own mind, registered here for the reason every other policy is: the list *is* the
// registry the setup screen builds its picker from, so a policy that exists is selectable and a
// policy that is selectable exists. It reaches this file for types only, so the edge runs one way
// at run time and there is no cycle to be careful about.
import {
  golemBrawlerMind, golemChampionMind, golemDuelistMind, golemFencerMind, golemFormMind,
  golemGuardianMind, golemNeuralMind, golemPlannerMind, golemSelectorMind, golemSkirmisherMind,
  golemLearnerMind, golemTacticianMind,
} from "./golem/golem-policies.ts";

/**
 * What a fighter can ask for.
 *
 * **A policy plays with the controller you play with**, and Session 12 changed
 * which half of that sentence is load-bearing. It used to mean that the *policy*
 * was held down to what a mouse can say -- two aiming axes and two buttons per
 * hand -- with everything else, the reach and the shape of a stroke, decided
 * inside the body. Measured, that left `golem-duelist` asking for one distinct
 * reach and one distinct roll per hand across eight bouts while the chain it was
 * driving ran a scripted stroke on 11 % of frames and ignored the policy's own
 * commands for the duration.
 *
 * The target is the opposite: free-form, continuous, simultaneous control of
 * every joint, limited by the physics and by the intelligence of the policy and
 * by nothing else. So the surface was widened to the body's own continuous
 * command space -- `reach` joined the two aiming axes -- and the scripting moved
 * *out* of the body and into the drivers. A mouse is now a thin producer of
 * points in that space: `src/buttons.ts` turns a held right button into a reach
 * the way a policy would, instead of the arm turning it into a pose nobody
 * asked for.
 *
 * The property that made the old rule worth keeping survives intact, and it is
 * why the surface was widened rather than bypassed. Taking over a body mid-bout
 * is still a swap of which `Mind` a fighter reads from, the physics still never
 * notices, and there is still exactly one command vocabulary -- so there is no
 * AI-only channel, no pose a policy can ask for that a person cannot, and no
 * second surface to keep in step with this one. What a body will *accept* is
 * published on its own envelope, which is frozen rule 3: the module publishes
 * what it can reach and the mind picks inside it.
 *
 * This was `type Intent = InputState` until session 15 -- an alias onto the
 * DOM-side input state, on the argument that two structurally identical
 * declarations would part company the first time only one of them was edited.
 * The argument was right and the alias was still wrong, because it pointed the
 * seam the wrong way: whatever `Controls` happened to hold became what a policy
 * was allowed to ask for. So `zoom`, a camera factor no fighter has ever read,
 * was a field on every command, a column in every scripted policy's movement
 * partial, a key in the intent-parity sweep and a number in the command's own
 * finiteness sweep. A false action dimension is worse than a
 * duplicated field: it gets measured, learned against and reported on, and each
 * of those makes it look load-bearing.
 *
 * The command is therefore declared here, in the module with no DOM in its
 * graph, and `Controls.state` is annotated **as an** `Intent` -- which is the
 * same drift protection the alias bought, pointed so that the fighter is the
 * authority on what a command is. Camera state lives on `CameraGestureState`,
 * which belongs to the host and reaches no mind at all.
 */
export interface Intent {
  /** -1 back, +1 forward. */
  forward: number;
  /** -1 left, +1 right. */
  strafe: number;
  /** -1 left, +1 right. Non-zero also means "I am steering", which breaks a lock. */
  turn: number;
  /**
   * Which hand is acting, or `null` when what is acting is not a hand.
   *
   * **It means the same thing for a person and for a policy**, which is why it
   * is one field and not two. A person's answer is "the hand the mouse is on":
   * there is one cursor and there are two hands, and the alternative -- half the
   * screen each, or a modifier key held down -- was rejected because the mouse
   * being spent *entirely* on one blade is the whole reason this reads as Die by
   * the Sword. A policy's answer is "the hand this option is executing on". Both
   * are the same sentence, and every combat reader wants that sentence: the
   * commit posture twists toward it, the tactic merge carries it, and
   * `splitMind` reads exactly this to decide which hand it takes from the person
   * and which it takes from the policy.
   *
   * Session 17's plan asked for a type split -- a host-owned `Controls.driving`
   * beside a policy-owned `Intent.actingHand` -- and the code says the two
   * meanings are already apart. `Fighter` never reads the field at all,
   * `splitMind` deliberately ignores the policy's copy, and the two surviving
   * combat readers want the acting hand. So this is the rename and not the
   * split; `Controls.state` narrows it to a real hand, because a cursor is
   * always on one.
   *
   * `null` is the natural channel below: jaws are not a hand, and using
   * `primary` as a bite placeholder is exactly what a centipede that publishes
   * no hands at all used to do.
   */
  actingHand: HandName | null;
  /**
   * What a natural striker is being asked for.
   *
   * A creature whose weapon is its head has no hand slot to write into, and for
   * three sessions it wrote into `primary` anyway: `crawlerMind` set
   * `primary.thrust` and `Centipede.update` read it, on a body whose published
   * `hands` is `Object.freeze({})`. Every reader downstream then had to know
   * that one body's `primary` meant something else -- `recordIntentAttack` still
   * carried the exception in a comment.
   *
   * The two buttons are spelled as the hands spell them rather than as `strike`
   * and `brace`, so there is one command vocabulary and not two. What differs is
   * that there is no pose: a natural striker is aimed by turning the body, which
   * is the movement head's job.
   */
  natural: NaturalIntent;
  posture: PostureIntent;
  primary: HandIntent;
  secondary: HandIntent;
}

/** The natural striker's two buttons. No pose: a body aims jaws by turning. */
export interface NaturalIntent {
  thrust: boolean;
  guard: boolean;
}

/**
 * Whole-body pose, normalized at the same boundary as the movement axes.
 *
 * Beside `Intent` rather than beside `Controls`, for the reason `Intent` gives:
 * a fighter consumes it, so the fighter's side of the tree declares it and the
 * DOM side imports it as a type.
 */
export interface PostureIntent {
  /** -1 back through +1 forward. */
  trunkLean: number;
  /** -1 left through +1 right. */
  trunkTwist: number;
  /** Reserved for session 05: 0 standing through 1 fully crouched. */
  crouch: number;
}


/**
 * What one hand is being asked for.
 *
 * These five used to sit at the top of the command itself, because there used to
 * be one arm. Splitting them out rather than adding a second set of differently
 * named fields is what keeps the two hands genuinely alike: there is no
 * `pointerX` and `offPointerX`, no hand that is the real one and a hand that is
 * the afterthought, and `Arm` takes one of these without caring which it is.
 */
export interface HandIntent {
  /** Cursor position across the window, -1 (left) to +1 (right). */
  pointerX: number;
  /** Cursor position up the window, -1 (bottom) to +1 (top). */
  pointerY: number;
  /**
   * How far out the hand is asked to sit: -1 fully drawn in, +1 fully extended,
   * as a fraction of whatever reach shell the chain publishes.
   *
   * **The channel this surface was missing, and it is here for a measurement
   * rather than for a symmetry.** A golem's arm has three positional degrees of
   * freedom -- swing, lift and reach -- and until this field existed the command
   * surface carried two of them. Reach came from `thrust` and `guard` instead,
   * which quantized it to three preset distances chosen by two booleans, so a
   * policy driving a golem could ask for 0.36 m, 0.54 m or 0.66 m and nothing in
   * between. Instrumented over eight bouts of `golem-duelist` against the
   * Warrior duelist, the policy asked for **one** distinct reach per hand and
   * 1916 distinct elevations. The arm it was driving has a reach shell 0.42 m
   * deep.
   *
   * That is the difference between a body a mind drives and a body a mind
   * triggers, and the target is the former: free-form, continuous, simultaneous
   * control of every joint, limited by the physics and by the policy's own
   * judgement and by nothing else. This field is one third of one arm's
   * position, and it was the third that had no way of being asked for.
   *
   * Normalized rather than metres, for the reason every other axis here is: the
   * surface is shared by bodies whose arms are different lengths, and a command
   * in metres would mean a different pose on each of them. The chain spans it
   * onto its own published `reachMin`..`reachMax`, which is frozen rule 3 -- the
   * module publishes what it can reach and the mind picks inside it.
   *
   * **A body with no reach axis reads nothing here**, exactly as rung 0 reads no
   * field at all and rungs 0 to 2 have no roll to read. That includes the
   * Warrior: `Arm.aim` still takes its reach from the two buttons and filters it
   * at `arm.reachResponse`, unchanged, and every Warrior number in
   * `docs/measurements.md` is a number about that arm. What a body will accept
   * is published on its envelope; this is the vocabulary, and not a promise that
   * every body speaks all of it.
   */
  reach: number;
  /**
   * Wrist roll in radians. Absolute, not a per-frame delta, because the control
   * loop runs several times per rendered frame and would otherwise apply the
   * same increment more than once.
   */
  roll: number;
  /** Anatomical wrist bend, normalized: 0 straight through 1 at ninety degrees. */
  wristBend: number;
  /**
   * The two buttons.
   *
   * **They are levels a body may read; they are no longer poses a body
   * imposes.** Session 12 took two jobs off them. `guard` used to overwrite the
   * commanded elevation on a golem's arm, so a mind that asked its shield arm
   * for 2001 distinct elevations over eight bouts had every one of them thrown
   * away and replaced by 0.80 rad -- which is what held the plate above the
   * golem's own head in the page, and is the defect the owner reported. And
   * `thrust` used to start a scripted stroke inside the chain, during which the
   * commander's own swing and lift were ignored for its duration.
   *
   * What they mean now is what `src/buttons.ts` says they mean: a press is an
   * edge and a hold is a level, and a *driver* -- the mouse adapter, or a policy
   * -- turns them into positions. The Warrior's arm still reads them directly,
   * because that arm's reach has always been a button-driven filter and moving
   * it would move every measured Warrior number for a gain nobody asked for.
   */
  thrust: boolean;
  guard: boolean;
}

/**
 * The hand names, forwarded from `hands.ts`.
 *
 * They were declared here, on the argument that a *value* import of `input.ts`
 * anywhere in a fighter's graph would take `fighter.ts` out of Node's reach and
 * the headless bench and four test files with it -- which was true and is still
 * true. What moved them on is that `policies.ts` needs them too, and this module
 * imports `policies.ts` at run time, so reaching back for them from over there
 * would have closed a real cycle. `hands.ts` imports nothing at all, which is
 * strictly the safer place, and re-exporting from here means nothing that
 * already asked this module for them had to change.
 */
export type { HandName };
export { HANDS, otherHand };

/** One pose per hand, which is what a takeover has to seed from. */
export type ArmPoses = Record<HandName, ArmPose>;

/**
 * How much of each part of a body is left, keyed by `Limb.key`: 1 whole, 0 gone.
 *
 * A fraction rather than a health value, because the numbers a mind compares are
 * only meaningful against a maximum, and a policy that had to know a torso's
 * `maxHealth` to read its torso would be reading `config.ts` through a body.
 * Severed reads as exactly 0, so "is this arm still on it" and "is this arm
 * finished" are one question with one answer.
 *
 * Written into in place by `Fighter.observe`, so a mind must read it during
 * `decide` and not keep it.
 */
export type PartHealth = Record<string, number>;

/** A named natural striker, published without exposing its body or controller. */
export interface NaturalAttackView {
  readonly reach: number;
  readonly ready: boolean;
  readonly active: boolean;
}

/**
 * One of a fighter's two hands, as a mind sees it.
 *
 * This is the record that was missing, and its absence is the whole of why a
 * shield was held wherever the cursor happened to be sitting. A policy could not
 * be told what its own off hand was holding, which side of the body that hand
 * was on, or which way the thing in it was pointing -- so it could not place a
 * shield even if it had wanted to, and no amount of work on the mount could fix
 * that from the other end.
 *
 * Facts only, and world-space ones. Nothing here is an interpretation: there is
 * no `isGuarding`, no `threat` and no `shouldBlock`, because a view that answers
 * questions starts being believed instead of read.
 *
 * **Eight fields, and every one of them has a reader.** The count in this
 * sentence has been wrong twice, which is its own small lesson: it said "five"
 * while there were seven, because `reach` came back one session after being
 * deleted and nobody re-counted. There were briefly eight of a different sort --
 * a `hand` position, a `reach` and a `face`, the world direction of the hand's
 * own +X, which for a strapped shield is the plate's normal -- carried for a
 * servo that turned the wrist toward whatever it was covering. The servo was
 * measured against a constant and lost badly (see `GUARD.roll`), and those
 * fields went out with it rather than staying as things a view offers and
 * nothing takes. `WEAPON_KINDS` sat unread for two sessions and is the reason
 * that rule is written down.
 */
export interface HandView {
  /** What this hand holds. `empty` for a bare fist, which is a kind not a null. */
  weapon: WeaponKind;
  /** Where this arm hangs from. */
  shoulder: Vector3;
  /**
   * The point of what it holds, or the fist itself when it holds nothing.
   *
   * **Only meaningful while `lost` is false.** A dropped weapon keeps being
   * tracked -- the arm still holds the reference, the body is still in the world
   * as debris -- so a severed arm's `tip` is wherever its sword happens to have
   * landed. That is the truth about where the object is and it is not a threat,
   * and `policies.ts`'s `threatHand` is where the difference is made.
   */
  tip: Vector3;
  /**
   * Speed of that point, m/s. The magnitude of `tipVelocity`, kept because every
   * scripted reader in the tree asks "how fast" and not "which way".
   *
   * **It changed meaning in session 16 and every v3-era reader is affected.**
   * Before it, a hand holding nothing published a literal `0` -- forever, however
   * hard the fist was travelling -- and only a held weapon reported a speed. It
   * is now the fist's own material-point speed, so a bare hand is a thing that
   * moves. Three consequences, none of which are bugs and all of which are
   * behaviour changes:
   *
   * - `duelistMind`'s `seen.tipSpeed > DUELIST.theirCommit` can now be true of a
   *   punch, where before only steel could commit;
   * - `swinger` reads it for the same question and gets the same new answer;
   * - the `*_tip_speed` feature columns are non-zero for an empty hand, so a v3
   *   artifact would be reading a column that has started moving. That is one
   *   of the reasons `FEATURE_VERSION` is 4.
   *
   * What that did to the hand a scripted guard covers is measured in
   * `docs/measurements.md` under "Threat selection, reconciled" rather than left
   * to be discovered.
   */
  tipSpeed: number;
  /**
   * World velocity of that same point, m/s.
   *
   * The field that makes "is this coming at me" a question a policy can ask.
   * `tipSpeed` alone cannot answer it: a blade withdrawing at 8 m/s and a blade
   * arriving at 8 m/s are the same number, and every guard in the tree was built
   * on that number. It is the material-point velocity -- `linear + w x r` at the
   * tip -- because the rotation is the arm's and is there before the contact,
   * which is the same quantity the damage model scores a blade from.
   *
   * Published through `Weapon.velocityAtToRef` for a held weapon and
   * `FistStrike.centreVelocityToRef` for a bare hand, rather than through the
   * two `velocityAt` readers beside them, and that is a requirement rather than
   * a preference. It is **not** because `ToRef` is free -- it is not; each of
   * those readers crosses into Havok, where the glue allocates whatever ref is
   * handed in. It is because the count of those crossings is the budget: a
   * weapon costs two, a fist costs one, a hand holding something never pays for
   * both, and `tests/policy-perception.test.mjs` fails if that changes.
   *
   * Zero for a lost or absent hand, which is the same rule `tipSpeed` follows:
   * `tip` goes on tracking a dropped weapon because that is where the object is,
   * and neither speed nor direction is a threat any more.
   */
  tipVelocity: Vector3;
  /**
   * How far this hand can put that point from its own shoulder, in metres.
   *
   * Not where it is -- how far out it *goes*, at the extension a policy commits
   * an attack at. A constant for a given hand and a given weapon, and the only
   * number in the view that a policy needs in order to know when it is close
   * enough to hit somebody.
   *
   * This field existed for one session and was removed for having no readers,
   * which is `AGENTS.md`'s rule and was the right call at the time. It is back
   * because there is a weapon that is not a sword's length now, and both
   * policies had the sword's reach written into them as a literal --
   * `duelist.hold = 1.40` with a comment saying "just inside the 1.45 m the
   * point of the blade reaches", and `swinger.engage = 1.30` with a measured
   * `1.45` in its own. Handed an axe, which reaches 1.13, `duelist` stood 255 mm
   * out of its own range and swung at the air for the whole bout: 31 blows in
   * twelve bouts against a sword's 398.
   *
   * `lost` does not zero it. A severed arm keeps its weapon and its geometry;
   * what it has stopped being is a threat, and that is what `lost` says.
   */
  reach: number;
  /** True once any piece of this arm has been cut off it. */
  lost: boolean;
  /**
   * Which way is away from the body for this arm: +1 on the fighter's own right,
   * -1 on its left.
   *
   * The sign that makes "a shield guard is an arm held *across*" expressible.
   * Across is a direction, and a direction needs to know which side it started
   * on; without this a policy can only swing an arm outward or inward by
   * guessing, and it will guess wrong for exactly one of the two hands.
   */
  outboard: number;
}

/**
 * One thing in the air, as a mind sees it.
 *
 * Facts only, on the same terms as `HandView`: where it is, how fast it is
 * going, whose it is and how long it has been flying. There is no `willHit`, no
 * `timeToImpact` and no `aimedAt`, because every one of those is an
 * interpretation and interpretation belongs to whoever is reading -- see
 * `selectThreat` in `action-primitives.ts`, which is where the crossing solve
 * lives and where it can be argued with.
 *
 * `owner` is a role rather than an identity: `self` is the reader's own shaft
 * and `opponent` is one coming the other way. It is deliberately not a fighter
 * handle -- a view never hands out a reference to a body -- and it is the field
 * that lets a policy decline to dodge its own arrow.
 *
 * **These records are pooled and rewritten in place**, exactly as the hand
 * records are, so a mind may read one during `decide` and must keep none of it.
 * A quiver holds `CONFIG.arrow.count` shafts and `bow` takes two hands, so one
 * fighter can have at most that many in the air and the pool settles at twelve.
 */
export interface ProjectileView {
  kind: "arrow";
  owner: "self" | "opponent";
  position: Vector3;
  velocity: Vector3;
  age: number;
}

/** A body-mounted striker, published without pretending that a module is a humanoid hand. */
export interface EffectorView {
  weapon: WeaponKind;
  anchor: Vector3;
  tip: Vector3;
  tipVelocity: Vector3;
  reach: number;
  lost: boolean;
}

/** One body as a mind sees it: where it is, where its blade is, what is left of it. */
export interface BodyView {
  /** Registry identity and unlike-body geometry used by tactics and framing. */
  unit: string;
  reach: number;
  crownHeight: number;
  vitalHeight: number;
  collisionRadius: number;
  naturalAttacks: Readonly<Record<string, NaturalAttackView>>;
  /** Optional for legacy bodies; constructs publish every installed mounted striker here. */
  effectors?: readonly EffectorView[];
  /**
   * What this body's own modules can be asked for, or absent for a body that is not assembled.
   *
   * **Present on `self` and never on an opponent**, which is the whole argument for it being here
   * rather than reachable through a handle on the body. A mind gets one thing, `FighterView`, and
   * frozen rule 3 of the golem plan says the module publishes what it can reach and the mind picks
   * inside it -- so a golem mind that could not read an envelope would have to reach past
   * `Mind.decide` for one, which is the seam this file exists to keep shut. What a mind is entitled
   * to know about the thing *in front* of it is unchanged: where it is, how fast it is going, how
   * far its arms go (`reach`) and what is on the end of them (`HandView.weapon`).
   *
   * Optional, and the type is reached through an inline `import type` -- the idiom `units.ts`
   * already uses for `ProjectileView` -- so this module gains no import, no run-time graph and no
   * opinion about what a golem is. A body that is not assembled leaves it absent, which is why the
   * two hand-written `FighterView` fixtures in `tests/` still carry every field a real view does.
   */
  capabilities?: import("./golem/module.ts").GolemCapabilities;
  /** Position on the floor. */
  ground: Vector3;
  /** Heading in radians, zero down +Z turning toward +X, as everywhere here. */
  facing: number;
  /**
   * The primary hand's shoulder, point and speed.
   *
   * Kept at the top level, and kept meaning the **primary's**, rather than being
   * folded into `hands` and read from there. Every figure in
   * `docs/measurements.md` that names a shoulder or a tip was taken through
   * these three, and a field that quietly starts meaning "whichever hand is
   * interesting" is a field that makes two readings taken a session apart
   * incomparable without either of them looking wrong.
   *
   * A policy that wants the hand that is actually a threat should read `hands`
   * and choose. `duelist` does.
   */
  shoulder: Vector3;
  /** The point of the blade, in world space. */
  tip: Vector3;
  /** Speed of that point, m/s. The damage model is built from this number. */
  tipSpeed: number;
  /** Both hands, always both, whatever either of them is holding. */
  hands: Record<HandName, HandView>;
  /** Solver-achieved squat, normalized from standing height to full depth. */
  crouch: number;
  /** Solver-achieved waist lean, normalized to the configured envelope. */
  trunkLean: number;
  /** Solver-achieved waist twist, normalized to the configured envelope. */
  trunkTwist: number;
  /** Derived whole-body survival, from 1 whole to 0 exhausted. */
  vitality: number;
  health: PartHealth;
}

/**
 * The same, and for the moment exactly the same.
 *
 * It carried one extra field: how far the primary hand was *currently* being
 * held from its shoulder. Nothing ever read it, in the three sessions it
 * existed, which is the state `AGENTS.md` has a rule about -- and by the time
 * there were two hands it was answering for one of them anyway. What a policy
 * actually wanted turned out to be the other question: not where the hand is,
 * but how far out it goes, per hand and including what the hand is holding. That
 * is `HandView.reach`, and it has a reader.
 *
 * The alias is kept rather than collapsed because the distinction is real and
 * about to be load-bearing: a fighter knows things about itself that it cannot
 * know about the thing in front of it, and session 06 gives the two sides
 * different bodies. This is where the first of those goes.
 */
export type SelfView = BodyView;

/**
 * What a fighter can see. Published from the world, never from another mind.
 *
 * Positions and speeds only. No access to the other mind, no access to the
 * solver, and no access to what the opponent is *about* to do: a policy that
 * wants to know whether it is being attacked has to read a blade, the same way a
 * person does.
 *
 * There is deliberately no `reach` on the opponent. Both fighters are the same
 * unit today, so a policy's own reach answers for both, and inventing a field
 * that is guaranteed to equal one already present is how a view starts being
 * believed instead of read. The day session 08 gives the two sides different
 * bodies, this is the field to add, and adding it is one line here and one in
 * `Fighter.observe`.
 *
 * **The whole object is republished in place on every control step**, one per
 * fighter, because `decide` runs 240 times a second per side and a freshly
 * allocated view per call would be the largest single source of garbage in the
 * prototype. A mind may read anything here during `decide` and must keep none of
 * it: the vectors it holds are the fighter's own and will have moved by the next
 * call.
 */
export interface FighterView {
  self: SelfView;
  opponent: BodyView;
  /**
   * Every shaft in the air, both sides', in publication order.
   *
   * `live && !spent`, and nothing else: a parked arrow is under the floor, a
   * planted one is scenery, and a spent one lying against a shin is neither a
   * threat nor a thing to be intercepted. The filter is the same one
   * `Quiver.flying` counts by, so a policy and a readout can never disagree
   * about how many are up.
   *
   * World space, like everything else here. Turning a position and a velocity
   * into "will it hit me, and when" is the reader's job, and doing it in the
   * view would be publishing a future collision -- which is the one thing this
   * seam has never been allowed to do.
   *
   * **The array is reused across steps and trimmed rather than replaced.** Its
   * logical length is cleared, both bodies overwrite their own pooled records
   * into it, and the length is set to what was written. The records survive the
   * trim because each body still holds its own pool, so a bout that has settled
   * at its maximum count allocates nothing at all -- which is the property
   * `projectile_publication_reuses_records_after_warmup` pins. This is the first
   * place in `src/` that idiom appears; every other `.length = 0` here is
   * teardown.
   */
  projectiles: ProjectileView[];
  /**
   * Distance from this fighter's own shoulder to the nearest part of the
   * opponent, metres.
   *
   * Measured to part *centres* rather than to capsule surfaces, because the
   * nearest point on a capsule is a solve and a centre is a subtraction. The
   * difference is one radius, and a policy that compares this against a reach
   * it also measured this way never sees it.
   */
  measure: number;
  /**
   * Simulation seconds since the bout was built.
   *
   * The same clock `HitReport.at` is stamped with, so a mind can age a blow
   * against it without having to be told how the two relate.
   */
  clock: number;
}

/**
 * Whoever is driving one fighter.
 *
 * The human is a `Mind` too -- one that hands back `controls.state` -- and that
 * is the whole design. There is no branch anywhere in `Fighter` for "is this one
 * the player", no authority to transfer and no mode to be in, because both sides
 * were always producing the same `Intent`.
 *
 * `decide` is handed the control step's `dt` rather than being expected to find
 * a clock, so a policy with a cadence integrates the same number the solver
 * does. It is called once per physics substep, which is 240 times a second, so a
 * policy that allocates per call allocates a great deal; returning a mutable
 * object the policy owns is the right shape, and `Fighter.update` reads the
 * fields immediately and keeps no reference to it.
 */
export interface Mind {
  readonly name: string;
  decide(view: FighterView, dt: number): Intent;
}

/**
 * What a fighter asks for when nobody is asking it for anything.
 *
 * Frozen, and shared by every idle mind, because it is a constant that happens
 * to be shaped like a command rather than a state anyone owns. This was a module
 * constant in `main.ts` until the seam landed, and being a constant with nothing
 * to write through it was not merely untidy: it blocked a measurement. Session
 * 04 wanted the standard cursor sweep run on the *right* fighter's arm, which
 * sits fifteen bodies further down Havok's list than the left one's, and there
 * was no way to feed it an intent -- an observer that swept it drove it a second
 * time per step and inflated its tip speed from 10.67 m/s to 13.41. Assigning
 * `__sword.right.mind` is now the whole of that measurement's setup.
 */
export const NEUTRAL: Intent = Object.freeze({
  forward: 0,
  strafe: 0,
  turn: 0,
  actingHand: "primary",
  natural: Object.freeze({ thrust: false, guard: false }),
  posture: Object.freeze({ trunkLean: 0, trunkTwist: 0, crouch: 0 }),
  // Frozen too, and separately. `Object.freeze` is shallow, so freezing only the
  // outer object would leave both hands writable through a reference anybody
  // holds -- and the whole point of freezing this is that a policy handed the
  // neutral intent cannot quietly turn it into its own.
  primary: Object.freeze({
    pointerX: 0, pointerY: 0, reach: BUTTON_REACH.neutral,
    roll: 0, wristBend: 0, thrust: false, guard: false,
  }),
  // The off hand rests rather than points. See `arm.restPointerY`.
  secondary: Object.freeze({
    pointerX: CONFIG.arm.restPointerX,
    pointerY: CONFIG.arm.restPointerY,
    // The same reach a neutral hand asks for. A resting arm is not a drawn-in
    // one, and `guard` is what used to pull a hand in: a rest intent that pulled
    // in by default would be that coupling put back through the front door.
    reach: BUTTON_REACH.neutral,
    roll: 0,
    wristBend: 0,
    thrust: false,
    guard: false,
  }),
});

/**
 * Stands there, cursor centred.
 *
 * The control condition, and the thing every claim session 06 makes is measured
 * against. It also has a job beyond measurement: it is what you pick when you
 * want to practise cutting a body that moves the way a body does, which is what
 * the training dummy used to be for and is the only thing lost when the dummy
 * became a fighter.
 *
 * **Not "arms down", which is what session 06's plan asks for and what this
 * comment used to claim.** A centred cursor is `pointerY = 0`, and `aimArm`
 * maps that to an elevation of zero -- so idle holds its blade out level and
 * pointed at whatever it is facing, not by its side. Measured over 100 bouts
 * against `swinger`, that costs nothing: idle takes 17 381 contacts and scores
 * exactly zero damage, because not one of them arrives with `combat.cutFloorJ`.
 * It is still not what somebody reading "stands there, arms down" would expect
 * to see in the page, and whether a lowered guard is what was meant is a
 * decision somebody should take at a browser rather than a line to quietly
 * change here -- moving it changes what every future policy is measured against.
 *
 * A factory rather than a singleton, because the policies session 06 adds carry
 * timer state and two fighters running one instance of one of those would share
 * a cadence. Idle has no state and would not care; being the odd one out is
 * worse than the allocation.
 */
export function idleMind(): Mind {
  const intent = blankIntent();
  return {
    name: "idle",
    decide: (view) => postureFor(view, "idle", intent),
  };
}

/**
 * A person, as a mind.
 *
 * Structurally typed on purpose -- it asks for anything carrying a live
 * `Intent`, which `Controls` is -- so that this module imports nothing from
 * `input.ts` at run time and stays loadable by Node. `Controls.state` is
 * mutated in place by the pointer and key listeners and read immediately by the
 * fighter, which is exactly the contract `Mind` already describes for a policy
 * that owns its intent.
 */
export function humanMind(source: { readonly state: Intent }, name = "you"): Mind {
  return { name, decide: () => source.state };
}

/**
 * One mouse, two hands.
 *
 * A person has one cursor and a fighter has two arms, so exactly one of them can
 * be the person's at a time and the other has to be driven by something. This is
 * that something: it runs both minds every step, takes the feet and the driven
 * hand from the person, and takes the other hand from the policy.
 *
 * Splitting the *cursor* instead -- half the screen each, or a modifier held
 * down -- was the obvious alternative and is worse. The mouse being spent
 * entirely on one blade is the whole reason this reads as Die by the Sword
 * rather than as a third-person action game, and halving it would make both
 * hands worse to control in order to avoid making a choice. `F` makes the
 * choice, and it can be made mid-swing.
 *
 * The policy is driven every step whichever hand it is on, and at its own `dt`,
 * for the same reason `handover` drives its inner mind through the rebase
 * window: a policy whose cadence stopped while somebody else was using its arm
 * would be a different policy. It writes into its own hand slot -- policies say
 * which hand they mean through `actingHand` -- and this reads that slot rather
 * than assuming a side, so a policy needs to know nothing about any of this.
 *
 * House rule 1 survives intact: what reaches the fighter is still one `Intent`,
 * still the same shape a person produces, and there is still nothing anywhere
 * that asks which of the two hands is the real one. (The count used to be quoted
 * here and kept going stale: "nine-field" was already wrong when it was written,
 * the command was eight fields until session 15 took the camera out of it, seven
 * after that, and eight again since session 17 gave a natural striker its own
 * channel. `COMBAT_FIELDS` in `tests/fixtures/intent.mjs` names the set and every
 * producer of a command is asserted against it, which is the copy that cannot
 * drift -- it lived in `tests/minds.test.mjs` and was quoted as single-sourced
 * while five test files each held their own literal.)
 */
export function splitMind(
  person: Mind,
  policy: Mind,
  ownership: HumanOwnership = { posture: false, drivenWrist: false },
): Mind {
  const blended: Intent = {
    ...NEUTRAL,
    natural: { ...NEUTRAL.natural },
    posture: { ...NEUTRAL.posture },
    primary: { ...NEUTRAL.primary },
    secondary: { ...NEUTRAL.secondary },
  };

  return {
    name: person.name,
    decide(view: FighterView, dt: number): Intent {
      const mine = person.decide(view, dt);
      const theirs = policy.decide(view, dt);
      // A cursor is always on a hand, so this cannot fire from `Controls` --
      // which narrows the field to a `HandName` in its own declaration. It is
      // refused by name rather than repaired because the alternative is to pick
      // a hand for somebody: a body whose striker is its head has nothing for
      // one mouse to divide, and answering "primary" would put the person on an
      // arm that does not exist.
      const driven = mine.actingHand;
      if (driven === null) {
        throw new Error(`splitMind cannot divide "${person.name}": a command that names no acting hand has no hand to hand over`);
      }

      blended.forward = mine.forward;
      blended.strafe = mine.strafe;
      blended.turn = mine.turn;
      blended.actingHand = driven;
      // The jaws are the person's, on the same two buttons as the hand.
      //
      // This read `theirs.natural` when the channel landed, on the argument
      // that "jaws are not on the cursor: there is no button for them and no
      // pose to place, so the natural channel stays the policy's for the same
      // reason posture does". Half of that is right and the conclusion was
      // wrong. There is no *pose* for jaws -- a natural striker is aimed by
      // turning the body -- but there is very much a button, and it is the same
      // button: `applyButtonPose` writes one press onto the acting hand and the
      // natural striker together, which is what `Intent.natural`'s own note
      // means by one command vocabulary. Leaving this on the policy meant a
      // person handed a centipede -- which the setup screen offers for either
      // side, whatever the unit -- could steer it and never bite with it.
      //
      // The buttons follow the buttons, in other words, and not `ownership`:
      // thrust and guard on the driven hand are the person's unconditionally,
      // so the jaws are too. Posture and wrist orientation are the ones that
      // change hands with `ownership`, and they still do.
      blended.natural.thrust = mine.natural.thrust;
      blended.natural.guard = mine.natural.guard;
      // Posture and wrist orientation are policy-owned during human play. The
      // body keeps moving as part of the fight while the person's mouse remains
      // entirely available to place one hand.
      const posture = ownership.posture ? mine.posture : theirs.posture;
      blended.posture.trunkLean = posture.trunkLean;
      blended.posture.trunkTwist = posture.trunkTwist;
      blended.posture.crouch = posture.crouch;

      // The person's hand is the person's, and the other one is the policy's
      // plan **for that same hand** -- not for whichever hand the policy calls
      // its own.
      //
      // It used to be `theirs[theirs.actingHand]`, and that was right for exactly
      // as long as a policy planned one hand: whatever it had, it wanted its arm
      // to do, and which arm that was did not matter. It matters now. A policy
      // plans a hand by *what is in it*, so its plan for the secondary is a plan
      // for the secondary's weapon -- and handing that plan to the other arm
      // hands a sword's cadence to a shield. That is not hypothetical: pick a
      // sword and a shield, take the sword, and the old rule ran `swinger`'s
      // commit stroke on the shield arm for the whole bout. The board was being
      // swung like a bat.
      const spare = otherHand(driven);
      composeHand(
        blended[driven],
        mine[driven],
        ownership.drivenWrist ? mine[driven] : theirs[driven],
      );
      composeHand(blended[spare], theirs[spare], theirs[spare]);
      return blended;
    },
  };
}

/**
 * Compose one whole hand without aliasing either live source.
 *
 * Position/buttons and wrist orientation have different owners during human
 * play. Keeping that split in one exhaustive copy makes a new hand field a
 * compile-time decision instead of something a spread silently assigns to the
 * wrong driver.
 */
function composeHand(into: HandIntent, position: HandIntent, orientation: HandIntent): void {
  const composed: HandIntent = {
    pointerX: position.pointerX,
    pointerY: position.pointerY,
    // Position, not orientation: reach is where the hand *is*, and the driver
    // holding the buttons is the one who decides it. Putting it on the
    // orientation side would hand one driver the aim of an arm and another its
    // extension.
    reach: position.reach,
    thrust: position.thrust,
    guard: position.guard,
    roll: orientation.roll,
    wristBend: orientation.wristBend,
  };
  Object.assign(into, composed);
}


/**
 * The pose an arm is actually in, exactly as `Fighter.armAngles()` answers it.
 *
 * Declared here rather than imported from `fighter.ts` for the reason every
 * other shape in this file is: `fighter.ts` imports Babylon, and the whole value
 * of this module is that it does not. `Fighter.armAngles()`'s return type
 * satisfies this structurally, so what is handed in is the arm's own reading and
 * not a translation of it.
 */
export interface ArmPose {
  /** Torso-space bearing of the hand from the shoulder, radians. */
  azimuth: number;
  /** Torso-space elevation of the same, radians. */
  elevation: number;
  /** Wrist roll, radians, already inside `arm.rollMin`/`rollMax`. */
  roll: number;
  /** Wrist bend intent, normalized 0..1. */
  wristBend: number;
  /** Shoulder to hand centre, metres. */
  reach: number;
}

/**
 * Where the cursor has to sit for the arm to be commanded into the pose it is
 * already in.
 *
 * This is the whole of what stops a blade teleporting when a body changes hands.
 * `Fighter.aimArm` maps the *absolute* cursor position onto an azimuth and an
 * elevation -- which is the property that gives the arm a home you can find
 * again, and is therefore not negotiable -- so the instant a new driver takes a
 * body, the arm is commanded to wherever that driver's cursor happens to be
 * sitting, at the measured 850 N linear ceiling, with a sword on the end. At a
 * full-envelope jump that is roughly 0.7 m of hand travel asked for in one
 * substep.
 *
 * The fix is continuity rather than a clamp. Invert the mapping, and the cursor
 * does not move at all: what moves is its meaning, so that where it sits now is
 * where the arm already is, and the first command after a handover is exactly
 * the command the previous driver had left standing.
 *
 * **`reach` was deliberately not inverted here, and Session 12 changed half of
 * that.** The old argument was sound for the body it was about and is still
 * sound for it: `aimArm` takes a Warrior's reach from the thrust and guard
 * buttons and filters it toward the wanted value at `arm.reachResponse`, which
 * is 9 per second, so it is continuous across a handover by construction and
 * carries whatever the arm had rather than snapping. A driver taking a Warrior
 * with the guard button held simply starts pulling the hand in from where it
 * was. That has not changed, and this function still describes a Warrior.
 *
 * What the argument also said was that there is no cursor position that could
 * express a reach, because the controller has two aiming axes and reach is not
 * one of them. That was a claim about the *command surface*, and the surface was
 * the thing that turned out to be wrong: `HandIntent.reach` exists now, a golem
 * chain reads it as its third positional degree of freedom, and a golem
 * effector's own `cursor()` inverts it. So the field is on `HandCursor` and this
 * function fills it honestly, from the pose it was handed, against the Warrior's
 * own reach span -- unread by `Arm`, which still uses its buttons, and correct
 * for the one thing a `HandCursor` is for, which is being interpolated away from
 * during a rebase.
 */
export function cursorForPose(pose: ArmPose, hand: HandName = "primary"): HandCursor {
  const A = CONFIG.arm;
  return {
    pointerX: cursorForAzimuth(pose.azimuth, hand),
    pointerY: cursorForElevation(pose.elevation),
    // `reachGuard` to `reachMax` is the span the two buttons already move this
    // arm through, so this is that arm's own shell and not an invented one.
    reach: A.reachMax === A.reachGuard
      ? 0
      : Math.max(-1, Math.min(1,
        ((pose.reach - A.reachGuard) / (A.reachMax - A.reachGuard)) * 2 - 1)),
    roll: pose.roll,
    wristBend: pose.wristBend,
  };
}

/**
 * Where a cursor has to sit for one effector to be commanded into the pose it is in.
 *
 * The five *placing* fields of a `HandIntent` and nothing else: `thrust` and `guard` are buttons
 * rather than places, and a button needs no inverse because a press is an edge that has already
 * been paid out by the time a handover happens.
 *
 * `reach` joined this list in Session 12 and had to. It became a commandable axis of the arm, so
 * a handover that did not carry it would hand the incoming driver a hand at 0.66 m and a command
 * of 0.54 m -- a 120 mm step, at the anchor's own ceiling, with a blade on the end, which is
 * precisely the teleport this whole mechanism exists to prevent. The note above `cursorForPose`
 * records the argument for the opposite decision, and what changed under it.
 *
 * Declared as its own type because a golem answers it from somewhere else entirely. A Warrior's
 * arm is a seven-axis chain whose cursor mapping lives in `policies.ts`, and a golem effector is a
 * one-, three- or five-axis chain that owns its own mapping and publishes its own inverse. Both
 * produce this, which is what lets one handover serve both bodies.
 */
export interface HandCursor {
  pointerX: number;
  pointerY: number;
  /** Normalized into the chain's own reach shell. Zero on a chain with no reach axis. */
  reach: number;
  roll: number;
  wristBend: number;
}

/** Both hands' seeds. Always both: the cursor is absolute, so the hand it is *not* on matters. */
export type HandCursors = Record<HandName, HandCursor>;

/** The Warrior's own answer: one inverse per hand, mirrored by `cursorForAzimuth`. */
export const cursorsForPoses = (poses: ArmPoses): HandCursors => ({
  primary: cursorForPose(poses.primary, "primary"),
  secondary: cursorForPose(poses.secondary, "secondary"),
});

/** Convert normalized bend to a mirrored anatomical angle. */
export function mirroredWristBend(wristBend: number, outboard: number): number {
  const bend = Math.max(0, Math.min(1, wristBend));
  return bend * CONFIG.arm.wristBendMax * (outboard < 0 ? -1 : 1);
}

/**
 * Where a pose puts the hand, relative to the shoulder, in the torso's own frame.
 *
 * The same three lines `Fighter.aimArm` builds its `dirLocal` from, scaled by the
 * reach -- which makes this the *commanded* hand position and not a reading of
 * where the hand got to. That distinction is the whole reason the takeover
 * measurement is taken from here rather than from the blade: a blade mid-swing
 * moves 42 mm in a single 240 Hz substep entirely legitimately, so a tip
 * displacement measured across a handover cannot tell a teleport from a swing.
 * The commanded point can: it moves at most a couple of millimetres a substep
 * even during the fastest stroke either policy has, so anything above that is
 * the handover and nothing else.
 *
 * Torso-local on purpose. A fighter that is walking is being translated and
 * turned by its own locomotion during the same step, and a world-space
 * difference would fold that in.
 */
export function handOffset(pose: ArmPose): { x: number; y: number; z: number } {
  const cosEl = Math.cos(pose.elevation);
  return {
    x: Math.sin(pose.azimuth) * cosEl * pose.reach,
    y: Math.sin(pose.elevation) * pose.reach,
    z: Math.cos(pose.azimuth) * cosEl * pose.reach,
  };
}

/**
 * How far the hand is being asked to jump between two poses, in millimetres.
 *
 * Millimetres because that is the unit every acceptance and every rig readout in
 * this directory is already written in, and because a handover worth
 * complaining about is hundreds of them while a good one is single figures.
 */
export function poseShiftMm(before: ArmPose, after: ArmPose): number {
  const a = handOffset(before);
  const b = handOffset(after);
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) * 1000;
}

/**
 * A mind that has just been handed a body, and knows what pose it found it in.
 *
 * `settled` is false for as long as the rebase window is open, and true once
 * this is passing the inner mind's intent through untouched.
 */
export interface Handover extends Mind {
  readonly settled: boolean;
}

/**
 * Hand a body to a new mind without the blade noticing.
 *
 * Two things are going on and it is worth separating them, because the plan for
 * this session asks for one of them and one alone is not enough.
 *
 * The first is the seed: `cursorForPose` says where the cursor would have to be
 * for the arm to be commanded into the pose it is already in, and writing that
 * into whoever is taking over makes the very first command after a handover
 * identical to the last command before it. That is exact, it needs no
 * interpolation, and it is what the takeover-frame acceptance measures.
 *
 * The second is that the seed does not survive contact with either kind of
 * driver, which is the correction this session owes the plan. For a person,
 * `Controls.onPointerMove` writes the *absolute* cursor position back into the
 * intent on the very next mouse event -- so seeding the state alone moves the
 * teleport twenty milliseconds later, to a moment nobody is measuring, and the
 * blade still jumps. For a policy it is worse: a freshly built `swinger` parks
 * its cursor at centre guard on its first `decide` and a `duelist` puts it on
 * the covering line, neither of which has any relation to the pose it is being
 * handed, so a body released mid-swing snaps as hard as one taken mid-swing.
 *
 * So the seed is where this *starts* and the rebase is how it *ends*: for
 * `seconds` the commanded cursor walks linearly from the found pose to whatever
 * the new mind is asking for, and after that this object is transparent. The
 * blend is on the two aiming axes and the wrist roll only; the feet and the
 * buttons are the new driver's from the first step, because neither can teleport
 * anything -- reach is filtered at `arm.reachResponse` and the locomotion at
 * `fighter.accelResponse`. (The camera zoom used to be in that list of things
 * passed through, which was true and is now vacuous: a command carries no camera
 * state, and the framing a takeover inherits is the host's throughout.)
 *
 * Linear rather than exponential, and that is deliberate: an exponential
 * approach never actually arrives, so the wrapper would never become
 * transparent and every fighter in a long bout would end up reading the world
 * through however many handovers it had lived through. This one has an end.
 *
 * The inner mind is driven every step from the first, at its own `dt`, so a
 * policy's cadence runs normally through the window and what is blended is only
 * what it asks the hand for. A policy that was told the fight had paused for a
 * quarter of a second would be a different policy.
 */
export function handover(
  inner: Mind,
  poses: ArmPoses,
  seconds = CONFIG.takeover.rebaseSeconds,
): Handover {
  return handoverFromCursors(inner, cursorsForPoses(poses), seconds);
}

/**
 * The same, seeded from a cursor rather than from a Warrior arm's pose.
 *
 * `handover` above is this with `cursorsForPoses` in front of it, and the split is what lets a
 * golem be taken over by the same rule rather than by a second one. A golem effector is not a
 * seven-axis humanoid arm: its chain owns its own cursor mapping, its `swing` is outboard-signed
 * against its own socket, and rungs 0 to 2 have no roll to invert -- so pushing a golem's pose
 * through `ArmPose` and `cursorForAzimuth` would be asking the Warrior's inverse a question about
 * a body it knows nothing about. What both bodies *can* answer is the seed itself, which is the
 * thing this actually needs.
 *
 * Everything below is unchanged and the Warrior's behaviour with it: `handover` produces exactly
 * the seed it always did, `tests/handover.test.mjs` still pins the jump against its unseeded
 * control, and no number in `docs/measurements.md` moves.
 */
export function handoverFromCursors(
  inner: Mind,
  seed: HandCursors,
  seconds = CONFIG.takeover.rebaseSeconds,
): Handover {
  // Mutable, allocated once, and never handed out except during the window --
  // the same contract `NEUTRAL` documents and every policy already keeps.
  //
  // The two hands are rebuilt rather than spread: `{ ...NEUTRAL }` copies the
  // *references* to NEUTRAL's two frozen hand objects, so the first write to
  // `blended.primary.pointerX` would throw in a module (which is strict) or, far
  // worse, silently do nothing if this ever ran unstrict.
  const blended: Intent = {
    ...NEUTRAL,
    natural: { ...NEUTRAL.natural },
    posture: { ...NEUTRAL.posture },
    primary: { ...NEUTRAL.primary },
    secondary: { ...NEUTRAL.secondary },
  };
  let elapsed = 0;
  let done = seconds <= 0;

  return {
    // The inner mind's own name, so a readout says `swinger` rather than naming
    // a wrapper nobody chose. What a handover is doing is visible through
    // `settled` and through `__sword.takeover`, which is where somebody looking
    // for it would look.
    name: inner.name,
    get settled(): boolean {
      return done;
    },
    decide(view: FighterView, dt: number): Intent {
      const asked = inner.decide(view, dt);
      if (done) return asked;

      // The fraction is taken *before* the step is counted, so the first call
      // after a handover blends at exactly zero and commands exactly the pose
      // that was found. Counting first would put the first command 1/60th of the
      // way across the envelope -- about 12 mm of hand at a full-width rebase,
      // which is most of the 20 mm the acceptance allows, spent on nothing.
      const t = elapsed / seconds;
      elapsed += dt;
      if (elapsed >= seconds) done = true;

      blended.forward = asked.forward;
      blended.strafe = asked.strafe;
      blended.turn = asked.turn;
      blended.actingHand = asked.actingHand;
      // A rebase has nothing to interpolate here: jaws have no pose, so the
      // button passes through from the first step exactly as `thrust` does on a
      // hand. Leaving it out would have made a taken-over centipede stop biting
      // for the whole rebase window.
      blended.natural.thrust = asked.natural.thrust;
      blended.natural.guard = asked.natural.guard;
      blended.posture.trunkLean = asked.posture.trunkLean;
      blended.posture.trunkTwist = asked.posture.trunkTwist;
      blended.posture.crouch = asked.posture.crouch;
      // Both hands, and by the same clock. A takeover that rebased one hand and
      // snapped the other would be exactly half a fix: the cursor is absolute,
      // so whichever hand it is not currently driving is still being commanded
      // from a pose the incoming mind knows nothing about.
      for (const name of HANDS) {
        const to = blended[name];
        const from = seed[name];
        const want = asked[name];
        to.thrust = want.thrust;
        to.guard = want.guard;
        to.pointerX = from.pointerX + (want.pointerX - from.pointerX) * t;
        to.pointerY = from.pointerY + (want.pointerY - from.pointerY) * t;
        // Interpolated with the other two placing axes, not passed through with
        // the buttons. On a golem this is the difference between an arm that
        // slides out over the rebase window and one that is told to cross
        // 120 mm on the first step after a takeover.
        to.reach = from.reach + (want.reach - from.reach) * t;
        to.roll = from.roll + (want.roll - from.roll) * t;
        to.wristBend = from.wristBend + (want.wristBend - from.wristBend) * t;
      }
      return blended;
    },
  };
}

/**
 * One entry in the policy picker.
 *
 * The list is the registry the setup screen builds its `select` from, so a
 * policy that exists is selectable and a policy that is selectable exists. That
 * is the only defence against the failure this sort of picker always has, which
 * is an option that names something the code no longer has.
 */
export interface Policy {
  /** What a `Matchup` stores, and what appears in a URL or a console command. */
  readonly name: string;
  /** What the picker shows. */
  readonly label: string;
  /**
   * Which control surface this policy's commands are shaped for, or null for any body.
   *
   * **The field that stops a golem's mind being offered for a Warrior.** `UnitDefinition`'s
   * `compatiblePolicies` says "null means every policy", and it meant that safely for exactly as
   * long as every policy in this list drove one kind of body. Session 09 adds one that does not:
   * `golem-duelist` reads `BodyView.capabilities`, aims in an effector socket's own frame and
   * commits a stroke the golem's chains own, and a Warrior handed it would be a body driven by a
   * mind that has never seen it -- which is the same sentence the golem's own registry row already
   * writes the other way round about `duelist`.
   *
   * Null rather than a wildcard string, and `idle` is the only one that takes it: standing still
   * with the cursor centred is a command any body can execute, it is the control condition every
   * measurement in `docs/measurements.md` is taken against, and Session 08's whole golem baseline
   * was recorded on it. A second idle under a golem name would be two names for one behaviour and
   * would split that baseline in half.
   *
   * Read by `drivers` in `src/units.ts` and nowhere else, so a unit's picker is the intersection of
   * this and its own `compatiblePolicies` rather than a hand-kept third list.
   */
  readonly surface: string | null;
  /**
   * Build one.
   *
   * The seed is optional and the picker never passes one, so a policy chosen
   * from the screen draws its own and two fighters on the same policy do not
   * fight in lockstep. What passes one is `scripts/measure.mjs`, because "a
   * hundred bouts" has to mean a hundred *different* bouts and the only honest
   * place for that variety is the policies' own cadence -- nudging the physics
   * to make a distribution measures a slightly different simulator every time,
   * and then the distribution is of the harness rather than of the policy.
   * `idle` ignores it, having nothing to vary.
   */
  create(seed?: number): Mind;
}

export const POLICIES: readonly Policy[] = [
  { name: "idle", label: "Idle", surface: null, create: idleMind },
  { name: "swinger", label: "Swinger", surface: HUMANOID_SURFACE, create: swingerMind },
  { name: "duelist", label: "Duelist", surface: HUMANOID_SURFACE, create: duelistMind },
  { name: "archer", label: "Archer", surface: HUMANOID_SURFACE, create: archerMind },
  { name: "crawler", label: "Crawler", surface: HUMANOID_SURFACE, create: crawlerMind },
  { name: "golem-duelist", label: "Golem duelist", surface: GOLEM_SURFACE, create: golemDuelistMind },
  { name: "golem-fencer", label: "Golem fencer", surface: GOLEM_SURFACE, create: golemFencerMind },
  { name: "golem-planner", label: "Golem planner", surface: GOLEM_SURFACE, create: golemPlannerMind },
  { name: "golem-champion", label: "Golem champion", surface: GOLEM_SURFACE, create: golemChampionMind },
  { name: "golem-neural", label: "Golem neural", surface: GOLEM_SURFACE, create: golemNeuralMind },
  { name: "golem-form", label: "Golem form", surface: GOLEM_SURFACE, create: golemFormMind },
  { name: "golem-skirmisher", label: "Golem skirmisher", surface: GOLEM_SURFACE, create: golemSkirmisherMind },
  { name: "golem-guardian", label: "Golem guardian", surface: GOLEM_SURFACE, create: golemGuardianMind },
  { name: "golem-brawler", label: "Golem brawler", surface: GOLEM_SURFACE, create: golemBrawlerMind },
  { name: "golem-tactician", label: "Golem tactician", surface: GOLEM_SURFACE, create: golemTacticianMind },
  { name: "golem-learner", label: "Golem learner", surface: GOLEM_SURFACE, create: golemLearnerMind },
  { name: "golem-selector", label: "Golem selector", surface: GOLEM_SURFACE, create: golemSelectorMind },
];

/**
 * The mind a policy name asks for.
 *
 * Refuses by name rather than falling back to idle. A picker that quietly
 * substitutes something else for an option it does not recognise is how a
 * measurement of `duelist` ends up being a measurement of `idle`, and the
 * distribution it produces looks perfectly reasonable.
 */
export function policyMind(name: string, seed?: number): Mind {
  const found = POLICIES.find((policy) => policy.name === name);
  if (!found) {
    const known = POLICIES.map((policy) => policy.name).join(", ");
    throw new Error(`unknown policy "${name}" -- the picker offers ${known}`);
  }
  return found.create(seed);
}
