import { targetBench } from "../tests/harness/effector-target-bench.mjs";
console.log("Harness: Node/Havok effector stand, awake bodies, fixed solver clock; seconds=3, anatomical blade.");
for (const slot of ["primary", "secondary"]) {
  for (const options of [{}, { speed: .25 }, { speed: 0 }, { force: 0 }]) {
    const result = await targetBench({ slot, yaw: .7, ...options });
    console.log(JSON.stringify({ slot, ...options, tipError: result.tipError, commandError: result.commandError,
      orientationError: result.orientationError, peakAxisRate: result.peakAxisRate, withinStops: result.withinStops }));
  }
}
