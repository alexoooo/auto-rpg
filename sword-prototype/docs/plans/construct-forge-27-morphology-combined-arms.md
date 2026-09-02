# Session 27 — morphology-specific combined-arms Minds

**Status (2026-09-02): public Actions, Minds and evidence machinery are implemented and recorded
durably. The former Swordbearer one-sweep focused failure is repaired by an executable bilateral
30-second reference bout: both sides complete repeated sweeps, hold the physical left-arm guard,
dodge, recover, deal multi-region upright sword damage, and retain positive action-scoped
sword/core clearance. The repair deliberately narrows same-owner collision to the Swordbearer's
blade/torso pair; it does not create general self-collision or a transform-writing escape hatch.
It is not physical acceptance for Session 30: the left reference still records a -0.0824 m
all-time post-fall blade/core diagnostic, and the fresh authored Warden entry plus five-morphology
durability matrix remain rejected/stale at historical source `f82bc3d3`. The sibling-foot
correction previously moved current source to `420906e8`, and sustained-action work plus its
locomotion-fallback correction move it again to `aa47975e`. Whole-bout
recovery clearance, a fresh multi-seed/multi-rung matrix and person-visible review remain owed;
no learned artifact or durability multiplier is promoted.**

## Outcome

Make every selectable authored Construct Mind visibly pursue, orient and attack with the hardware it
actually owns. This session uses the supported locomotion already proved in Sessions 20–24; it does
not add another carrier or transform-writing path.

The Arbalest's sword is a concurrent left-hand weapon, not an ammunition fallback. The crossbow
Warden's shield is a declared close-range shove/stagger weapon while its dorsal launcher remains
independent. Twinblade attacks opponents with or without a described blocker.

`construct-hold` remains the explicit inert negative control. Built-in Setup rows continue to
default to their authored Minds.

## Public Actions and tactical bands

Add these registered controller and Action IDs:

```ts
// Arbalest left arm; disjoint from group "arbalest-arm".
{ id: "cut-left", controller: "humanoid-left-sword-sweep", group: "left-sword-guard",
  claims: ["module:effigy-left-sword", "resource:power-left-guard"],
  parameters: {} }

// Warden shield; disjoint from group "dorsal-mount".
{ id: "bash", controller: "warden-shield-bash", group: "shield",
  claims: ["module:warden-shield", "resource:power-shield"],
  parameters: {} }
```

The timings are controller constants, not caller inputs: left cut chamber/commit/recover is
`0.18 / 0.14 / 0.24` seconds; bash chamber/drive/hold/recover is
`0.16 / 0.12 / 0.10 / 0.22` seconds. Keeping `parameters: {}` preserves the real `ActionSpec`
grammar; any future public timing input must instead provide a bounded `ParameterSpec` schema.

The existing group IDs stay stable. `cut-left` claims the left sword module and its four left-arm
joints. `bash` claims the shield module and shield bearing. Neither claims `resource:balance`, so it
may accompany admitted locomotion; neither may bypass scheduler refusal or a destroyed module.

Frozen engagement bands:

| morphology | close / attack band | retreat or spacing band |
| --- | --- | --- |
| Swordbearer | sweep from 1.25–2.60 m; close above 1.35 m | retreat below 1.25 m |
| Twinblade | dual cut from 1.20–1.70 m | close above 1.70 m; retreat below 1.20 m |
| Arbalest | left cut below 2.60 m; fire below 8 m | preserve existing 2.40–6.00 m ranged band |
| Warden crossbow | shield bash below 2.00 m; fire below 8 m | retreat below 2.40 m; close above 6 m |
| Warden sword | cut below 2.20 m | retreat below 1.25 m; close above 2.20 m |

All biped turn deadbands remain the measured 0.16 m from
`src/construct/humanoid-locomotion-program.ts#L11`. Warden uses the same local-X deadband rather
than inventing a second meaning of aligned.

## Implement

1. Advance Blueprint, SavedConstruct and the library envelope from v3 to v4 at
   `src/construct/blueprint.ts#L1`, `src/construct/codec.ts#L9` and `src/forge/library.ts#L7` for an
   optional mounted-contact striker:

   ```ts
   interface MountedContactStrikerSpec {
     readonly kind: "authored-shove";
     readonly localContactPoint: Triple;
     readonly shoveSpecificImpulseMps: number;
   }
   ```

   The verified v3 -> v4 migration adds no field to old modules. Add this spec only to
   `warden-shield` at `src/construct/warden.ts#L132`, with a frozen `0.008` m/s authored shove and
   zero wound damage. Validate it in `(0, 0.014]` and require `localContactPoint` to lie on the
   declared module primitive. Canonicalization, validation and digest ownership live beside the
   other module hardware; this is not inferred from a module or controller name.

2. Extend `Striking` at `src/combat.ts#L54` with an optional typed specific-impulse transfer. In
   `Combat.resolve` at `src/combat.ts#L461`, an armed mounted-contact hit queues that transfer on the
   target and explicitly skips the generic speed-derived shove; it never applies both. Extend the
   body-neutral stability target with a named `queueSpecificImpulseMps` operation, and extend
   `StabilityEvent` in `src/supported-locomotion-state.ts#L71` with a distinct specific-impulse
   variant consumed directly in m/s. Do not disguise m/s as N*s or fetch target mass in a
   controller. Tests bracket equal specific-impulse behavior on two target masses and prove the
   generic shove was not also queued.

3. In `src/construct/construct.ts#L447` and `src/construct/striker.ts#L1`, construct a mounted-contact
   watcher from the exact shield primitive/body registered for that module and include it in the
   same lifecycle/disposal owner as `strikers`. Only a contact whose source collider maps to the
   `warden-shield` module may enqueue the authored shove. The scheduler arms it only for the active
   bash action instance's drive/hold phases, and it may score once per target per action instance.
   Passive shield contact, contacts from the shield bearing/core, or another primitive on the
   compound owner are refused and cannot impersonate a bash.

4. Add `humanoid-left-sword-sweep` to the controller registry near the existing mount controllers
   in `src/construct/controllers.ts#L228`. Its entry snapshots a target from opponent-local facts,
   solves all four declared left-arm joints inside their authored limits, chambers away from the
   torso, commits the blade through the target lane, and recovers to the existing guard pose.
   Self-clearance is checked at chamber and commit; failure is named `self-blocked`, never solved by
   disabling owner collision.

5. Extend `arbalestControl` at `src/construct/arbalest.ts#L155` with `cut-left` on the existing
   left-arm group. Tracking/fire and left cut have disjoint groups and claims. The Mind may request
   both on the same boundary. Launcher loss, magazine loss or zero ammunition removes only fire;
   the left cut continues whenever its chain and sword remain live.

6. Add `warden-shield-bash` beside the Warden mount controls at
   `src/construct/warden.ts#L177`. The controller has chamber, drive, hold and recover phases and
   writes only `bearing-shield`. The explicit mounted-contact striker earns physical
   shove/stability evidence through shield contact and does not acquire a hidden blade score.

7. Replace Warden's forward-only rule set at `src/construct/warden.ts#L288` with variant-specific
   local-X turn, close, retreat, brace/recover and attack rules. Crossbow fire and shield bash may
   coexist. Sword sweep and locomotion may coexist only where their declared groups permit it.
   Forge-saved custom programs remain exact saved programs; body shape never substitutes a built-in
   Mind.

8. Make `TwinbladeScissorCutController` at `src/construct/twinblade-combat.ts#L140` accept two
   explicit path modes:

   ```ts
   type TwinbladeLane =
     | Readonly<{ kind: "blocker-relative"; blocker: LocalTarget }>
     | Readonly<{ kind: "open-torso" }>;
   ```

   Preserve the current blocker-relative lane. For `open-torso`, chamber symmetrically outside the
   torso and commit the two effectors through distinct left/right torso lanes. Do not manufacture a
   blocker sensor. Once admitted, the combined Action still survives one-frame perception flicker.

9. Update `twinbladeDuelistProgram` at `src/construct/twinblade-duelist.ts#L44` so both blocker
   states admit `dual-cut`. Neutral mount is for out-of-range or unavailable hardware, not the
   permanent unshielded-target behavior.

10. Improve `swordbearerDuelistProgram` at `src/construct/swordbearer-duelist.ts#L43` without adding
   new hardware. Select sweep direction from the opponent's local lane, retain close/retreat, and
   reacquire after every completed sweep. A visible upright target inside the reachable band may
   not leave the body in guard/brace-only activity for longer than the controller's declared
   chamber + commit + recover ceiling.

11. Update `arbalestProgram` at `src/construct/arbalest.ts#L194` to request left cut whenever the
   target is inside 2.60 m while independently applying its existing track/fire and spacing rules.
   Standing in a firing band remains valid ranged behavior; standing with neither track, fire,
   sword attack nor locomotion is not.

12. Extend `scripts/construct-warrior-locomotion.mjs` rather than replacing its attack-free cells.
   Add morphology-specific combat cells beside them. Evidence records requested movement, signed
   turn, active controller phases, completed attacks, contact effector, pre-/post-armour damage,
   support state and longest passive interval.

13. Add the five-morphology, both-mirror, all-rungs runner to
    `scripts/construct-warrior-curriculum.mjs`. The originally planned
    `--combined-arms-provisional` spelling was superseded before landing by Session 30's final
    `--combined-arms --out <directory>` runner, which owns canonical publication/validator identity,
    bounded checkpoint storage and the same raw rows rather than maintaining two divergent matrix
    implementations. It returns nonzero unless every morphology has a passing rung.

14. Show the exact selected policy and saved program ID in Arena diagnostics. Selecting `Hold`
    must visibly say `Hold / <program-id>`; a saved passive program must not be labelled as the
    built-in authored Mind.

## Tests watched failing

- `the_Arbalest_left_sword_can_cut_while_the_right_launcher_tracks`
- `the_Arbalest_left_sword_remains_offensive_before_and_after_ammunition_loss`
- `the_crossbow_Warden_can_bash_while_its_dorsal_mount_fires`
- `bearing_and_core_contacts_cannot_impersonate_a_Warden_shield_bash`
- `passive_shield_contact_cannot_impersonate_an_armed_bash`
- `specific_impulse_bash_is_mass_independent_and_does_not_double_apply_generic_shove`
- `the_Warden_turns_toward_both_lateral_opponent_signs_before_closing`
- `the_Twinblade_attacks_a_visible_unshielded_torso`
- `an_open_lane_Twinblade_cut_stays_inside_both_arm_limits_in_both_mirrors`
- `an_active_dual_cut_survives_one_frame_of_blocker_and_sight_flicker`
- `the_Swordbearer_reacquires_and_repeats_a_physical_sweep`
- `every_authored_morphology_closes_or_spaces_and_completes_two_attacks`
- `Arena_names_the_exact_Hold_authored_or_saved_program_that_is_running`

Mutation proof: restore Twinblade's blocker requirement; reverse one Warden turn sign; make the
Arbalest cut conditional on zero ammunition; give `bash` the dorsal group; remove the second attack
from the physical evidence checker. Each test must fail for the defect it names.

## Technical acceptance handed to Session 30

This session lands controller/Mind behavior on combat-v2 base bodies at durability `1.0`. In both
mirrors, every
morphology must show correct-sign turn or earned spacing, complete two physical attack admissions,
deal positive damage and stay inside support/self-clearance rules. Arbalest must demonstrate a bolt
and concurrent sword activity; crossbow Warden must demonstrate a bolt and a shield-bash shove.

Run all Session-30 durability rungs provisionally and require at least one passing rung for every
morphology before this session lands. Do not commit a production multiplier or publish the final
competitive claim here; Session 30 reruns the frozen matrix and owns its identities.

## Digest and evidence prediction

- Arbalest and Warden control digests move because Actions are added.
- All five edited authored program digests move.
- Twinblade and Swordbearer control digests must not move.
- Every blueprint digest moves because the root grammar becomes v4; Warden shield hardware changes
  in addition.
- Every morphology corpus, qualifier source/run identity and broad Construct qualification source
  fingerprint moves. No old outcome is copied into the new report.

## Verification

```powershell
node --test tests/construct-actions.test.mjs tests/construct-mind.test.mjs
node --test tests/construct-swordbearer-duelist.test.mjs tests/construct-twinblade-policy.test.mjs
node --test tests/construct-arbalest.test.mjs tests/construct-mounts.test.mjs
node scripts/construct-warrior-locomotion.mjs
node scripts/construct-warrior-curriculum.mjs --durability-ladder
node scripts/construct-warrior-curriculum.mjs --combined-arms --workers 8 --out .tools/construct-combined-arms-session27
node scripts/construct-warrior-curriculum.mjs
npm test
npm run check
npm run build
git diff --check -- .
```
