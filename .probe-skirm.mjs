const rate = Number(process.argv[2]);
const cfg = await import("./src/golem/config.ts");
cfg.TORSO_WAIST.twistRate = rate;
const { freshHavok, runBout } = await import("./tests/harness/bout-runner.mjs");
const { defaultGolemSetup } = await import("./src/golem/build.ts");
const { golemSkirmisher, SKIRMISHER } = await import("./src/golem/styles/skirmisher.ts");
const { golemFencer } = await import("./src/golem/tactics-v2.ts");
const setup = defaultGolemSetup();
const SEEDS = [20260904, 20260911, 20260918, 20260925, 20261002];
let L = 0, R = 0, seedsBack = 0;
for (const seed of SEEDS) {
  const back = { left: 0, right: 0 };
  const skirm = golemSkirmisher(seed, SKIRMISHER);
  const fenc = golemFencer(seed + 17);
  runBout({
    left: "golem-skirmisher", right: "golem-fencer", leftUnit: "golem", rightUnit: "golem",
    leftGolem: setup, rightGolem: setup, locomotionMode: "supported",
    seeds: [seed, seed + 17], maxSeconds: 20, physics: await freshHavok(),
    leftMind: { name: "s", decide: (v, dt) => {
      const i = skirm.decide(v, dt); if (i.forward < 0) back.left += 1; return i; } },
    rightMind: { name: "f", decide: (v, dt) => {
      const i = fenc.decide(v, dt); if (i.forward < 0) back.right += 1; return i; } },
  });
  L += back.left; R += back.right;
  if (back.left > back.right) seedsBack += 1;
}
console.log(`twistRate ${rate}: skirmisher ${L} vs fencer ${R}, ratio `
  + `${(L / Math.max(1, R)).toFixed(3)}, seeds where it backed off more ${seedsBack}/${SEEDS.length}`);
