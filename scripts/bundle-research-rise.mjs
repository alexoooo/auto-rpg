import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

// Keep the policy inputs, without rollout diagnostics or duplicate parent references.
const configuration = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const sources = [];
const read = file => {
  const bytes = readFileSync(file);
  sources.push({ sha256: createHash('sha256').update(bytes).digest('hex') });
  return JSON.parse(gunzipSync(bytes));
};
const pick = (value, keys) => Object.fromEntries(keys.filter(k => value[k] !== undefined).map(k => [k, value[k]]));
const reference = (r, response) => ({
  ...pick(r, ['release', 'rootUp', 'joints']),
  frames: r.frames.map(f => pick(f, ['kind', 'velocity', 'activation', 'handPoses', 'angles', 'speeds', 'gravity', 'up', 'height', 'loads', 'rootMotion'])),
  ...(response ? { responseMeasurement: { configuration: { rootMotion: r.responseMeasurement?.configuration.rootMotion ?? false } }, responses: r.responses } : {}),
});
const bundle = c => {
  const r = read(c.reference);
  return { kind: c.kind, parameters: c.parameters, channels: r.identity.channels.map(c => c.name),
    reference: c.kind === 'library' ? { references: r.references.map((r, i) => reference(r, c.parameters.controllers?.[i]?.kind === 'response')) }
      : reference(r, false) };
};
const data = { default: bundle(configuration), bodies: Object.fromEntries(Object.entries(configuration.bodies ?? {}).map(([k, c]) => [k, bundle(c)])) };
// An opaque payload avoids expanding millions of measured numbers into TypeScript literal types.
writeFileSync(process.argv[3], JSON.stringify({ sources, payload: JSON.stringify(data) }) + '\n');
