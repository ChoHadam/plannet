import { PlanCategory } from './mandalart';

// Day of week types
export type DayOfWeek = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

// Block number (1-6 per day)
export type BlockNumber = 1 | 2 | 3 | 4 | 5 | 6;

// Time of day classification
export type TimeOfDay = 'morning' | 'afternoon' | 'evening';

// Day labels in Korean
export const DAY_LABELS: Record<DayOfWeek, string> = {
  mon: '월',
  tue: '화',
  wed: '수',
  thu: '목',
  fri: '금',
  sat: '토',
  sun: '일',
};

// Days of week in order
export const DAYS_OF_WEEK: DayOfWeek[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

// Block to time of day mapping
export const BLOCK_TIME_OF_DAY: Record<BlockNumber, TimeOfDay> = {
  1: 'morning',
  2: 'morning',
  3: 'afternoon',
  4: 'afternoon',
  5: 'evening',
  6: 'evening',
};

// Time of day labels in Korean
export const TIME_OF_DAY_LABELS: Record<TimeOfDay, string> = {
  morning: '오전',
  afternoon: '오후',
  evening: '저녁',
};

// Todo item within a block
export interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
}

// Individual block data
export interface BlockData {
  id: string;
  blockNumber: BlockNumber;
  day: DayOfWeek;
  keyword: string;
  todos: TodoItem[];
  color?: string;
}

// Block 6 plan data
export interface Block6Data {
  id: string;
  title: string;
  category: PlanCategory;
  template: 'block6';
  blocks: BlockData[]; // 42 blocks (7 days x 6 blocks)
  backlog: TodoItem[]; // Unassigned todos (drag source)
  year?: number;
  month?: number;
  week?: number;
  day?: number;
  createdAt: string;
  updatedAt: string;
}

// Helper function to get block by day and number
export function getBlock(blocks: BlockData[], day: DayOfWeek, blockNumber: BlockNumber): BlockData | undefined {
  return blocks.find((b) => b.day === day && b.blockNumber === blockNumber);
}

// Helper function to get blocks by time of day
export function getBlocksByTimeOfDay(blocks: BlockData[], timeOfDay: TimeOfDay): BlockData[] {
  return blocks.filter((b) => BLOCK_TIME_OF_DAY[b.blockNumber] === timeOfDay);
}

// Helper function to get blocks by day
export function getBlocksByDay(blocks: BlockData[], day: DayOfWeek): BlockData[] {
  return blocks.filter((b) => b.day === day).sort((a, b) => a.blockNumber - b.blockNumber);
}
