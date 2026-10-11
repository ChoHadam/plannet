// Node microbenchmark of PlannerSync.capture() with synthetic Daily plans (20 todos each). Not browser INP.
// Usage: node e2e/performance/capture-benchmark.mjs [out.json] [plannerSync.ts path, default: current source]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ts = createRequire(import.meta.url)(path.resolve(webDir, '../../node_modules/typescript'));
const source = fs.readFileSync(process.argv[3] || path.join(webDir, 'src/lib/plannerSync.ts'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const context = { exports: {}, setTimeout, clearTimeout, structuredClone, TextEncoder, console };
vm.runInNewContext(code, context);
const { PlannerSync } = context.exports;

const COUNTS = [10, 100, 1000];
const TODOS = 20;
const WARMUP = 5;
const SAMPLES = 30;
const TIME = '2026-09-30T00:00:00.000Z';
const USER = '11111111-1111-4111-8111-111111111111';

const record = (i) => ({
  kind: 'daily', id: `s${i}`, schemaVersion: 1, version: 1, deleted: false, updatedAt: TIME,
  data: {
    id: `s${i}`, title: `Synthetic ${i}`, template: 'daily', category: 'daily', year: 2026, month: 9, day: 30, memo: 'synthetic text',
    todos: Array.from({ length: TODOS }, (_, j) => ({ id: `t${i}-${j}`, text: `Synthetic task ${j}`, completed: false })),
    createdAt: TIME, updatedAt: TIME,
  },
});

/**
 * shared: store objects are the ones apply() handed over (the app after load: unchanged plans keep identity).
 * copied: every store object is a distinct copy of the DB record (worst case, e.g. after a wholesale replacement).
 */
async function run(count, mode) {
  const records = Array.from({ length: count }, (_, i) => record(i));
  let applied = [];
  const sync = new PlannerSync(USER, {
    read: async () => structuredClone(records),
    commit: async () => { throw new Error('offline benchmark'); },
    apply: (documents) => { applied = documents; },
    onStatus: () => {},
    newRequestId: () => USER,
  });
  await sync.start();
  let documents = mode === 'shared' ? applied.map((d) => ({ ...d })) : applied.map((d) => ({ ...d, data: structuredClone(d.data) }));
  const samples = [];
  for (let i = 0; i < WARMUP + SAMPLES; i++) {
    // One keystroke: the edited plan is a new object, the others are unchanged.
    documents = [{ ...documents[0], data: { ...documents[0].data, title: `changed-${i}` } }, ...documents.slice(1)];
    const start = performance.now();
    sync.capture(documents);
    const duration = performance.now() - start;
    if (i >= WARMUP) samples.push(duration);
  }
  const drafts = sync.getSnapshot().drafts;
  sync.stop();
  if (drafts.length !== 1 || drafts[0].data.title !== `changed-${WARMUP + SAMPLES - 1}`) throw new Error('capture lost the edit');
  samples.sort((a, b) => a - b);
  const pick = (q) => +samples[Math.min(samples.length - 1, Math.floor(q * samples.length))].toFixed(3);
  return { mode, records: count, todosPerRecord: TODOS, samples: samples.length, medianMs: pick(0.5), p95Ms: pick(0.95), jsonBytes: Buffer.byteLength(JSON.stringify(records)) };
}

const results = [];
for (const mode of ['shared', 'copied']) for (const count of COUNTS) results.push(await run(count, mode));
const output = { runtime: `node ${process.version}`, cpu: os.cpus()[0]?.model, results };
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(output, null, 2));
console.log(JSON.stringify(output));
