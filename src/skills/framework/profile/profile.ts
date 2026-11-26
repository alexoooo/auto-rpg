/**
 * **A skill's profile**: what the skill was measured to bring from where it began, so that a
 * chooser prices it on measured numbers rather than a hand-built model: a strike's against a foe
 * fighting back, from starts drawn at random (the Strike drill's `sparring` and `sparring-laid`),
 * never at a drill's still target, which reads how well the body throws it and nothing of what it brings; a ground edge's,
 * which has no foe, in its own tries; a step's out of a blow's way (the back step's), where a mind
 * fighting with it took it, against a foe fighting (the back step's evaluation's `spar-chosen`), what
 * it lost while it stepped. A profile is a sample of
 * trials (`Trial`), each keeping what it brought and where it began (`Start`): the range to the
 * foe, centre to centre across the ground, m; the foe's phase as the striker sensed it (the `phase`
 * percept, `sensedPhase`); how the two bodies stood; and the velocity at the start, in the frame of
 * the skill's target (`startVelocity`), or, for a skill with no target, the body's own (forward and
 * to its right of its facing); and for a skill begun from a window, where in it the body stood. A
 * reading takes the trials nearest the start asked at (`NEAREST`), its velocity and its place in
 * its window within the spans its trials began at (`readWithin`). A
 * skill with no foe, a ground edge, begins at no range, clear. A profile is found by the question
 * it answers (`Measured`): its skill and variation, the limb that throws it, its body's model, the
 * world's rates and the senses' reaction time. Neither the body struck nor what either body held is
 * part of it: each trial records them as numbers (`Start.struck`, none for a skill with no foe;
 * `Start.held`), and a reading takes the
 * trials struck at the numbers nearest the struck body's (`profileAgainst`) and begun holding
 * nearest what each body holds (`bodyNumbers`), within what they held (`heldPast`). The code it
 * was measured on is no part of what finds it: a retrained network or a tuned setting leaves it
 * read until its own tool measures it again, and where it came from is kept on it (`Origin`), which labels it and finds nothing. One of another
 * skill or limb answers another question and is never read for it. One of another body is read
 * only where the body has none of its own, the nearest in stature (`profilesFor`), and its
 * reading says whose rows it reads (`ProfileReading.source`). One measured at another rate, delay
 * or reaction time is stale (`changes`) and still read, so a chooser prices a skill by hand only
 * where nothing measured it.
 *
 * Each dataset owner declares and loads its profiles. Readers use `readProfile`; identity
 * selects the loaded data each provider declares relevant to a subject (`dataIdentity`).
 *
 * This file holds a profile's shape and its validation; beside it, what a trial records of its
 * bodies (`numbers.ts`), how alike two starts are and the trials nearest one (`nearest.ts`), the
 * reading (`reading.ts`), a profile read for other bodies (`across.ts`) and the lookup by the
 * question asked (`lookup.ts`).
 */

/**
 * **The question a profile answers**, which it is found by: its body's model, its skill as its character holds it (`skill/variation`,
 * `strikeSkill`, `techniqueSkill`), the limb a strike was thrown with (absent for a skill thrown
 * with none), the world's rate, Hz, how late its senses showed the other body, s (null for a skill
 * that reads none), the rate its mind's driver ran at, Hz, where that is not the world's (`rateOf`,
 * `LayerOptions.every`), and the steps its body's command waited (`World.delay`), where there were
 * any (`delayOf`).
 */
export interface Measured {
  readonly body: string;
  /** The body's stature, m (`BodySpec.stature`): what another body reads its trials by (`acrossBodies`). */
  readonly stature: number;
  readonly skill: string;
  readonly limb?: string;
  readonly hz: number;
  readonly reaction: number | null;
  readonly rate?: number;
  readonly delay?: number;
}

/**
 * **One Mind that played a measurement's trials**: the body it drove (its model's name and its
 * spec's digest), its config's digest, and the digest of each record it read, by the record's
 * key, as that body reads it (`playedBy`, `research/skills/profile-origin.mjs`). The digests are
 * taken when the measuring tool makes the asset, which is before it writes it.
 */
export interface Played {
  readonly body: string;
  readonly spec: string;
  readonly mind: string;
  readonly read: Readonly<Record<string, string>>;
}

/**
 * **Where a measurement came from**, which finds and refuses none: the digests of its body's spec
 * and of its skill, as its trials were played (`research/skills/profile-origin.mjs`); the Minds
 * that played them (`Played`), both sides'; and the commit its trials were played on, whether a
 * build input differed from it, and the day, where its tool knew them. The inventory
 * (`scripts/inventory.mjs`) sets each beside the same today, so what has changed since is read
 * without playing anything. A field is absent where the tool that made the asset did not write it.
 */
export interface Origin {
  readonly spec?: string;
  readonly skill?: string;
  readonly minds?: readonly Played[];
  readonly commit?: string;
  readonly changed?: boolean;
  readonly date?: string;
}

/**
 * **How the bodies stood as a trial began**, each a posture's name (`Position`'s): the body whose
 * skill it is, `own`, and the body it struck, `target`. A profile is read at a pair of them
 * (`readProfile`), so a skill measured standing says nothing of a striker lying or a target down.
 */
export interface Postures {
  readonly own: string;
  readonly target: string;
}

/** Both bodies standing: what a trial that names no postures began at, and what a profile is read at unless asked otherwise. */
export const STANDING: Postures = Object.freeze({ own: "standing", target: "standing" });

/**
 * **Where a trial began**, or a reading is asked at: the range, m, and the foe's phase; how the
 * bodies stood (`Postures`; absent, both standing); the velocity at the start, m/s, in the
 * target's frame (`startVelocity`: closing on it and across the line to it) or, with no target,
 * the body's own (forward and to its right), absent where its drill did not record it, read as
 * still; and, for a skill begun from a window (`Window`), where in it the body stood
 * (`placeInWindow`: the target's offset from the window's middle, ahead and to the right, m),
 * absent where it begins from none or its drill did not record it, read as at the middle; how each
 * body stood (`Stances`), absent where its drill did not record it, read as alike any. A trial
 * records as well what its bodies held (`Held`) and the body it struck (`StruckNumbers`, absent
 * for a skill with no foe); a reading is asked at neither, its bodies' being their specs' (`Asked`).
 */
export interface Start {
  readonly range: number;
  readonly phase: string;
  readonly postures?: Postures;
  readonly velocity?: readonly [number, number];
  readonly window?: readonly [number, number];
  readonly stance?: Stances;
  readonly held?: Held;
  readonly struck?: StruckNumbers;
}

/**
 * **The body a trial struck, as numbers** (`struckNumbers`): its stature, m (`BodySpec.stature`),
 * its mass, kg, and its Steadiness and haste, per cent, as its spec had them.
 */
export interface StruckNumbers {
  readonly stature: number;
  readonly mass: number;
  readonly steadiness: number;
  readonly haste: number;
}

/**
 * **How a body stands**, m (`stanceNumbers`, `src/skills/perception/stance-numbers.ts`): its feet's stagger along the line to the other
 * body, positive with its left foot nearer it; their width across that line; and its centre's
 * height over them. Numbers, not a named stance, so a reading takes the trials begun nearest how
 * the bodies stand whatever gait stood them so.
 */
export type StanceNumbers = {
  readonly stagger: number;
  readonly width: number;
  readonly height: number;
};

/** **How the two bodies of a start stood** (`StanceNumbers`): the body whose skill it is, `own`, and the body it struck, `target`; each absent where it was not read. */
export type Stances = {
  readonly own?: StanceNumbers;
  readonly target?: StanceNumbers;
};

/** Where a reading is asked at: a start less what its bodies hold, which the reading takes from their specs. */
export type Asked = Omit<Start, "held">;

/**
 * **What a body holds in one segment, as numbers** (`heldNumbers`): the item's mass, kg, and how far
 * it reaches from where it is held, m: the farthest point of what it collides as, its shapes and
 * its contacts' (a sword's blade is its contacts), from its frame's origin, which for an item a
 * hand closes on is the grip's end (`ItemSpec.grip`).
 */
export interface ItemNumbers {
  readonly mass: number;
  readonly reach: number;
}

/** **What a body holds, as numbers** (`ItemNumbers`), by the segment that holds each item (`HeldSpec.segment`); a segment holding nothing is absent. */
export type BodyHeld = Readonly<Record<string, ItemNumbers>>;

/** **What a trial's bodies held as it began** (`BodyHeld`): the body whose skill it is, `own`, and the body it struck, `target`; each absent where it held nothing. */
export interface Held {
  readonly own?: BodyHeld;
  readonly target?: BodyHeld;
}

/**
 * **One trial of a skill**: where it began (`Start`) and what it brought: whether it was done (a
 * strike landed, an edge reached its posture); the life its blows took from the body struck, in
 * hit points (each contact's damage at the struck segment's cost in life, `lifeFactor`), and the hit
 * points its own body lost over the whole trial (the drill foe's replies and its own blows'
 * impacts, which a reading leaves out: the foe's pressure prices what the body takes); the seconds
 * its skill ran (a strike's action from its start to its end, when its limb is free to begin
 * another; an edge's run); the seconds from its end until its limb was back at its guard and still
 * (`recovers`: null where its drill did not see it so, or measures none); whether it ended with the
 * body down; where it came to rest where not done (`end`, an edge's position); where it left the
 * two (`Exit`); and, where its drill
 * let it go before its point of no return (`letGo`), at what progress of its motion (s from its
 * start), the seconds until the hand was back at its guard, and the hit points its body lost
 * meanwhile: such a trial prices letting go alone.
 */
export interface Trial {
  readonly start: Start;
  readonly done: boolean;
  readonly dealt: number;
  readonly taken: number;
  readonly seconds: number;
  readonly recovers: number | null;
  readonly down: boolean;
  readonly end?: string;
  readonly exit?: Exit;
  readonly letGo?: { readonly progress: number; readonly seconds: number; readonly taken: number };
}

/** What a trial's exit names (`Exit`), in the order a trial records them. */
export const EXIT_KEYS = Object.freeze(["range", "stays", "moved", "own", "striking"] as const);

/**
 * **Where a trial left the two** (`Trial.exit`, `trialExit`), each absent where its trial did not
 * record it: their range head to head as it ended, m (`range`); whether they stood within
 * `ARRIVED` of where they began centre to centre (`stays`, 1 or 0), else by how much further
 * apart (`moved`, m); of a sway, its own steps' share of that (`own`, m), and whether the foe was
 * striking as it ended (`striking`, 1 or 0). A reading's (`Expected.exit`) is each one's mean
 * over the trials that record it.
 */
export type Exit = { readonly [K in typeof EXIT_KEYS[number]]?: number };

/** Whether `start` began with the bodies standing as `postures` say (both standing where it names none). */
export const startedAt = (start: Pick<Start, "postures">, postures: Postures): boolean =>
  (start.postures ?? STANDING).own === postures.own && (start.postures ?? STANDING).target === postures.target;

/** **Whether `profile` measured its skill with the bodies standing as `postures` say**: a trial of it began so; one that did not says nothing of them. */
export const measuredAt = (profile: Profile, postures: Postures): boolean => profile.trials.some((trial) => startedAt(trial.start, postures));

export interface Profile {
  readonly measured: Measured;
  readonly trials: readonly Trial[];
  /** Where it came from (`Origin`); absent where its tool kept none. */
  readonly from?: Origin;
}

const profileObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const profileNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const profileNonnegative = (value: unknown): boolean => profileNumber(value) && value >= 0;
const profileText = (value: unknown): boolean => typeof value === "string" && value.length > 0;
const profilePair = (value: unknown): boolean => Array.isArray(value) && value.length === 2 && value.every(profileNumber);
const profilePostures = (value: unknown): boolean => profileObject(value) && profileText(value.own) && profileText(value.target);
const profileStanceNumbers = (value: unknown): boolean => profileObject(value) && [value.stagger, value.width, value.height].every(profileNumber);
const profileStances = (value: unknown): boolean => profileObject(value) && [value.own, value.target].every((body) => body === undefined || profileStanceNumbers(body));
const profileHeld = (value: unknown): boolean => profileObject(value) && [value.own, value.target].every((body) => body === undefined
  || profileObject(body) && Object.values(body).every((item) => profileObject(item) && profileNonnegative(item.mass) && profileNonnegative(item.reach)));
const profileStruck = (value: unknown): boolean => profileObject(value) && [value.stature, value.mass].every((one) => profileNumber(one) && one > 0)
  && [value.steadiness, value.haste].every(profileNumber);
const profilePlayed = (value: unknown): boolean => profileObject(value) && [value.body, value.spec, value.mind].every(profileText)
  && profileObject(value.read) && Object.values(value.read).every(profileText);
const profileOrigin = (value: unknown): boolean => profileObject(value)
  && [value.spec, value.skill, value.commit, value.date].every((one) => one === undefined || profileText(one))
  && (value.minds === undefined || Array.isArray(value.minds) && value.minds.every(profilePlayed))
  && (value.changed === undefined || typeof value.changed === "boolean");
const profileMeasured = (value: unknown): boolean => profileObject(value) && profileText(value.body)
  && profileNumber(value.stature) && value.stature > 0
  && profileText(value.skill) && (value.limb === undefined || profileText(value.limb)) && profileNumber(value.hz) && value.hz > 0
  && (value.reaction === null || profileNonnegative(value.reaction))
  && (value.rate === undefined || profileNumber(value.rate) && value.rate > 0)
  && (value.delay === undefined || profileNonnegative(value.delay) && Number.isSafeInteger(value.delay));
const profileTrial = (value: unknown): boolean => profileObject(value) && profileObject(value.start)
  && profileNumber(value.start.range) && profileText(value.start.phase)
  && (value.start.postures === undefined || profilePostures(value.start.postures))
  && (value.start.velocity === undefined || profilePair(value.start.velocity))
  && (value.start.window === undefined || profilePair(value.start.window))
  && (value.start.stance === undefined || profileStances(value.start.stance))
  && (value.start.held === undefined || profileHeld(value.start.held))
  && (value.start.struck === undefined || profileStruck(value.start.struck))
  && typeof value.done === "boolean" && typeof value.down === "boolean"
  && profileNonnegative(value.dealt) && profileNonnegative(value.taken) && profileNonnegative(value.seconds)
  && (value.recovers === null || profileNonnegative(value.recovers))
  && (value.end === undefined || profileText(value.end))
  && (value.exit === undefined || profileObject(value.exit) && Object.entries(value.exit).every(([name, number]) => EXIT_KEYS.some((key) => key === name) && profileNumber(number)))
  && (value.letGo === undefined || profileObject(value.letGo) && [value.letGo.progress, value.letGo.seconds, value.letGo.taken].every(profileNonnegative));

/** Whether supplied profiles have finite measurements and the trial fields their readers use. */
export const validProfiles = (value: unknown): value is readonly Profile[] => Array.isArray(value) && value.every(profile => profileObject(profile)
  && profileMeasured(profile.measured)
  && Array.isArray(profile.trials) && profile.trials.every(profileTrial)
  && (profile.from === undefined || profileOrigin(profile.from)));
