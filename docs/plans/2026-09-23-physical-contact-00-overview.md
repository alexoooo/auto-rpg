# Physical contact: overview

Eleven sessions, 00 to 10. They make blows, knockback, lifting and pushing come from effective mass
and contact force. They also stop bodies from staying down for ever, let minds finish a downed body,
and let minds read what a body's attributes do. Planned on 2026-09-23.

## Why

The owner watched an all-max giant fight a x1 golem, and it moved "like a gentle giant". Measured on
the Node harness with `.review/giant-sweep.mjs`, 384 bouts a row, stone default against an
unmodified default and the four probe minds:

| Giant's stats | Wins | Deals / takes a bout | Down / downs the other, a bout |
|---|---|---|---|
| all x1 (control) | 48.8 % | 7.60 / 7.68 | 4.89 / 4.96 |
| all at max | 48.6 % | 7.80 / 16.53 | 0.10 / 3.74 |
| all at max, size and weight x1 | 94.7 % | 10.15 / 6.52 | 1.77 / 5.77 |
| size and weight at max only | 12.4 % | 3.99 / 9.85 | 0.05 / 1.59 |

In 16 duelist bouts (`.review/giant-blows.mjs`), the giant's wounding blows carried 14.0 J at the
median against the default's 16.6. Its speed at contact was 2.54 m/s against 2.51.

None of the reasons is physics:

- A blow is priced from the weapon's declared `impactMassKg` alone (`resolve` in `src/combat.ts`,
  `impactEnergyJ` in `src/scoring.ts`), so the body behind it counts for nothing.
- The knockback is `speed * 0.11 * (1.35 - 0.7 * quality)` N.s. Neither mass appears in it, and the
  stability model then divides it by the victim's mass.
- A standing carrier is `ANIMATED` and follows a virtual carrier, so the other body's contact force
  never reaches it. Nothing can lift, push or topple a standing body except a scored blow.
- The minds stretch the giant's strokes by 68 % and 73 % (`strokeInertiaScale`, 2.8 times the
  default's swing inertia), which cancels its x1.5 arm speed.

## The owner's decisions, 2026-09-23

- **Effective mass and contact force** decide blows, knockback, lifting and pushing.
- **Two equal x1 bodies must not be able to lift each other.** Masses are physically based per
  family:
  - a stone golem is heavy (today it is at `SHIPPED_MASS_SCALE` 0.162 of stone);
  - the human stays at human scale;
  - the skeleton is lighter than the human.
- **Remove the rule that a rising body cannot be hit back down.** That is the skeleton's
  `riseHoldsThroughHits`.
- **As much general unit physics as possible.** Fold per-weapon and per-body exceptions into general
  rules wherever that can be done.
- **Fix bodies that go down and never get up, and standing minds that cannot hurt a downed body.**
- **A body on the ground or getting up fights worse, but not limply.** One rule covers every body. It
  replaces stone fighting at full strength and the skeleton at 8 %.
- **Minds know the attributes.** They read the physical quantities the attributes produce: mass,
  stability capacity, arm speed and soak. They do not read the raw multipliers.
- **Weapons stay items.** They keep their own mass and size, and take no damage. Both are earlier
  decisions and they stand.

## How the set runs

**It runs overnight without the owner.** Nobody can look at a screen until the end, so:

- **Keep going to the end.** Each session commits when its gates pass, and the next starts
  immediately.
- **Stop only when blocked.** That means a gate red with no root-cause fix in reach, or a finding
  that makes a later session's premise false. In that case write the finding into the session file
  and the measurements doc, commit what is landable, and stop.
- **No eye gates mid-set.** Every visual check is listed in session 10 and done by the owner at the
  end. Anything a session would have asked the owner to look at goes on that list, with the build,
  the seed and what to look for.
- **Owner-level choices get the recommended default.** Where a session meets such a choice it takes
  the recommended option, records it under "Chosen on the owner's behalf" in session 10, and keeps
  it reversible.
- **Do not drive the browser.** The owner denied that.

**Every session:**

- `npm test`, `npm run check` and `npm run build`, and the line-ending check
  (`git diff --cached --numstat` equals the same with `--ignore-cr-at-eol`).
- New tests are mutation-checked. Show each one going red on a deliberate break.
- Every figure names its harness.
- One commit per landable change.

**x1 fights change on purpose from session 02 on.** Each session that changes behaviour records the
body-fingerprint diff (`tests/harness/body-fingerprint.mjs --against`) and plays x1 against x1
either side of the change. That is the `research/stat-sweep.mjs` control row, 384 bouts, and the
house rule on shared execution code. Its targets:

- about 50 % with d about 0;
- knockdowns and damage a bout within the band session 01 records, unless the session exists to move
  them.

**The attribute tables become void as this lands.** Every table in
`docs/analysis/2026-09-23-attribute-measurements.md` was measured against the old contact model.
Session 10 reruns them; nothing in between cites them as current.

## Sessions

| File | What |
|---|---|
| `-01-measure.md` | Baselines: stuck-down and downed-target censuses, effective-mass ground truth, lift and push bench, mass census, giant preset. No behaviour change. |
| `-02-getting-up.md` | Nobody stays down: automatic rise, a rise that relocates, a rise that retries, no rise immunity, one grounded tone. |
| `-03-finishing.md` | Support state and a live vital point in the view; minds close on and strike a downed body. |
| `-04-family-masses.md` | Stone at stone density, the human at human scale, the skeleton lighter; forces and thresholds re-derived. |
| `-05-effective-mass.md` | m_eff at the contact point, computed from the chain, replaces every declared `impactMassKg`. |
| `-06-knockback.md` | Momentum transfer replaces the authored shove, in 3D, parries included. |
| `-07-lift-and-push.md` | Contact force on a standing body: lifted and launched past its weight, pushed past its grip. |
| `-08-general-stability.md` | Tipping capacity from footprint and centre of mass replaces the per-family brace and knockdown tables. |
| `-09-minds-read-bodies.md` | Mass, capacity, arm speed and soak in the view; stroke timing and stand-off read them. |
| `-10-remeasure.md` | Every stat sweep and the giant again, x1 balance against 01, the write-up, and the owner's eye list. |
