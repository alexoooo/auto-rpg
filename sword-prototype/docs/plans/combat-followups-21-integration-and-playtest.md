# Session 21 -- final integration, visible playtest and close-out

## Entry gate

Session 20 is complete and adaptive-v1 is backed by the exact passing tournament artifact.

## Automated close-out

1. Exercise every buildable unit, shipped/promoted policy and compatible loadout through a
   complete bout, verdict, pause/resume, restart and disposal.
2. Compare an uninterrupted seeded fight with pauses inserted during walking, a committed
   strike, arrow flight and post-verdict settling.
3. Run the lifecycle audit across Warrior, Broot, Centipede, bows, shields, bare hands and the
   promoted artifact.
4. Recompute the tournament verdict from committed raw rows and verify every artifact pin.
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
npm run ai:options -- --seed 20260824
npm run ai:evaluate -- --verify-promoted
~~~

## Visible playtest

Use an attached visible browser, not a hidden performance tab:

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
