import { sanitizeInput } from './sanitize';
import { CellData, CellSchedule, GRID_POSITIONS, GridPosition, MandalartData, PlanCategory, SubGridData } from '@/types/mandalart';

export const MAX_MANDALART_JSON_BYTES = 2 * 1024 * 1024;
export const MAX_MANDALART_TEXT_LENGTH = 16_384;
const MAX_JSON_DEPTH = 12;
const MAX_OBJECT_KEYS = 64;
const MAX_ARRAY_LENGTH = 200;
const MAX_ID_LENGTH = 128;
const MAX_ICON_LENGTH = 128;
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const CATEGORIES: PlanCategory[] = ['annual', 'monthly', 'weekly', 'daily'];

export class MandalartImportError extends Error {
  constructor(message = '유효하지 않은 만다라트 파일입니다.') {
    super(message);
    this.name = 'MandalartImportError';
  }
}

function requireValid(condition: unknown): asserts condition {
  if (!condition) throw new MandalartImportError();
}

function record(value: unknown): Record<string, unknown> {
  requireValid(value !== null && typeof value === 'object' && !Array.isArray(value));
  return value as Record<string, unknown>;
}

// Bound unknown extension fields too, while retaining them for newer export formats.
function validateTree(value: unknown, depth = 0): void {
  requireValid(depth <= MAX_JSON_DEPTH);
  if (typeof value === 'string') requireValid(value.length <= MAX_MANDALART_TEXT_LENGTH);
  else if (typeof value === 'number') requireValid(Number.isFinite(value));
  else if (Array.isArray(value)) {
    requireValid(value.length <= MAX_ARRAY_LENGTH);
    value.forEach(item => validateTree(item, depth + 1));
  } else if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value);
    requireValid(entries.length <= MAX_OBJECT_KEYS);
    for (const [key, item] of entries) {
      requireValid(!FORBIDDEN_KEYS.has(key) && key.length <= MAX_ID_LENGTH);
      validateTree(item, depth + 1);
    }
  } else requireValid(value === null || typeof value === 'boolean');
}

function text(value: unknown, maxLength = MAX_MANDALART_TEXT_LENGTH): string {
  requireValid(typeof value === 'string' && value.length <= maxLength);
  return value;
}

function integer(value: unknown, min: number, max: number): number {
  requireValid(typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max);
  return value;
}

function date(value: unknown): string {
  const result = text(value, 10);
  requireValid(/^\d{4}-\d{2}-\d{2}$/.test(result));
  const parsed = new Date(`${result}T00:00:00.000Z`);
  requireValid(Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === result);
  return result;
}

function timestamp(value: unknown): string {
  const result = text(value, 40);
  requireValid(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(result));
  date(result.slice(0, 10));
  requireValid(Number.isFinite(Date.parse(result)));
  return result;
}

function numberList(value: unknown, min: number, max: number): number[] {
  requireValid(Array.isArray(value) && value.length <= max - min + 1);
  const numbers = value.map(item => integer(item, min, max));
  requireValid(new Set(numbers).size === numbers.length);
  return numbers;
}

function schedule(value: unknown): CellSchedule {
  const input = record(value);
  const output: CellSchedule = { ...input };
  if ('targetMonths' in input) output.targetMonths = numberList(input.targetMonths, 1, 12);
  if ('repeatDays' in input) output.repeatDays = numberList(input.repeatDays, 0, 6);
  if ('startDate' in input) output.startDate = date(input.startDate);
  if ('endDate' in input) output.endDate = date(input.endDate);
  if (output.startDate && output.endDate) requireValid(output.startDate <= output.endDate);
  if ('repeat' in input) {
    requireValid(input.repeat === 'daily' || input.repeat === 'weekly' || input.repeat === 'monthly');
    output.repeat = input.repeat;
  }
  return output;
}

function cell(value: unknown, gridId: GridPosition): CellData {
  const input = record(value);
  const position = integer(input.position, 0, 8);
  // IDs are used to address cells by grid and position in Monthly integration.
  requireValid(input.id === `${gridId}-${position}`);
  const output: CellData = { ...input, id: input.id, position, value: sanitizeInput(text(input.value)) };
  if ('completed' in input) {
    requireValid(typeof input.completed === 'boolean');
    output.completed = input.completed;
  }
  if ('icon' in input) output.icon = sanitizeInput(text(input.icon, MAX_ICON_LENGTH));
  if ('schedule' in input) output.schedule = schedule(input.schedule);
  if ('isDaily' in input) {
    requireValid(typeof input.isDaily === 'boolean');
    // Pre-schedule backups used isDaily. Never replace an explicit newer schedule.
    if (input.isDaily && !output.schedule) output.schedule = { repeat: 'daily' };
  }
  return output;
}

function grid(value: unknown): SubGridData {
  const input = record(value);
  const id = GRID_POSITIONS.find(position => position === input.id);
  requireValid(id !== undefined);
  requireValid(Array.isArray(input.cells) && input.cells.length === 9);
  const cells = input.cells.map(item => cell(item, id));
  requireValid(new Set(cells.map(item => item.position)).size === 9);
  // Store actions address cells by array index. Restore shuffled files by their positions.
  cells.sort((a, b) => a.position - b.position);
  const color = text(input.color, 9);
  requireValid(/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(color));
  return { ...input, id, cells, color };
}

/** Validates before returning anything a store can apply. No source mutation. */
export function validateMandalartImport(value: unknown): MandalartData {
  validateTree(value);
  const input = record(value);
  const id = text(input.id, MAX_ID_LENGTH);
  requireValid(/^[a-z\d][a-z\d._:-]*$/i.test(id));
  const category = input.category === undefined ? 'annual' : CATEGORIES.find(item => item === input.category);
  requireValid(category !== undefined);
  requireValid(input.template === undefined || input.template === 'mandalart');
  requireValid(Array.isArray(input.grids) && input.grids.length === GRID_POSITIONS.length);
  const grids = input.grids.map(grid);
  requireValid(new Set(grids.map(item => item.id)).size === GRID_POSITIONS.length);
  const output: MandalartData = {
    ...input,
    id,
    title: sanitizeInput(text(input.title)),
    category,
    template: 'mandalart',
    grids,
    createdAt: timestamp(input.createdAt),
    updatedAt: timestamp(input.updatedAt),
  };
  if ('year' in input) output.year = integer(input.year, 1, 9999);
  if ('month' in input) output.month = integer(input.month, 1, 12);
  // Legacy exports can contain ISO week numbers; newer exports use weeks of a month.
  if ('week' in input) output.week = integer(input.week, 1, 53);
  if ('day' in input) output.day = integer(input.day, 1, 31);
  if (output.month && output.day) {
    const year = output.year ?? 2000;
    date(`${String(year).padStart(4, '0')}-${String(output.month).padStart(2, '0')}-${String(output.day).padStart(2, '0')}`);
  }
  return output;
}

export function parseMandalartJSON(source: string): MandalartData {
  if (source.length > MAX_MANDALART_JSON_BYTES || new TextEncoder().encode(source).byteLength > MAX_MANDALART_JSON_BYTES) {
    throw new MandalartImportError('파일은 2MB 이하여야 합니다.');
  }
  try {
    const value: unknown = JSON.parse(source);
    return validateMandalartImport(value);
  } catch (error) {
    if (error instanceof MandalartImportError) throw error;
    throw new MandalartImportError();
  }
}
