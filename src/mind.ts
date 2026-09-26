import type { Vector3 } from "@babylonjs/core/Maths/math.vector.js";

// Explicit `.ts` extensions, for the reason `fighter.ts` gives at length: Node
// runs a TypeScript file by stripping its types, and Node's ESM resolver insists
// on the extension where Vite does not care. The two `import type` lines erase
// to nothing, which is what keeps `input.ts` -- and through it the DOM -- out of
// the graph a headless harness loads; the two below them are real, and
// everything they reach is `config.ts`, which reaches nothing.
// `hands.ts` imports nothing, which is the property that let the kinds move
// there in the first place. It is also why this one can be a real import rather
// than a type-only one and still cost a headless harness nothing: there is no
// graph behind it to pull in.
import { HANDS, otherHand, type HandName, type WeaponKind } from "./hands.ts";
// The resting reach every command carries, from the same leaf. The rest intents below need the
// neutral every other command starts from, and stating it twice is how two of them would part
// company.
import { HAND_REACH } from "./hands.ts";
// The dependency on `policies.ts` runs one way only: `policies.ts` takes
// `Intent`, `Mind` and `FighterView` from here and all three of them are types,
// so they erase and there is no module cycle at run time. That is worth the
// small cost it imposes over there -- `policies.ts` writes its own blank intent
// rather than spreading `NEUTRAL` -- because a cycle that happens to work
// because nobody reads the constant during evaluation is a thing that stops
// working when somebody moves a line, and it stops working in the browser rather
// than in a test.
import { blankIntent, postureFor } from "./policies.ts";
import { CONFIG } from "./config.ts";
import type { Orders } from "./orders.ts";
import { humanoidDuelist } from "./golem/humanoid/policy.ts";
import { skeletonDuelist } from "./golem/skeleton/policy.ts";
import type { BodyFamily } from "./golem/family.ts";
// The two surface tags, from the leaf that owns them. Taking either from its own endpoint would
// close a run-time cycle -- both endpoints import this file for values, and `POLICIES` below reads
// the tag while this module is still evaluating. `control-surfaces.ts` imports nothing at all.
import {
  GOLEM_CONTROL_SURFACE as GOLEM_SURFACE,
} from "./control-surfaces.ts";
// The golem's own mind, registered here for the reason every other policy is: the list *is* the
// registry the setup screen builds its picker from, so a policy that exists is selectable and a
// policy that is selectable exists. It reaches this file for types only, so the edge runs one way
// at run time and there is no cycle to be careful about.
import {
  golemBrawlerMind, golemChampionMind, golemDriverMind, golemDuelistMind, golemFencerMind,
  golemFormMind, golemGuardianMind, golemMiserMind, golemPlannerMind, golemReaperMind,
  golemSkirmisherMind, golemTacticianMind, golemWalkerMind,
} from "./golem/golem-policies.ts";
import { RESEARCHED_POLICIES } from "./golem/researched-policies.ts";

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
 * *out* of the body and into the drivers.
 *
 * **A person no longer writes this at all** (skill ceiling session 06). In the arena and the
 * dungeon a person hands a body orders -- whom to fight and where to be (`src/orders.ts`) -- and
 * the body's own mind turns them into an `Intent`. What survives of the old rule is the authority
 * half: this is the one command a body takes, nothing reaches past it to set a joint or place a
 * blade, and what a body will *accept* is published on its own envelope, which is frozen rule 3:
 * the module publishes what it can reach and the mind picks inside it. The module bench is the one
 * place a mouse still writes it, through `src/bench/buttons.ts`.
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
 * graph, so that the fighter is the authority on what a command is. Camera
 * state lives on `CameraGestureState`, which belongs to the host and reaches no
 * mind at all.
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
   * A policy's answer is "the hand this stroke is executing on", and every
   * combat reader wants that sentence: the commit posture twists toward it and
   * the tactic merge carries it. (It was also "the hand the mouse is on" while a
   * person could puppet a body, which ended in skill ceiling session 06.)
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
  /** Optional hand orientation in the socket frame, for pose-capable chains. */
  orientation?: { x: number; y: number; z: number; w: number };
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
   * What they mean now is what `src/bench/buttons.ts` says they mean: a press is
   * an edge and a hold is a level, and a *driver* -- a policy, or the bench's
   * mouse puppet -- turns them into positions. The Warrior's arm still reads them directly,
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
  /**
   * What the body's stats do, as the physical quantities they produce (physical contact session 09),
   * read off the built body and never off its attribute record -- so an armour or an arm speed that
   * one day comes from an item reaches a mind with no change here. Published on both bodies.
   *
   * `massKg` is the whole body's mass, the one a shove is divided by (`supportedMassKg` on the
   * locomotion port). Read by `presses` in `src/downed.ts`: a body that heavily outweighs the one
   * in front closes on it, because nothing that body can push it with will move it.
   */
  massKg: number;
  /**
   * The horizontal impulse that would put the body down along its weakest direction now, N.s: the
   * fall line of its own geometry (physical contact session 08) times `massKg`. Live, because a
   * stance moves it, and read by the lab observation. Zero before the body's first control step,
   * when its base has not yet been read.
   */
  stabilityImpulseNs: number;
  /**
   * How fast the primary arm can carry its tip, m/s: the command rate of its first angular axis,
   * which on every chain is the socket's own turn, times its reach. The socket's own turn and nothing else, so it is a floor under a real stroke's
   * speed, which the elbow and the wrist add to. It moves with the arm speed stat and the root of
   * size. Read by the lab observation.
   */
  armRate: number;
  /**
   * What one joule of a cut takes from the body's core, as a fraction of the core's full health:
   * the core's own armour against a cut, at the armour stat, over the edge's price in joules and the
   * core's full health at the toughness stat. Zero for a body that has lost its core. Read by the
   * lab observation.
   */
  soak: number;
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
  /**
   * Whether this body is on its feet: the locomotion port's own support state, published as it is.
   *
   * Physical contact session 03. Before it the only trace of a body on the floor was `crouch` pinned
   * at 1, which is also what a deliberate full crouch reads, so no mind could tell a downed body
   * from a low one and every aim went on reading standing heights. `fallen` and `rising` are the
   * two a mind finishes; `staggered` is still on its feet.
   */
  support: "supported" | "staggered" | "fallen" | "rising";
  /**
   * Where the body's core is now, in world space: live, where `vitalHeight` is its standing height
   * above the ground. The point a stroke at a downed body goes to (`downedMark` in
   * `src/action-primitives.ts`).
   */
  vitalPoint: Vector3;
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
 * A person is not one. A person commands -- hands a body orders, through `decide`'s third
 * argument -- and the mind drives. There is no branch anywhere in a body for "is this one the
 * player", no authority to transfer and no mode to be in.
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
  /**
   * `orders` is what the body's commander handed over for this decision (`src/orders.ts`): absent
   * or null when there are none, which is every call a bout made before orders existed and still
   * every call on a side nobody commands. A mind may read it; whether or not it does, the driver
   * carries a destination out on top of its command unless it declares `obeysOrders`.
   */
  decide(view: FighterView, dt: number, orders?: Orders | null): Intent;
  /**
   * True for a mind that carries its own orders out, so the driver applies its command as it is
   * rather than through `OrderFollower`. No shipped mind sets it; the reader coming is session 04's
   * expert, which plans footwork and so has its own answer to where a destination is.
   */
  readonly obeysOrders?: boolean;
  /**
   * A fork of the world (`src/forkable.ts`, skill ceiling session 02). A mind whose state all hangs
   * on its fields needs neither -- the fork walks fields -- and a mind that keeps state in a closure
   * hands it over here, which `src/fork/mind.ts` snapshots and restores.
   */
  captureState?(): Record<string, unknown>;
  restoreState?(state: Record<string, unknown>): void;
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
    pointerX: 0, pointerY: 0, reach: HAND_REACH.neutral,
    roll: 0, wristBend: 0, thrust: false, guard: false,
  }),
  // The off hand rests rather than points. See `arm.restPointerY`.
  secondary: Object.freeze({
    pointerX: CONFIG.arm.restPointerX,
    pointerY: CONFIG.arm.restPointerY,
    // The same reach a neutral hand asks for. A resting arm is not a drawn-in
    // one, and `guard` is what used to pull a hand in: a rest intent that pulled
    // in by default would be that coupling put back through the front door.
    reach: HAND_REACH.neutral,
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
    // A fork of the world (`src/forkable.ts`): the command it writes.
    captureState: () => ({ intent }),
    restoreState: () => { /* the command is restored in place */ },
  };
}

/** Convert normalized bend to a mirrored anatomical angle. */
export function mirroredWristBend(wristBend: number, outboard: number): number {
  const bend = Math.max(0, Math.min(1, wristBend));
  return bend * CONFIG.arm.wristBendMax * (outboard < 0 ? -1 : 1);
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
  readonly requirement?: import("./policy-applicability.ts").PolicyRequirement;
  readonly evidenceScope?: string;
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
   * The body family this policy was written, trained and rated on. Absent means golem: every
   * policy that predates the human family was built and measured on golem bodies only. The picker
   * refuses a policy on another family (`assessPolicy`); a bout does not, so a measurement can
   * still put one there on purpose.
   */
  readonly bodyFamily?: BodyFamily;
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
  ...RESEARCHED_POLICIES,
  { name: "idle", label: "Idle", surface: null, create: idleMind },
  { name: "golem-duelist", label: "Golem duelist", surface: GOLEM_SURFACE, create: golemDuelistMind },
  { name: "humanoid-duelist", label: "Human duelist", surface: GOLEM_SURFACE, bodyFamily: "human", create: humanoidDuelist },
  { name: "skeleton-duelist", label: "Skeleton duelist", surface: GOLEM_SURFACE, bodyFamily: "skeleton", create: skeletonDuelist },
  { name: "golem-fencer", label: "Golem fencer", surface: GOLEM_SURFACE, create: golemFencerMind },
  { name: "golem-planner", label: "Golem planner", surface: GOLEM_SURFACE, create: golemPlannerMind },
  { name: "golem-champion", label: "Golem champion", surface: GOLEM_SURFACE, create: golemChampionMind },
  { name: "golem-form", label: "Golem form", surface: GOLEM_SURFACE, create: golemFormMind },
  { name: "golem-skirmisher", label: "Golem skirmisher", surface: GOLEM_SURFACE, create: golemSkirmisherMind },
  { name: "golem-guardian", label: "Golem guardian", surface: GOLEM_SURFACE, create: golemGuardianMind },
  { name: "golem-brawler", label: "Golem brawler", surface: GOLEM_SURFACE, create: golemBrawlerMind },
  { name: "golem-tactician", label: "Golem tactician", surface: GOLEM_SURFACE, create: golemTacticianMind },
  { name: "golem-driver", label: "Golem driver", surface: GOLEM_SURFACE, create: golemDriverMind },
  { name: "golem-reaper", label: "Golem reaper", surface: GOLEM_SURFACE, create: golemReaperMind },
  { name: "golem-miser", label: "Golem miser", surface: GOLEM_SURFACE, create: golemMiserMind },
  // The naive ladder's middle rung (skill ceiling session 03): idle, this, then the duelist.
  { name: "golem-walker", label: "Golem walker", surface: GOLEM_SURFACE, create: golemWalkerMind },
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
