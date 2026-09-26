import { CellData, CENTER_TO_OUTER_MAP, GRID_POSITIONS, MandalartData } from '@/types/mandalart';

// A fixed export layout includes all 81 cells, irrespective of viewport or open mobile detail.
export const MANDALART_IMAGE = {
  cellSize: 104,
  cellGap: 2,
  gridPadding: 4,
  gridGap: 10,
  margin: 24,
  headingHeight: 56,
  scale: 2,
  fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif, "Apple Color Emoji", "Segoe UI Emoji"',
  background: '#f8fafc',
  text: '#334155',
  mutedText: '#64748b',
  completed: '#059669',
  highlight: '#fbbf24',
} as const;
const TEXT_PADDING = 8;
const LINE_HEIGHT = 1.25;
const FONT_FIT_STEPS = 12;
const GRID_SIDE = 3;
const { cellSize, cellGap, gridPadding, gridGap, margin, headingHeight, scale } = MANDALART_IMAGE;
const gridSize = GRID_SIDE * cellSize + (GRID_SIDE - 1) * cellGap + gridPadding * 2;
const imageWidth = GRID_SIDE * gridSize + (GRID_SIDE - 1) * gridGap + margin * 2;

function wrapText(context: CanvasRenderingContext2D, value: string, width: number): string[] {
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  const lines: string[] = [];
  for (const paragraph of value.replace(/\r\n?/g, '\n').split('\n')) {
    let line = '';
    let lineWidth = 0;
    // Keep emoji sequences and combining marks intact when breaking a line.
    for (const { segment } of segmenter.segment(paragraph)) {
      const segmentWidth = context.measureText(segment).width;
      if (line && lineWidth + segmentWidth > width) {
        lines.push(line);
        line = '';
        lineWidth = 0;
      }
      line += segment;
      lineWidth += segmentWidth;
    }
    lines.push(line);
  }
  return lines;
}

function drawText(
  context: CanvasRenderingContext2D, value: string, x: number, y: number,
  width: number, height: number, maxFontSize: number, bold = false, completed = false,
): void {
  if (!value) return;
  const font = (size: number) => `${bold ? 700 : 400} ${size}px ${MANDALART_IMAGE.fontFamily}`;
  let low = 0;
  let high = maxFontSize;
  let fontSize = maxFontSize;
  context.font = font(fontSize);
  let lines = wrapText(context, value, width);
  if (lines.length * fontSize * LINE_HEIGHT > height || lines.some(line => context.measureText(line).width > width)) {
    for (let attempt = 0; attempt < FONT_FIT_STEPS; attempt++) {
      fontSize = (low + high) / 2;
      context.font = font(fontSize);
      lines = wrapText(context, value, width);
      if (lines.length * fontSize * LINE_HEIGHT <= height && lines.every(line => context.measureText(line).width <= width)) low = fontSize;
      else high = fontSize;
    }
    fontSize = low;
    context.font = font(fontSize);
    lines = wrapText(context, value, width);
  }
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  const lineHeight = fontSize * LINE_HEIGHT;
  const top = y + (height - lines.length * lineHeight) / 2;
  lines.forEach((line, index) => {
    const lineY = top + (index + 0.5) * lineHeight;
    context.fillText(line, x + width / 2, lineY);
    if (completed && line) {
      const lineWidth = Math.min(context.measureText(line).width, width);
      context.fillRect(x + (width - lineWidth) / 2, lineY, lineWidth, Math.max(0.6, fontSize / 14));
    }
  });
}

function drawCell(context: CanvasRenderingContext2D, cell: CellData, x: number, y: number, color: string, isGoal: boolean): void {
  context.fillStyle = color;
  context.fillRect(x, y, cellSize, cellSize);
  context.strokeStyle = '#cbd5e1';
  context.lineWidth = 0.5;
  context.strokeRect(x, y, cellSize, cellSize);
  context.save();
  context.beginPath();
  context.rect(x + 1, y + 1, cellSize - 2, cellSize - 2);
  context.clip();
  const iconHeight = cell.icon ? 32 : 0;
  context.fillStyle = cell.completed ? MANDALART_IMAGE.mutedText : MANDALART_IMAGE.text;
  if (cell.icon) drawText(context, cell.icon, x + TEXT_PADDING, y + TEXT_PADDING, cellSize - TEXT_PADDING * 2, iconHeight, 26);
  drawText(context, cell.value, x + TEXT_PADDING, y + TEXT_PADDING + iconHeight,
    cellSize - TEXT_PADDING * 2, cellSize - TEXT_PADDING * 2 - iconHeight, isGoal ? 14 : 12, isGoal, cell.completed);
  if (cell.completed) {
    context.fillStyle = MANDALART_IMAGE.completed;
    context.font = `bold 12px ${MANDALART_IMAGE.fontFamily}`;
    context.fillText('✓', x + 8, y + 9);
  }
  context.restore();
}

/** Uses plan data and the browser's Canvas API: no DOM clone, iframe or CSS color parser. */
export async function renderMandalartImage(data: MandalartData): Promise<HTMLCanvasElement> {
  await document.fonts.ready;
  const canvas = document.createElement('canvas');
  canvas.width = imageWidth * scale;
  canvas.height = (imageWidth + headingHeight) * scale;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable');
  context.scale(scale, scale);
  context.fillStyle = MANDALART_IMAGE.background;
  context.fillRect(0, 0, imageWidth, imageWidth + headingHeight);
  context.fillStyle = MANDALART_IMAGE.text;
  drawText(context, data.title || '만다라트', margin, margin / 2, imageWidth - margin * 2, headingHeight, 24, true);

  GRID_POSITIONS.forEach((gridId, gridIndex) => {
    const grid = data.grids.find(item => item.id === gridId);
    if (!grid) throw new Error('Incomplete Mandalart');
    const x = margin + (gridIndex % GRID_SIDE) * (gridSize + gridGap);
    const y = margin + headingHeight + Math.floor(gridIndex / GRID_SIDE) * (gridSize + gridGap);
    context.fillStyle = grid.color;
    context.fillRect(x, y, gridSize, gridSize);
    for (let position = 0; position < GRID_SIDE * GRID_SIDE; position++) {
      const cell = grid.cells.find(item => item.position === position);
      if (!cell) throw new Error('Incomplete Mandalart');
      const color = gridId === 'center' && position !== 4
        ? data.grids.find(item => item.id === CENTER_TO_OUTER_MAP[position])?.color ?? grid.color
        : grid.color;
      const cellX = x + gridPadding + (position % GRID_SIDE) * (cellSize + cellGap);
      const cellY = y + gridPadding + Math.floor(position / GRID_SIDE) * (cellSize + cellGap);
      drawCell(context, cell, cellX, cellY, color, gridId === 'center' || position === 4);
      if (gridId === 'center' && position === 4) {
        context.strokeStyle = MANDALART_IMAGE.highlight;
        context.lineWidth = 2;
        context.strokeRect(cellX + 1, cellY + 1, cellSize - 2, cellSize - 2);
      }
    }
  });
  return canvas;
}
