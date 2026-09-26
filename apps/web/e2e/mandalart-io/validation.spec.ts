import { test, expect } from '@playwright/test';
import { MAX_MANDALART_JSON_BYTES, MAX_MANDALART_TEXT_LENGTH, parseMandalartJSON } from '../../src/lib/mandalartImport';
import { planFixture } from './fixtures';

test('current JSON roundtrip preserves dates, colors, schedules, icons and completion', () => {
  const plan = planFixture();
  expect(parseMandalartJSON(JSON.stringify(plan))).toEqual(plan);
});

test('original backup and isDaily migrate while retaining explicit schedule and extension fields', () => {
  const input = JSON.parse(JSON.stringify(planFixture()));
  delete input.category;
  delete input.template;
  input.futureSetting = { mode: 'extra' };
  input.grids[0].cells[0].isDaily = true;
  input.grids[0].cells[6].isDaily = true;
  input.grids[0].cells[0].note = 'extra';
  const output = parseMandalartJSON(JSON.stringify(input));
  expect(output.category).toBe('annual');
  expect(output.template).toBe('mandalart');
  expect(output.grids[0].cells[0].schedule).toEqual({ repeat: 'daily' });
  expect(output.grids[0].cells[6].schedule).toEqual(input.grids[0].cells[6].schedule);
  expect(JSON.parse(JSON.stringify(output)).futureSetting).toEqual({ mode: 'extra' });
  expect(JSON.parse(JSON.stringify(output)).grids[0].cells[0].note).toBe('extra');
  expect(parseMandalartJSON(JSON.stringify(output))).toEqual(output);
});

test('shuffled cells normalize positions without losing IDs or content', () => {
  const plan = planFixture();
  plan.grids.forEach(grid => grid.cells.reverse());
  expect(parseMandalartJSON(JSON.stringify(plan))).toEqual(planFixture());
});

const invalid: [string, (plan: ReturnType<typeof planFixture>) => unknown][] = [
  ['root', () => []], ['null', () => null], ['missing title', plan => ({ ...plan, title: undefined })],
  ['title type', plan => ({ ...plan, title: 42 })], ['ID', plan => ({ ...plan, id: '<img>' })],
  ['template', plan => ({ ...plan, template: 'monthly' })], ['category', plan => ({ ...plan, category: 'other' })],
  ['missing grids', plan => ({ ...plan, grids: [] })], ['duplicate grids', plan => ({ ...plan, grids: plan.grids.map(() => plan.grids[0]) })],
  ['grid type', plan => ({ ...plan, grids: [null, ...plan.grids.slice(1)] })],
  ['missing cell', plan => { plan.grids[0].cells.pop(); return plan; }],
  ['duplicate cell', plan => { plan.grids[0].cells[1] = plan.grids[0].cells[0]; return plan; }],
  ['cell ID', plan => { plan.grids[0].cells[0].id = 'other'; return plan; }],
  ['value', plan => ({ ...plan, grids: plan.grids.map(grid => ({ ...grid, cells: grid.cells.map(cell => ({ ...cell, value: {} })) })) })],
  ['completion', plan => ({ ...plan, grids: plan.grids.map(grid => ({ ...grid, cells: grid.cells.map(cell => ({ ...cell, completed: 'yes' })) })) })],
  ['color', plan => { plan.grids[0].color = 'url(javascript:alert(1))'; return plan; }],
  ['timestamp', plan => ({ ...plan, createdAt: '2026-02-30T00:00:00.000Z' })],
  ['impossible date', plan => ({ ...plan, month: 2, day: 30 })], ['month', plan => ({ ...plan, month: 13 })],
  ['week', plan => ({ ...plan, week: 54 })], ['day', plan => ({ ...plan, day: 0 })],
  ['huge cell', plan => { plan.grids[0].cells[0].value = 'x'.repeat(MAX_MANDALART_TEXT_LENGTH + 1); return plan; }],
];
for (const [label, change] of invalid) test(`rejects invalid ${label}`, () => expect(() => parseMandalartJSON(JSON.stringify(change(planFixture())))).toThrow());
for (const schedule of [null, [], { repeat: 'yearly' }, { repeatDays: [7] }, { repeatDays: [1, 1] }, { targetMonths: [0] }, { startDate: '2026-02-30' }, { startDate: '2026-12-01', endDate: '2026-01-01' }]) {
  test(`rejects schedule ${JSON.stringify(schedule)}`, () => {
    const plan = planFixture();
    const input = { ...plan, grids: plan.grids.map(grid => ({ ...grid, cells: grid.cells.map(cell => ({ ...cell, schedule })) })) };
    expect(() => parseMandalartJSON(JSON.stringify(input))).toThrow();
  });
}

test('rejects truncated, oversized, deeply nested and prototype-key JSON', () => {
  expect(() => parseMandalartJSON('{"grids":[')).toThrow();
  expect(() => parseMandalartJSON(' '.repeat(MAX_MANDALART_JSON_BYTES + 1))).toThrow(/2MB/);
  expect(() => parseMandalartJSON(JSON.stringify({ ...planFixture(), extra: '한'.repeat(MAX_MANDALART_JSON_BYTES / 2) }))).toThrow(/2MB/);
  expect(() => parseMandalartJSON('{"__proto__":{"polluted":true}}')).toThrow();
  expect(() => parseMandalartJSON('{"constructor":{}}')).toThrow();
  let nested: unknown = 'end';
  for (let i = 0; i < 20; i++) nested = { nested };
  expect(() => parseMandalartJSON(JSON.stringify({ ...planFixture(), nested }))).toThrow();
  expect({}).not.toHaveProperty('polluted');
});
