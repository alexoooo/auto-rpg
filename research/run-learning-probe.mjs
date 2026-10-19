// Checks the learned run's environment: a restored start replays to the bit, and zero steer runs the clip run.
import { runEnvironment } from './run-learning-environment.mjs';
const t0 = performance.now();
const e = await runEnvironment({ seed: 3 });
console.log('built', ((performance.now() - t0) / 1000).toFixed(1), 's');
const roll = (n) => { const out = []; for (let i = 0; i < n; i++) { const r = e.step(Array(e.actionSize).fill(0)); out.push(r.observation.join(',')); if (r.terminated || r.truncated) break; } return out; };
const a = (e.reset({ start: 2, command: 4.5 }), roll(60)), b = (e.reset({ start: 0, command: 3 }), roll(30), e.reset({ start: 2, command: 4.5 }), roll(60));
console.log('replays to the bit', a.length === b.length && a.every((x, i) => x === b[i]));
const t1 = performance.now(); let n = 0, ret = 0, falls = 0;
for (let ep = 0; ep < 6; ep++) { e.reset(); for (;;) { const r = e.step(Array(e.actionSize).fill(0)); n++; if (r.terminated || r.truncated) { ret += r.info.returned; falls += r.info.down ? 1 : 0; console.log('episode', ep, 'command', r.info.command.toFixed(2), 'along', r.info.along.toFixed(2), 'steps', r.info.steps, 'down', r.info.down, 'walked', r.info.walked, 'return', r.info.returned.toFixed(1)); break; } } }
console.log('decisions/s', (n / ((performance.now() - t1) / 1000)).toFixed(0));
e.dispose();
