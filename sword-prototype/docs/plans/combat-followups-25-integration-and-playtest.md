# Session 25 -- final integration, visible playtest and close-out

> **Corrections, 2026-08-26.**
>
> - **`npm run ai:preflight -- --seed ...` takes a contract digest, not a seed**, per session
>   20's specification. Nothing gives preflight a seed.
> - **The coverage lists omit the axe.** It is a `WEAPON_KINDS` entry the picker offers and
>   `sword+axe` is now a research loadout carried by 15 cells. Add the weapon to the playtest
>   list and the loadout to the matrix line.
> - **`--verify-promoted` does not exist**; see session 24.

## Entry gate

Session 24 is complete and adaptive-v1 is backed by the exact passing tournament artifact.

## Automated close-out

1. Exercise every buildable unit, shipped/promoted policy and compatible loadout through a
   complete bout, verdict, pause/resume, restart and disposal.
2. Compare an uninterrupted seeded fight with pauses inserted during walking, a committed
   strike, arrow flight and post-verdict settling.
3. Run the lifecycle audit across Warrior, Broot, Centipede, bows, shields, bare hands and the
   promoted artifact.
4. Recompute the tournament verdict from committed raw rows and verify every artifact pin,
   including the compute-contract and balance-config digests the promoted artifact ran under.
   If the game has moved since that run, say so in the promotion record rather than implying
   the tournament was fought under today's balance.
5. Run:

~~~powershell
npm ci
npm run texture:verify
npm run armour:verify
npm run asset:verify
npm test
npm run check
npm run build
npm run measure -- --seed 20260824
npm run ai:preflight
npm run ai:evaluate -- --verify-promoted
~~~

## Confirming visible playtest

Session 18 already played this game with the promotion instrument attached, and session 24
already fought the promoted controller. This is the confirmation pass over the whole shipped
surface, not the first look. Use an attached visible browser, not a hidden performance tab:

- pause/restart during live and decided bouts;
- middle-drag orbit and Shift+middle pan;
- direct crouch, lean, twist, wrist roll/bend and hand switching;
- arrow trace readability and shield/buckler interception;
- Warrior/Broot/Centipede silhouettes, armour seams and wall containment;
- adaptive engagement with sword, shield, bow, bare hands and bite;
- control -> subject -> control frame cost on two visible machines.

Record failures as new work; do not turn an open visual judgment into an automated pass.

## Close

Fold the final tournament, promoted artifact, playtest and performance evidence into README,
design, measurements and asset provenance. Delete every combat-followups plan and the handoff
in the same commit. The repository should retain durable facts, not a completed roadmap.
