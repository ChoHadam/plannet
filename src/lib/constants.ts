import { GridPosition } from '@/types/mandalart';

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
