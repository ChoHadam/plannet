import { GridPosition } from '@/types/mandalart';
import { TimeOfDay, TodoColor } from '@/types/block6';

// Default color palette (pastel tones)
export const DEFAULT_COLORS: Record<GridPosition, string> = {
  'center': '#FEF3C7',      // Warm Yellow (amber-100)
  'top-left': '#DBEAFE',    // Blue (blue-100)
  'top': '#E0E7FF',         // Indigo (indigo-100)
  'top-right': '#EDE9FE',   // Violet (violet-100)
  'left': '#FCE7F3',        // Pink (pink-100)
  'right': '#D1FAE5',       // Green (emerald-100)
  'bottom-left': '#FEE2E2', // Red (red-100)
  'bottom': '#FED7AA',      // Orange (orange-200)
  'bottom-right': '#CFFAFE', // Cyan (cyan-100)
};

// Color presets for picker
export const COLOR_PRESETS = [
  '#FEF3C7', // amber
  '#FDE68A', // amber-200
  '#DBEAFE', // blue
  '#BFDBFE', // blue-200
  '#E0E7FF', // indigo
  '#C7D2FE', // indigo-200
  '#EDE9FE', // violet
  '#DDD6FE', // violet-200
  '#FCE7F3', // pink
  '#FBCFE8', // pink-200
  '#D1FAE5', // emerald
  '#A7F3D0', // emerald-200
  '#FEE2E2', // red
  '#FECACA', // red-200
  '#FED7AA', // orange
  '#FDBA74', // orange-300
  '#CFFAFE', // cyan
  '#A5F3FC', // cyan-200
  '#F3F4F6', // gray-100
  '#E5E7EB', // gray-200
];

// Storage key
export const STORAGE_KEY = 'plannet-mandalart';

// Block 6 time-based colors
export const BLOCK6_TIME_COLORS: Record<TimeOfDay, string> = {
  morning: '#FEF3C7',   // amber-100 (warm morning)
  afternoon: '#DBEAFE', // blue-100 (cool afternoon)
  evening: '#EDE9FE',   // violet-100 (calm evening)
};

// Block 6 time-based border colors (for visual emphasis)
export const BLOCK6_TIME_BORDER_COLORS: Record<TimeOfDay, string> = {
  morning: '#FCD34D',   // amber-300
  afternoon: '#93C5FD', // blue-300
  evening: '#C4B5FD',   // violet-300
};

// Todo item colors - bar color (left border)
export const TODO_COLOR_BAR: Record<TodoColor, string> = {
  none: 'transparent',
  red: '#EF4444',      // red-500
  orange: '#F97316',   // orange-500
  yellow: '#EAB308',   // yellow-500
  green: '#22C55E',    // green-500
  blue: '#3B82F6',     // blue-500
  purple: '#8B5CF6',   // violet-500
  pink: '#EC4899',     // pink-500
  gray: '#6B7280',     // gray-500
};

// Todo item colors - background color (light)
export const TODO_COLOR_BG: Record<TodoColor, string> = {
  none: 'transparent',
  red: '#FEF2F2',      // red-50
  orange: '#FFF7ED',   // orange-50
  yellow: '#FEFCE8',   // yellow-50
  green: '#F0FDF4',    // green-50
  blue: '#EFF6FF',     // blue-50
  purple: '#F5F3FF',   // violet-50
  pink: '#FDF2F8',     // pink-50
  gray: '#F9FAFB',     // gray-50
};

// Todo color labels (Korean)
export const TODO_COLOR_LABELS: Record<TodoColor, string> = {
  none: '없음',
  red: '빨강',
  orange: '주황',
  yellow: '노랑',
  green: '초록',
  blue: '파랑',
  purple: '보라',
  pink: '분홍',
  gray: '회색',
};

// Todo colors array for picker
export const TODO_COLORS: TodoColor[] = [
  'none', 'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'gray'
];

// Monthly planner colors
export const MONTHLY_COLORS = {
  goalProgress: '#3B82F6', // blue-500
  goalComplete: '#22C55E', // green-500
  today: '#EF4444',        // red-500
};
