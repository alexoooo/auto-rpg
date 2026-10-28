/**
 * The learning server's speed: a stand-in trainer that runs `run-learning-server.mjs` on a
 * configuration, sends every environment a random steer at each message for `seconds`, and prints
 * the decisions a second and each message's wait, ms (median, 90th and 99th per cent, the longest).
 * The steers are a fixed sequence, so two readings differ by the code and the machine alone.
 *
 *   node research/learning-speed.mjs <configuration.json> [seconds = 30]
 */
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

const [configuration, seconds = '30'] = process.argv.slice(2);
if (!configuration) throw new Error('usage: node research/learning-speed.mjs <configuration.json> [seconds]');
const server = spawn(process.execPath, ['research/run-learning-server.mjs', configuration], { stdio: ['pipe', 'pipe', 'inherit'] });
const lines = createInterface({ input: server.stdout })[Symbol.asyncIterator]();
const next = async () => {
  const answer = JSON.parse((await lines.next()).value);
  if (answer.error) throw new Error(answer.error);
  return answer;
};
const send = (message) => server.stdin.write(JSON.stringify(message) + '\n');

const ready = await next(), environments = ready.workers, size = ready.ready[0].actionSize;
send({ op: 'reset' });
await next();
let random = 1;
const uniform = () => (random = (Math.imul(random, 1664525) + 1013904223) >>> 0) / 4294967296;
const waits = [], start = performance.now();
while (performance.now() - start < Number(seconds) * 1000) {
  const sent = performance.now();
  send({ op: 'step', actions: Array.from({ length: environments }, () => Array.from({ length: size }, () => uniform() * 2 - 1)) });
  await next();
  waits.push(performance.now() - sent);
}
const total = performance.now() - start, decisions = waits.length * environments;
waits.sort((a, b) => a - b);
const at = (share) => +waits[Math.floor(share * (waits.length - 1))].toFixed(1);
console.log(JSON.stringify({ environments, decisions, perSecond: Math.round(decisions / total * 1000), wait: { median: at(.5), p90: at(.9), p99: at(.99), longest: at(1) } }));
send({ op: 'close' });
await next();
