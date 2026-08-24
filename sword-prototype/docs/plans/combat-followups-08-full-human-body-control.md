# Session 08 -- the human can own every anatomical command

## Outcome

A player may opt into direct control of crouch, trunk lean/twist, driven-hand roll and wrist
bend. The policy still controls the spare hand. Takeover and hand swap seed every newly owned
channel from the achieved body so control never snaps.

## Implement

1. At `src/input.ts:50-90`, keep the existing `InputState` shape and add host-only
   `HumanOwnership`; do not put ownership metadata in `Intent`. Implement this mapping:

   | input | command |
   | --- | --- |
   | Left Shift held | crouch 1; released returns toward 0 |
   | Arrow Up / Down | trunk lean + / - |
   | Arrow Left / Right | trunk twist - / + |
   | Z / X | driven-hand roll - / + |
   | T / Y | driven-hand wrist bend down / up within 0..1 |

   All axes slew at named rates in `CONFIG.controls`; no key teleports a joint target.
2. At `src/mind.ts:427`, extend `splitMind(person, policy, ownership)` with one total leaf
   table. Human owns locomotion, posture and every channel of the driven hand when enabled;
   policy owns the spare hand. With direct posture/wrist disabled, preserve today's AI assist.
3. At takeover seeding in `src/main.ts:250-290` and `:540-580`, seed crouch, lean, twist,
   roll and bend from `FighterView`/achieved poses. Add only view fields with immediate readers;
   update both handwritten fixtures named in `AGENTS.md`.
4. Add a small mid-fight controls panel/toggle in `index.html` so the player can switch
   direct posture/wrist ownership without a console. Move the `G` rig key only if the chosen
   wrist mapping conflicts; the table above deliberately uses T/Y to avoid that conflict.
5. Update README/help and expose read-only ownership/current normalized axes in `window.__sword`.

## Tests first

In `tests/minds.test.mjs`, input and handover tests add:

- `human_play_owns_posture_and_every_channel_of_the_driven_hand_when_enabled`
- `ai_assist_remains_the_owner_when_direct_body_control_is_disabled`
- `posture_keys_cover_both_signs_and_clamp_at_anatomical_limits`
- `wrist_keys_reach_but_never_cross_roll_and_bend_stops`
- `taking_over_a_crouched_twisted_body_seeds_every_human_channel_without_a_jump`
- `swapping_hands_changes_only_which_wrist_the_controls_address`
- `the_spare_hand_remains_policy_controlled`

Use an exhaustive sentinel with a distinct human and policy value in every `Intent` leaf.
Delete one ownership assignment and reverse one sign; the sentinel and paired-direction test
must fail.

## Acceptance

From Fixed and Overhead cameras, stand/crouch, lean and twist to both limits while keeping the
cursor centred; then roll/bend each hand, swap, take over both sides and toggle AI assist.
Hips stay the locomotion reference, the cursor target remains world-vertical/body-relative,
and no channel jumps at ownership changes.

```powershell
npm test
npm run check
npm run build
npm run measure -- --only posture --seed 20260824
```
