# Documents: clean, minimal and current

## Why

The documents and code comments have grown into about 21,000 lines over 122 Markdown files,
much of it history, dated notes, owner quotes, measurements read at old commits, and claims the
code no longer makes. The project has consolidated on the Options design; the documents should
describe that, and nothing else.

AGENTS.md already forbids most of this in comments, and it grew anyway: other rules demand
records (a `decision` source names its record, a muscle change carries a before/after table, a
reference record keeps what was tried). So the plan removes the rules that demand notes, and the
gate refuses the marks a test can see.

Every sentence left must be true of the code now, something a reader acts on, and said once.

Decided with the owner: a number cites a document only when it comes from a paper or an asset. A
value tuned for a result gets a one-line comment saying what it does, and its reference record
goes. A deleted record is not cited at all, `path@commit` included.

## The target

| Document | Holds | Budget |
| --- | --- | --- |
| `README.md` | what the game is, how to run it, the screens, the controls | 60 lines |
| `AGENTS.md` | commands, rules no test enforces, the engine and browser traps that have bitten | 120 lines |
| `docs/architecture.md` | the layers, their contracts, where each lives | 400 lines |
| `docs/roadmap.md` | current goals and open items, one line each | 100 lines |
| `docs/plans/` | plans in flight | as needed |
| `docs/analysis/` | the study behind a decision still open | as needed |
| `docs/diagrams/` | pages showing the current design, or a target a plan in flight names | as needed |
| `docs/reference/` | only what code needs and a comment cannot hold | as few as possible |
| `docs/art/` | how to rebuild each asset | as needed |
| `assets/`, `public/assets/`, `vendor/` READMEs | where each asset or package comes from and how to rebuild it | as needed |
| `research/` README and reports | what each study is for and the answer it gave | as needed |

A budget is a target, not a test.

Writing rules, for documents and comments alike: plain technical English; the present tense; no
dates, session or step numbers, commit hashes, owner quotes, comparisons to other games, asset
trivia, "there is no X", or what used to be. Provenance a reader needs (a paper, an asset path)
stays.

**Plans in flight.** The Options-training, Commander and rat plans keep running beside this one,
in the same working copy. From step 1 they write by the new rules. A record a plan in flight
reads is trimmed, never deleted, until that plan lands; the link check (step 2) catches a miss.

## Steps

1. **AGENTS.md rewritten.** The rules first, so every later step follows them. Keep the commands,
   the rules a test does not enforce, and the Babylon, Rapier and browser traps. A rule a test
   enforces becomes one line naming the test. Replace the rules that make agents write notes: a
   tuned number needs no record; a deleted record is not cited; a before/after table goes in the
   commit message, not a document; a reference record has no "tried and not kept". The Documents
   table and the writing rules above go in. The owner reads it before it lands.
   Check: the files and anchors it cites exist, `git diff --check`, the line-ending gate.

2. **A documents check in the gate.** `tests/documents.test.mjs`, in two parts.
   - Links: every `docs/…md` path and `#anchor` cited in `src/`, `scripts/`, `tests/` and
     `research/*.mjs`, and every relative link in a tracked Markdown file, resolves. No exemption:
     a `path@commit` citation fails like any other missing file.
   - Comment marks: no comment in `src/` holds a date, a commit hash or a citation of
     `docs/plans/` or `docs/analysis/`.

   Fix what it finds now (the seven missing targets, among them `docs/reference/vanguard.md`; the
   `path@commit` citations; the commit hashes, dates and plan citations in comments). AGENTS.md's
   Tests section names the new contract. Every later deletion leans on it.
   Check: the gate; the test under a second.

3. **README.md rewritten** to the target: one line on what the game is ("A browser game of
   physically simulated, AI-driven combat."), running it, the screens, the controls. The owner
   reads it before it lands.
   Check: as step 1.

4. **The records triaged, nothing edited.** One table at the end of this plan: every file of
   `docs/reference/`, `docs/art/`, the asset, vendor and research READMEs and reports, each marked
   deleted (the default), folded into a named comment or architecture section, or trimmed, and
   the plan in flight that reads it, if any. `rising.md` and `look.md` (about half of all code
   citations) are a batch of their own; `rising.md#the-owners-target` stays, the stand-up bar of
   the Options-training plan.
   Check: every file listed once; every file a plan in flight reads marked trimmed or kept.

5. **architecture.md rewritten** around the Options design: each layer's job, contract and
   files, in a section a layer. Built from the code as it is, not edited down from the current
   text, and taking in what the triage folds into it, said once.
   Check: as step 1; a second agent reads it against the code to refute each claim.

6. **The roadmap, plans, analysis and diagrams.** The roadmap down to current goals and open
   items, one line each, with no history in the items' text. Delete every plan whose work has
   landed, and the creature-art analysis if decided; fold what is left of a plan's open items into
   the roadmap. `docs/diagrams/` pages that show a superseded design are deleted.
   Check: as step 1.

7. **Sources hold papers and assets.** `Source` (`src/core/sources.ts`) keeps `literature` and
   `asset`; `decision` and `measurement` become `tuned`, one line saying what the value is set
   for, with no date or record. `src/core/spec/quantity.ts` and its readers follow; AGENTS.md's
   rule on tuned constants says the same.
   Check: the gate; the fingerprint, no case moved.

8. **The records sorted** as the triage says, in batches by sub-agents, each record's survivors
   read against the current code by a second agent framed to refute them. Code citations of a
   deleted record are rewritten or removed. A record a plan in flight reads is trimmed only.
   Check: the gate (the link check); as step 1 for the documents.

9. **Code comments cleaned**, one folder at a time: owner quotes, plan and session references,
   "replaced", "the old", "used to", figures read at past commits, and narrative that restates
   the code. A comment keeps what the code is and, where not obvious, why. When the last folder
   is clean, the documents check also refuses "the owner" in a `src/` comment.
   Check: `npm run check` and the gate; a diff that touches a line of code gets the fingerprint.

The owner reads steps 1 and 3 before they land; the rest lands without check-ins, a commit a step
or a batch.

## Done when

- The tracked Markdown is the target set, each document near its budget.
- The documents check is in the gate and green: links, dates, commit hashes, plan and analysis
  citations, and "the owner" in `src/` comments.
- A search of the documents for dates, commit hashes, owner quotes and plan or step references
  finds only literature citations and the dated names of files in `docs/plans/` and
  `docs/analysis/`.
- `docs/reference/` holds only records code cites for something a comment cannot say, and the
  records a plan in flight reads.

## The triage

Every record, its verdict and where what survives goes. The detail of each fold (the gist of each
comment) is in the step-4 notes under `.tmp/documents/`; a record a plan in flight reads is
trimmed, never deleted. A deleted record's `.json` and `.json.gz` companions go with it.

**Kept or trimmed** (what stays):

| Record | Stays |
| --- | --- |
| `reference/rising.md` | `#the-owners-target` only, about 15 lines: the falls, the conditions, the timing and the bar as `risingReport`'s gates |
| `reference/the-table.md` | the command and `#each-cell` with its bodies (the Options-training plan's starting record) |
| `reference/front-kicks.md` | `#execution-settings` and `#stomp-settings`, one line a setting |
| `reference/human-strike-reference.md` | §1, 2, 3, 3a, 3b, 5, 6, 8, 9: the literature of the bars, torques, de Leva, stature |
| `reference/reptile.md` | each body and setting the rat plan and code read, cut to what it is and what it is for |
| `reference/wounds.md` | `#stiffness`, `#gaps`, `#shares`, `#the-fist`, `#mechanisms` (literature derivations) |
| `reference/step-cost.md` | the harness, the scripts that exist, `#allocation-ceilings` |
| `art/assets.md`, `characters.md`, `crypt.md`, `menu.md`, `rat.md`, `reptile.md`, `skeleton.md` | source and licence, rebuild steps, what the file holds |
| `vendor/rapier/README.md`, `vendor/quadprog/README.md`, `assets/forge/README.md` | provenance and rebuild; Rapier's takes the archive hash and toolchain from `rapier-vendor.md` |
| `research/README.md`, `research/physics-bakeoff/REPORT.md` | what each study is for and its answer |

**Folded into the architecture**: `command-delay` (One world step); `assist`, `striking-effectors`
(Motor control); `contact-friction`, `equipment-grips`, `solver-contract`, `toes`,
`body-and-engine` (Build and engine); `competencies` (Spec and provenance: physiques);
`real-functions` (Arithmetic); `down-timing`, `reptile-bites` (Rules and wounds); `held-blows`,
`learned-punch`, `locomotion` (Skills); `play` (The screens, and its constants' comments); and
from `rising.md`, the staged riser, Stand up's edges and routes, and the Rise drill; from
`look.md`, the sound rules and the arena's colliders.

**Folded into comments** (the code the record explains): `active-quadratic`, `arena-items`,
`blows`, `collision-ccd`, `combat-defense`, `combat-locomotion`, `combat-strikes`,
`combat-turn-startup`, `combat-uppercut`, `constraint-mass`, `contact-motion`,
`contact-projection`, `contact-step`, `coupled-dynamics`, `hand-poses`, `man-anatomy` (into
`scripts/core/hand-envelope.mjs`), `punch-body`, `punch-mass-audit`, `punch-stability`,
`recovery-transfer`, `run-body`, `servo-and-muscle`, `stance-tuning`, `supported-root-pose`;
`effort-precision`, `grip-clearance`, `joint-limits`, `rapier-vendor` (into
`vendor/rapier/README.md`); `art/robots` (into `src/render/robot-skin.ts`); and the rest of
`rising.md`, section by section, into `src/core/recovery/rise/`.

**Deleted**: `look.md` and, in `reference/`, `arena-combat-evaluation`, `art-delivery`,
`bar-posture`, `baseline`, `bouts`, `centre-control`, `combat-arm-style`, `combat-overlap`,
`combat-range-learning`, `contact-curvature`, `contact-liftoff`, `control-foundation`,
`crypt-foe`, `ground-combat`, `human-and-strikes`, `joint-acceleration`, `joint-stop-tracking`,
`lab`, `man-passive-toes`, `man-postures`, `man-punch`, `motion-tracking`, `moving-strike`,
`native-posture-control`, `option-skeleton-combat`, `oracle`, `planar-support`, `point-defense`,
`point-strike`, `posture-hold`, `posture-limit-models`, `postures`, `punch-calibration`,
`punch-foundation`, `recovery-cycle`, `shared-strike`, `shared-withdrawal`, `skill-records`,
`standing-bar`, `support-entry`, `support-transition`, `sword-and-buckler`,
`trained-attack-force`, `whole-body-spike`; `art/arena.md`; the READMEs of
`public/assets/character-lab/`, `humanoid/` and `skeleton/`; the creature-art analysis
(decided: the rat is built); both `docs/diagrams/` pages (they show the skill-deck design the
Options replaced). A study's one-line answer goes to `research/README.md` where a script remains.
